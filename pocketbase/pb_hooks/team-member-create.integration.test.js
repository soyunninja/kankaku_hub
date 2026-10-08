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
const runtime = '/tmp/kankaku-team-create-disposable';
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
  if (port === 8090) return unusedPort();
  return port;
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, 'close');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await closed; } finally { clearTimeout(timer); }
}

test('T1: disposable PocketBase creates and claims an active free machine atomically', { timeout: 90000 }, async () => {
  assert.match(await command(['--version']), /\b0\.40\.4\b/, 'Requires pinned PocketBase 0.40.4');
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  const info = await lstat(runtime);
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'Runtime must be a real directory');
  const fixture = await mkdtemp(join(runtime, 'owned-'));
  let child;
  try {
    assert.equal(dirname(fixture), runtime);
    assert.equal(await realpath(runtime), join(await realpath('/tmp'), 'kankaku-team-create-disposable'));
    const flags = [`--dir=${join(fixture, 'data')}`, `--migrationsDir=${join(root, 'pocketbase/pb_migrations')}`,
      `--hooksDir=${join(root, 'pocketbase/pb_hooks')}`];
    const password = randomBytes(24).toString('hex');
    const superEmail = 't1-superuser@example.invalid';
    await command(['superuser', 'upsert', superEmail, password, ...flags]);
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
      } catch (_) { /* Wait only for our local child. */ }
      await new Promise((ok) => setTimeout(ok, 100));
    }
    assert.ok(ready, 'Disposable PocketBase readiness timeout');

    async function api(path, method, body, token, expected) {
      const response = await fetch(base + path, { method, redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      assert.equal(response.status, expected, `${method} ${path}: unexpected HTTP status`);
      return response.json();
    }
    const auth = (collection, email) => api(`/api/collections/${collection}/auth-with-password`, 'POST',
      { identity: email, password }, undefined, 200);
    const admin = (await auth('_superusers', superEmail)).token;
    async function user(role) {
      const email = `t1-${role}@example.invalid`;
      await api('/api/collections/users/records', 'POST', { email, password, passwordConfirm: password, role }, admin, 200);
      return (await auth('users', email)).token;
    }
    const owner = await user('owner');
    const service = await user('service');
    const viewer = await user('viewer');
    const create = (collection, body) => api(`/api/collections/${collection}/records`, 'POST', body, owner, 200);
    const readList = (collection) => api(`/api/collections/${collection}/records?perPage=200`, 'GET', undefined, owner, 200);
    const route = (body, token = owner, expected = 200) => api('/api/kankaku/team-members/create-with-machine', 'POST', body, token, expected);
    const client = await create('clients', { name: 'T1 fixture client', code: 't1-fixture-client', active: true });
    const department = await create('departments', { name: 'T1 active department', active: true });
    const inactiveDepartment = await create('departments', { name: 'T1 inactive department', active: false });
    const machine = await create('machines', { key: 't1-success-machine', active: true });
    const result = await route({ name: '  T1 Member  ', department: department.id, machine_id: machine.id });
    assert.equal(result.member.name, 'T1 Member');
    assert.equal(result.member.department, department.id);
    assert.equal(result.member.active, true);
    assert.equal(result.machine.id, machine.id);
    assert.equal(result.machine.member, result.member.id);
    const assigned = await api(`/api/collections/machines/records/${machine.id}`, 'GET', undefined, owner, 200);
    assert.equal(assigned.assignment_history.at(-1).value, result.member.id);
    const entry = await create('task_entries', { task_id: 't1-attributed-entry', client: client.id,
      machine: machine.key, started_at: new Date().toISOString(), ended_at: new Date().toISOString(), status: 'completed' });
    assert.equal(entry.attributed_machine, machine.id);
    assert.equal(entry.member, result.member.id);
    assert.equal(entry.department, department.id);
    const membersAfterSuccess = (await readList('team_members')).items;
    assert.equal(membersAfterSuccess.filter((row) => row.id === result.member.id).length, 1);

    const occupied = await create('machines', { key: 't1-occupied-machine', member: result.member.id, active: true });
    const inactive = await create('machines', { key: 't1-inactive-machine', active: false });
    const free = await create('machines', { key: 't1-validation-machine', active: true });
    for (const machineId of ['missing-machine-id', occupied.id, inactive.id]) {
      await route({ name: 'Should not persist', machine_id: machineId }, owner, 409);
    }
    await route({ name: 'Bad department', department: inactiveDepartment.id, machine_id: free.id }, owner, 400);
    await route({ name: 'Bad fields', machine_id: free.id, extra: true }, owner, 400);
    const afterFailures = (await readList('team_members')).items;
    assert.equal(afterFailures.length, membersAfterSuccess.length, 'conflicts and invalid requests left no partial member');
    for (const token of [service, viewer]) await route({ name: 'Forbidden', machine_id: machine.id }, token, 403);
    await route({ name: 'Unauthenticated', machine_id: machine.id }, null, 401);
    assert.equal((await readList('team_members')).items.length, membersAfterSuccess.length);
  } finally {
    await stop(child);
    assert.equal(dirname(fixture), runtime);
    assert.ok(fixture.startsWith(join(runtime, 'owned-')));
    await rm(fixture, { recursive: true, force: true });
  }
});
