const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdir, mkdtemp, lstat, realpath, rm } = require('node:fs/promises');
const { createServer } = require('node:net');
const { resolve, join } = require('node:path');
const { randomBytes } = require('node:crypto');

const root = resolve(__dirname, '../..');
const binary = join(root, 'pocketbase/bin/pocketbase');
const runtime = '/tmp/kankaku-hub-last-activity-disposable';
const env = { PATH: '/usr/bin:/bin', TZ: 'UTC' };

async function command(args) {
  const child = spawn(binary, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'ignore'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  const [code] = await once(child, 'close');
  assert.equal(code, 0, 'PocketBase setup command failed (output suppressed)');
  return output;
}

async function unusedPort() {
  const server = createServer();
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  const port = server.address().port;
  await new Promise((ok, fail) => server.close((error) => error ? fail(error) : ok()));
  if (port === 3000 || port === 8090) return unusedPort();
  return port;
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, 'close');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await closed; } finally { clearTimeout(timer); }
}

test('GET /api/kankaku/last-activity is anonymous and exposes only the latest timestamp', { timeout: 90000 }, async () => {
  assert.match(await command(['--version']), /\b0\.40\.4\b/, 'Requires pinned PocketBase 0.40.4');
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  const info = await lstat(runtime);
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'Runtime must be a real directory');
  assert.equal(await realpath(runtime), join(await realpath('/tmp'), 'kankaku-hub-last-activity-disposable'));
  const fixture = await mkdtemp(join(runtime, 'owned-'));
  let child;
  try {
    const flags = [
      `--dir=${join(fixture, 'data')}`,
      `--migrationsDir=${join(root, 'pocketbase/pb_migrations')}`,
      `--hooksDir=${__dirname}`,
    ];
    const password = randomBytes(24).toString('hex');
    const adminEmail = 'la-superuser@example.invalid';
    await command(['superuser', 'upsert', adminEmail, password, ...flags]);
    const port = await unusedPort();
    const base = `http://127.0.0.1:${port}`;
    child = spawn(binary, ['serve', `--http=127.0.0.1:${port}`, `--publicDir=${join(fixture, 'public')}`, ...flags],
      { cwd: fixture, env, stdio: 'ignore' });
    let startupError = false;
    child.on('error', () => { startupError = true; });
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      assert.ok(!startupError && child.exitCode === null, 'Disposable PocketBase failed to start');
      try {
        const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(300), redirect: 'error' });
        if (response.ok) { ready = true; break; }
      } catch (_) { /* wait for our local child */ }
      await new Promise((ok) => setTimeout(ok, 100));
    }
    assert.ok(ready, 'Disposable PocketBase readiness timeout');

    async function api(path, method, body, token, expected = 200) {
      const response = await fetch(base + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      assert.equal(response.status, expected, `${method} ${path}: unexpected HTTP status`);
      return response;
    }
    const json = async (...args) => (await api(...args)).json();
    const admin = (await json('/api/collections/_superusers/auth-with-password', 'POST',
      { identity: adminEmail, password })).token;
    const email = 'la-owner@example.invalid';
    await json('/api/collections/users/records', 'POST', { email, password, passwordConfirm: password, role: 'owner' }, admin);
    const owner = (await json('/api/collections/users/auth-with-password', 'POST', { identity: email, password })).token;

    const anonymous = () => api('/api/kankaku/last-activity', 'GET');

    // Empty hub: anonymous call answers null.
    const empty = await anonymous();
    assert.match(empty.headers.get('cache-control') || '', /max-age=60/);
    assert.deepEqual(await empty.json(), { last_activity_at: null });

    const client = await json('/api/collections/clients/records', 'POST',
      { name: 'LA fixture', code: 'la-fixture', active: true }, owner);
    const entry = await json('/api/collections/task_entries/records', 'POST', {
      task_id: 'la-task', client: client.id, machine: 'la-machine',
      started_at: '2026-11-18T08:00:00.000Z', ended_at: '2026-11-18T08:00:00.000Z', status: 'completed', work_ms: 10,
    }, owner);
    const record = (kankaku_id, started_at, settled_at) => json('/api/collections/work_records/records', 'POST', {
      kankaku_id, task_entry: entry.id, started_at, settled_at, status: 'completed',
      prompt: 'SECRET PROMPT', model: 'secret-model', machine: 'secret-machine',
    }, owner);
    await record('la-1', '2026-11-18T08:00:00.000Z', '2026-11-18T08:10:00.000Z');
    await record('la-2', '2026-11-18T09:00:00.000Z', '2026-11-18T09:20:00.000Z');
    await record('la-3', '2026-11-18T07:00:00.000Z', '2026-11-18T07:05:00.000Z');

    const body = await (await anonymous()).text();
    assert.deepEqual(JSON.parse(body), { last_activity_at: '2026-11-18T09:20:00.000Z' });
    assert.doesNotMatch(body, /SECRET|secret|la-machine|la-task/);
    // Query parameters cannot widen the answer.
    for (const q of ['?filter=prompt!=""', '?expand=task_entry', '?sort=-prompt']) {
      assert.deepEqual(await (await api('/api/kankaku/last-activity' + q, 'GET')).json(),
        { last_activity_at: '2026-11-18T09:20:00.000Z' });
    }

    // The collection itself stays private for anonymous callers.
    const list = await json('/api/collections/work_records/records', 'GET');
    assert.equal(list.totalItems, 0);
  } finally {
    await stop(child);
    await rm(fixture, { recursive: true, force: true });
  }
});
