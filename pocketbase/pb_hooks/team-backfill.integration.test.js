const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdir, mkdtemp, lstat, realpath, rm } = require('node:fs/promises');
const { createServer } = require('node:net');
const { resolve, join, dirname } = require('node:path');
const { randomBytes } = require('node:crypto');

const root = resolve(__dirname, '../..');
const binary = join(root, 'pocketbase/bin/pocketbase');
const runtime = '/tmp/kankaku-hub-t6-disposable';
// No inherited credentials, configuration, or external service addresses.
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
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', ok);
  });
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

test('T6: disposable PocketBase owner backfill is guarded and preserves history', { timeout: 90000 }, async () => {
  assert.match(await command(['--version']), /\b0\.40\.4\b/, 'Requires pinned PocketBase 0.40.4');
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  const info = await lstat(runtime);
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'Runtime must be a real directory');
  // /tmp may itself be a platform symlink; reject redirects below it.
  assert.equal(await realpath(runtime), join(await realpath('/tmp'), 'kankaku-hub-t6-disposable'));
  const fixture = await mkdtemp(join(runtime, 'owned-'));
  let child;
  try {
    const flags = [
      `--dir=${join(fixture, 'data')}`,
      `--migrationsDir=${join(root, 'pocketbase/pb_migrations')}`,
      `--hooksDir=${__dirname}`,
    ];
    const password = randomBytes(24).toString('hex');
    const adminEmail = 't6-superuser@example.invalid';
    await command(['superuser', 'upsert', adminEmail, password, ...flags]);
    const port = await unusedPort();
    const base = `http://127.0.0.1:${port}`;
    child = spawn(binary, ['serve', `--http=127.0.0.1:${port}`, `--publicDir=${join(fixture, 'public')}`, ...flags],
      { cwd: fixture, env, stdio: 'ignore' });
    // Consume startup errors without exposing command arguments or credentials.
    let startupError = false;
    child.on('error', () => { startupError = true; });
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      assert.ok(!startupError && child.exitCode === null, 'Disposable PocketBase failed to start');
      try {
        const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(300), redirect: 'error' });
        if (response.ok) { ready = true; break; }
      } catch (_) { /* Wait only for our local child. */ }
      await new Promise((ok) => setTimeout(ok, 100));
    }
    assert.ok(ready, 'Disposable PocketBase readiness timeout');

    async function api(path, method, body, token, expected = 200) {
      const response = await fetch(base + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      // Never include request/response bodies in failures: auth responses contain tokens.
      assert.equal(response.status, expected, `${method} ${path}: unexpected HTTP status`);
      return response.json();
    }
    const auth = (collection, email) => api(`/api/collections/${collection}/auth-with-password`, 'POST',
      { identity: email, password });
    const admin = (await auth('_superusers', adminEmail)).token;
    async function user(role) {
      const email = `t6-${role}@example.invalid`;
      await api('/api/collections/users/records', 'POST', { email, password, passwordConfirm: password, role }, admin);
      return (await auth('users', email)).token;
    }
    const owner = await user('owner');
    const service = await user('service');
    const create = (collection, body) => api(`/api/collections/${collection}/records`, 'POST', body, owner);
    const patch = (collection, id, body) => api(`/api/collections/${collection}/records/${id}`, 'PATCH', body, owner);
    const read = (collection, id) => api(`/api/collections/${collection}/records/${id}`, 'GET', undefined, owner);
    const client = await create('clients', { name: 'T6 fixture', code: 't6-fixture', active: true });
    const department = await create('departments', { name: 'T6 historical department', active: true });
    const previous = await create('team_members', { name: 'T6 previous member', department: department.id, active: true });
    const current = await create('team_members', { name: 'T6 current member', department: department.id, active: true });
    const key = 't6-exact-machine';
    const machine = await create('machines', { key, active: true });
    async function entry(taskId, machineKey = key, started = '2000-01-01T00:00:00.000Z') {
      return create('task_entries', { task_id: taskId, client: client.id, machine: machineKey,
        started_at: started, ended_at: started, status: 'completed', work_ms: 10 });
    }
    const first = await entry('t6-before-1');
    const second = await entry('t6-before-2');
    const unrelated = await entry('t6-other-machine', key + '-other');
    assert.equal(first.member, '');
    assert.equal(second.member, '');
    await patch('machines', machine.id, { member: previous.id });
    const attributed = await entry('t6-existing-attribution', key, '2100-01-01T00:00:00.000Z');
    assert.equal(attributed.member, previous.id);
    assert.equal(attributed.department, department.id);
    await patch('machines', machine.id, { member: current.id });

    const backfill = (action, body, token = owner, expected = 200) =>
      api(`/api/kankaku/team-backfill/${action}`, 'POST', body, token, expected);
    const beforeClear = await backfill('preview', { machine_id: machine.id });
    assert.equal(beforeClear.count, 2);
    await patch('machines', machine.id, { member: '' });
    await backfill('apply', beforeClear, owner, 409);
    await backfill('preview', { machine_id: machine.id }, owner, 400);
    for (const row of [first, second]) assert.equal((await read('task_entries', row.id)).member, '');
    await patch('machines', machine.id, { member: current.id });
    const stale = await backfill('preview', { machine_id: machine.id });
    assert.equal(stale.count, 2);
    const third = await entry('t6-late-old-entry');
    await backfill('apply', stale, owner, 409);
    for (const row of [first, second, third]) assert.equal((await read('task_entries', row.id)).member, '');
    const preview = await backfill('preview', { machine_id: machine.id });
    assert.equal(preview.count, 3);
    assert.equal(preview.member, current.id);
    assert.equal(preview.machine_key, key);
    await backfill('preview', { machine_id: machine.id }, service, 403);
    await backfill('apply', preview, service, 403);
    const applied = await backfill('apply', preview);
    assert.equal(applied.updated_count, 3);
    assert.equal((await backfill('preview', { machine_id: machine.id })).count, 0);
    for (const row of [first, second, third]) {
      const saved = await read('task_entries', row.id);
      assert.equal(saved.member, current.id);
      assert.equal(saved.attributed_machine, machine.id);
      assert.equal(saved.department, '', 'No dated department proof for year 2000');
    }
    const preserved = await read('task_entries', attributed.id);
    assert.equal(preserved.member, attributed.member);
    assert.equal(preserved.department, attributed.department);
    assert.equal(preserved.attributed_machine, attributed.attributed_machine);
    assert.equal((await read('task_entries', unrelated.id)).member, '');
    await backfill('apply', preview, owner, 409);
  } finally {
    await stop(child);
    // Only the unique child created above is owned; never remove the approved parent.
    assert.equal(dirname(fixture), runtime);
    assert.ok(fixture.startsWith(join(runtime, 'owned-')));
    await rm(fixture, { recursive: true, force: true });
  }
});
