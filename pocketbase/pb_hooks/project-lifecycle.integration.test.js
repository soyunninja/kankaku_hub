const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdir, mkdtemp, lstat, realpath, rm, copyFile } = require('node:fs/promises');
const { createServer } = require('node:net');
const { resolve, join, dirname } = require('node:path');
const { randomBytes } = require('node:crypto');

const root = resolve(__dirname, '../..');
const binary = join(root, 'pocketbase/bin/pocketbase');
const runtime = '/tmp/kankaku-project-lifecycle-disposable';
const env = { PATH: '/usr/bin:/bin', TZ: 'UTC' };

async function command(args) {
  const child = spawn(binary, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.resume(); child.stderr.resume();
  const [code] = await once(child, 'close');
  assert.equal(code, 0, 'PocketBase setup command failed');
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

test('disposable PocketBase enforces active project parent lifecycle alongside client cascade', { timeout: 90000 }, async () => {
  const versionProcess = spawn(binary, ['--version'], { env, stdio: ['ignore', 'pipe', 'ignore'] });
  let version = ''; versionProcess.stdout.on('data', (chunk) => { version += chunk; });
  await once(versionProcess, 'close');
  assert.match(version, /\b0\.40\.4\b/, 'Requires pinned PocketBase 0.40.4');
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  const info = await lstat(runtime);
  assert.ok(info.isDirectory() && !info.isSymbolicLink());
  assert.equal(await realpath(runtime), join(await realpath('/tmp'), 'kankaku-project-lifecycle-disposable'));
  const fixture = await mkdtemp(join(runtime, 'owned-'));
  let child;
  try {
    const hooks = join(fixture, 'hooks');
    const lib = join(hooks, 'lib');
    await mkdir(lib, { recursive: true });
    for (const path of ['client-cascade.pb.js', 'project-lifecycle.pb.js', 'task-auto-doing.pb.js']) {
      await copyFile(join(root, 'pocketbase/pb_hooks', path), join(hooks, path));
    }
    for (const path of ['client-cascade.js', 'project-lifecycle.js', 'task-close-cascade.js', 'task-status-rule.js']) {
      await copyFile(join(root, 'pocketbase/pb_hooks/lib', path), join(lib, path));
    }
    const flags = [`--dir=${join(fixture, 'data')}`, `--migrationsDir=${join(root, 'pocketbase/pb_migrations')}`, `--hooksDir=${hooks}`];
    const password = randomBytes(24).toString('hex');
    const superEmail = 'project-lifecycle-superuser@example.invalid';
    await command(['superuser', 'upsert', superEmail, password, ...flags]);
    const port = await unusedPort();
    const base = `http://127.0.0.1:${port}`;
    child = spawn(binary, ['serve', `--http=127.0.0.1:${port}`, `--publicDir=${join(fixture, 'public')}`, ...flags],
      { cwd: fixture, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let serverOutput = '';
    child.stdout.on('data', (chunk) => { serverOutput += chunk; });
    child.stderr.on('data', (chunk) => { serverOutput += chunk; });
    let ready = false;
    for (let i = 0; i < 150; i++) {
      assert.equal(child.exitCode, null, 'Disposable PocketBase exited during startup');
      try { if ((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(300) })).ok) { ready = true; break; } } catch (_) {}
      await new Promise((ok) => setTimeout(ok, 100));
    }
    assert.ok(ready, `Disposable PocketBase readiness timeout: ${serverOutput}`);
    async function api(path, method, body, token, expected) {
      const response = await fetch(base + path, { method, redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const payload = await response.json();
      assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(payload)}; ${serverOutput}`);
      return payload;
    }
    const auth = async (collection, identity) => (await api(`/api/collections/${collection}/auth-with-password`, 'POST',
      { identity, password }, undefined, 200)).token;
    const superToken = await auth('_superusers', superEmail);
    const email = 'project-lifecycle-owner@example.invalid';
    await api('/api/collections/users/records', 'POST', { email, password, passwordConfirm: password, role: 'owner' }, superToken, 200);
    const owner = await auth('users', email);
    const create = (collection, body) => api(`/api/collections/${collection}/records`, 'POST', body, owner, 200);
    const patch = (collection, id, body, expected = 200) => api(`/api/collections/${collection}/records/${id}`, 'PATCH', body, owner, expected);
    const read = (collection, id) => api(`/api/collections/${collection}/records/${id}`, 'GET', undefined, owner, 200);

    const client = await create('clients', { name: 'Inactive parent', code: 'inactive-parent', active: false });
    const rejectedCreate = await api('/api/collections/projects/records', 'POST',
      { name: 'Rejected create', client: client.id, active: true }, owner, 400);
    assert.match(rejectedCreate.message, /Cannot activate a project while its client is inactive/);
    const archived = await create('projects', { name: 'Archived allowed', client: client.id, active: false });
    assert.equal((await read('projects', archived.id)).active, false);
    const activeClient = await create('clients', { name: 'Active parent', code: 'active-parent', active: true });
    const moving = await create('projects', { name: 'Move candidate', client: activeClient.id, active: true });
    const beforeMove = await read('projects', moving.id);
    const deniedMove = await patch('projects', moving.id, { client: client.id }, 400);
    assert.match(deniedMove.message, /Cannot activate a project while its client is inactive/);
    assert.deepEqual(await read('projects', moving.id), beforeMove, 'rejected parent move changes no project fields');
    const beforeReactivate = await read('projects', archived.id);
    const deniedReactivate = await patch('projects', archived.id, { active: true }, 400);
    assert.match(deniedReactivate.message, /Cannot activate a project while its client is inactive/);
    assert.deepEqual(await read('projects', archived.id), beforeReactivate, 'rejected reactivation changes no project fields');

    const cascadeClient = await create('clients', { name: 'Cascade parent', code: 'cascade-parent', active: true });
    const cascadeProject = await create('projects', { name: 'Cascade project', client: cascadeClient.id, active: true });
    const cascadeTask = await create('tasks', { title: 'Project closes task', project: cascadeProject.id, status: 'done' });
    const manualTask = await create('tasks', { title: 'Project closure stays manual', project: cascadeProject.id, status: 'open' });
    const linkedEntry = (task, id) => create('task_entries', { task_id: id, client: cascadeClient.id, project: cascadeProject.id, task,
      started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:01:00.000Z', status: 'completed' });
    await linkedEntry(manualTask.id, 'lifecycle-open-entry');
    assert.equal((await read('tasks', manualTask.id)).status, 'doing', 'linked work changes open to doing');
    const closedTask = await create('tasks', { title: 'Linked after closed', project: cascadeProject.id, status: 'closed' });
    await linkedEntry(closedTask.id, 'lifecycle-closed-entry');
    assert.equal((await read('tasks', closedTask.id)).status, 'closed', 'linked work never reopens closed task');
    await patch('projects', cascadeProject.id, { active: false });
    assert.equal((await read('tasks', cascadeTask.id)).status, 'closed', 'project archive closes done task');
    assert.equal((await read('tasks', manualTask.id)).status, 'closed');
    await patch('projects', cascadeProject.id, { active: true });
    assert.equal((await read('tasks', manualTask.id)).status, 'closed', 'project reactivation does not restore task');
    await patch('clients', cascadeClient.id, { active: false });
    assert.equal((await read('projects', cascadeProject.id)).active, false);
    await patch('clients', cascadeClient.id, { active: true });
    assert.equal((await read('projects', cascadeProject.id)).active, false, 'client reactivation leaves projects archived');
    const deniedAfterClientRestore = await patch('projects', cascadeProject.id, { active: true });
    assert.equal(deniedAfterClientRestore.active, true, 'manual project reactivation succeeds under active parent');
  } finally {
    await stop(child);
    assert.equal(dirname(fixture), runtime);
    assert.ok(fixture.startsWith(join(runtime, 'owned-')));
    await rm(fixture, { recursive: true, force: true });
  }
});
