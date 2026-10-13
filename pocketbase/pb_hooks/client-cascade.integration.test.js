const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdir, mkdtemp, lstat, realpath, rm, copyFile, writeFile } = require('node:fs/promises');
const { createServer } = require('node:net');
const { resolve, join, dirname } = require('node:path');
const { randomBytes } = require('node:crypto');

const root = resolve(__dirname, '../..');
const binary = join(root, 'pocketbase/bin/pocketbase');
const runtime = '/tmp/kankaku-client-cascade-disposable';
const env = { PATH: '/usr/bin:/bin', TZ: 'UTC' };

async function command(args) {
  const child = spawn(binary, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.resume();
  child.stderr.resume();
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

test('disposable PocketBase proves atomic client cascade for owner and superuser writes', { timeout: 90000 }, async () => {
  assert.match(await (async () => {
    const child = spawn(binary, ['--version'], { env, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = ''; child.stdout.on('data', (chunk) => { output += chunk; }); await once(child, 'close'); return output;
  })(), /\b0\.40\.4\b/, 'Requires pinned PocketBase 0.40.4');
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  const info = await lstat(runtime);
  assert.ok(info.isDirectory() && !info.isSymbolicLink());
  assert.equal(await realpath(runtime), join(await realpath('/tmp'), 'kankaku-client-cascade-disposable'));
  const fixture = await mkdtemp(join(runtime, 'owned-'));
  let child;
  try {
    const hooks = join(fixture, 'hooks');
    const lib = join(hooks, 'lib');
    await mkdir(lib, { recursive: true });
    for (const path of ['client-cascade.pb.js', 'project-lifecycle.pb.js']) {
      await copyFile(join(root, 'pocketbase/pb_hooks', path), join(hooks, path));
    }
    for (const path of ['client-cascade.js', 'project-lifecycle.js', 'task-close-cascade.js']) {
      await copyFile(join(root, 'pocketbase/pb_hooks/lib', path), join(lib, path));
    }
    await writeFile(join(lib, 'cascade-failure-state.js'), `module.exports = { completedProjectSaves: 0, completedTaskSaves: 0 };\n`);
    await writeFile(join(hooks, 'zz-client-cascade-failure.pb.js'), `onRecordUpdate((e) => {\n  const state = require(\`${'${__hooks}'}/lib/cascade-failure-state.js\`);\n  if (!e.record.getString('name').startsWith('CC1 fail') || e.record.getBool('active')) return e.next();\n  if (state.completedProjectSaves === 0) {\n    e.next();\n    state.completedProjectSaves++;\n    e.app.logger().error('CC1_FIRST_PROJECT_SAVE_COMPLETED');\n    return;\n  }\n  if (state.completedProjectSaves === 1) {\n    state.failureIdentity = 'CC1_INJECTED_SECOND_PROJECT_SAVE_FAILURE';\n    e.app.logger().error(state.failureIdentity);\n    throw new BadRequestError(state.failureIdentity);\n  }\n  return e.next();\n}, 'projects');\n`);
    await writeFile(join(hooks, 'zz-task-cascade-failure.pb.js'), `onRecordUpdate((e) => {\n  const state = require(\`${'${__hooks}'}/lib/cascade-failure-state.js\`);\n  if (!e.record.getString('title').startsWith('TC1 fail')) return e.next();\n  if (state.completedTaskSaves === 0) { e.next(); state.completedTaskSaves++; return; }\n  if (state.completedTaskSaves === 1) { throw new BadRequestError('TC1_INJECTED_SECOND_TASK_SAVE_FAILURE'); }\n  return e.next();\n}, 'tasks');\n`);
    const flags = [`--dir=${join(fixture, 'data')}`, `--migrationsDir=${join(root, 'pocketbase/pb_migrations')}`, `--hooksDir=${hooks}`];
    const password = randomBytes(24).toString('hex');
    const superEmail = 'cascade-superuser@example.invalid';
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
    assert.ok(ready, 'Disposable PocketBase readiness timeout');
    async function api(path, method, body, token, expected) {
      const response = await fetch(base + path, { method, redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      assert.equal(response.status, expected, `${method} ${path}; PocketBase output: ${serverOutput}`);
      return response.json();
    }
    const auth = async (collection, identity) => (await api(`/api/collections/${collection}/auth-with-password`, 'POST',
      { identity, password }, undefined, 200)).token;
    const superToken = await auth('_superusers', superEmail);
    const userEmail = 'cascade-owner@example.invalid';
    await api('/api/collections/users/records', 'POST', { email: userEmail, password, passwordConfirm: password, role: 'owner' }, superToken, 200);
    const owner = await auth('users', userEmail);
    const create = (collection, body) => api(`/api/collections/${collection}/records`, 'POST', body, owner, 200);
    const patch = (id, body, token = owner, expected = 200) => api(`/api/collections/clients/records/${id}`, 'PATCH', body, token, expected);
    const read = (collection, id, token = owner) => api(`/api/collections/${collection}/records/${id}`, 'GET', undefined, token, 200);

    const client = await create('clients', { name: 'Cascade client', code: 'cascade-client', active: true });
    const other = await create('clients', { name: 'Other client', code: 'cascade-other', active: true });
    const project = await create('projects', { name: 'Cascade project', client: client.id, active: true });
    const entry = await create('task_entries', { task_id: 'cascade-entry', client: client.id,
      started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:01:00.000Z', status: 'completed', wall_ms: 60000, work_ms: 45000, cost: 1.25 });
    const work = await create('work_records', { kankaku_id: 'cascade-work', task_entry: entry.id,
      started_at: '2026-01-01T00:00:00.000Z', role: 'orchestrator', status: 'completed', wall_ms: 60000, work_ms: 45000, cost: 1.25, rollup: false });
    const entryBefore = await read('task_entries', entry.id);
    const workBefore = await read('work_records', work.id);
    const alreadyOff = await create('projects', { name: 'Already off', client: client.id, active: false });
    const alreadyOffBefore = await read('projects', alreadyOff.id);
    const unrelated = await create('projects', { name: 'Unrelated', client: other.id, active: true });
    const task = await create('tasks', { title: 'Retained workflow', project: project.id, status: 'doing' });
    const doneTask = await create('tasks', { title: 'Done remains distinct until archive', project: project.id, status: 'done' });
    const previouslyArchived = await create('projects', { name: 'Previously archived', client: client.id, active: false });
    const archivedTask = await create('tasks', { title: 'Archived project descendant', project: previouslyArchived.id, status: 'open' });
    const alreadyClosed = await create('tasks', { title: 'Already closed', project: project.id, status: 'closed' });
    const alreadyClosedBefore = await read('tasks', alreadyClosed.id);
    const manyProjects = [];
    for (let i = 0; i < 40; i++) manyProjects.push(await create('projects', { name: `Pagination ${i}`, client: client.id, active: true }));
    await patch(client.id, { active: false });
    assert.equal((await read('clients', client.id)).active, false);
    assert.equal((await read('projects', project.id)).active, false);
    assert.deepEqual(await read('projects', alreadyOff.id), alreadyOffBefore);
    assert.equal((await read('projects', unrelated.id)).active, true);
    for (const item of manyProjects) assert.equal((await read('projects', item.id)).active, false, `project ${item.id} cascaded`);
    assert.equal((await read('tasks', task.id)).status, 'closed');
    assert.equal((await read('tasks', doneTask.id)).status, 'closed', 'done tasks close too');
    assert.equal((await read('tasks', archivedTask.id)).status, 'closed', 'inactive descendant projects are included');
    assert.deepEqual(await read('tasks', alreadyClosed.id), alreadyClosedBefore, 'already closed task is not redundantly saved');
    assert.deepEqual(await read('task_entries', entry.id), entryBefore);
    assert.deepEqual(await read('work_records', work.id), workBefore);
    assert.equal((await read('task_entries', entry.id)).wall_ms, 60000);
    assert.equal((await read('work_records', work.id)).rollup, false);
    await patch(client.id, { active: false });
    await patch(client.id, { active: true });
    assert.equal((await read('projects', project.id)).active, false, 'reactivation must not restore projects');
    assert.equal((await read('tasks', task.id)).status, 'closed', 'client reactivation never restores tasks');

    const failClient = await create('clients', { name: 'Failure client', code: 'cascade-fail', active: true });
    const f1 = await create('projects', { name: 'CC1 fail first', client: failClient.id, active: true });
    const f2 = await create('projects', { name: 'CC1 fail second', client: failClient.id, active: true });
    const failure = await patch(failClient.id, { active: false }, owner, 400);
    assert.equal(failure.message, 'CC1_INJECTED_SECOND_PROJECT_SAVE_FAILURE.', 'the unique error is thrown only after the first e.next() completed and the handler-safe count advanced; this excludes setup/scope failures');
    assert.equal((await read('clients', failClient.id)).active, true, 'client write rolled back');
    assert.equal((await read('projects', f1.id)).active, true, 'first project write rolled back');
    assert.equal((await read('projects', f2.id)).active, true, 'failing project remains active');

    const taskFailClient = await create('clients', { name: 'Task failure client', code: 'task-cascade-fail', active: true });
    const taskFailProject = await create('projects', { name: 'Task failure project', client: taskFailClient.id, active: true });
    const firstFailTask = await create('tasks', { title: 'TC1 fail first', project: taskFailProject.id, status: 'doing' });
    const secondFailTask = await create('tasks', { title: 'TC1 fail second', project: taskFailProject.id, status: 'done' });
    const taskFailure = await patch(taskFailClient.id, { active: false }, owner, 400);
    assert.equal(taskFailure.message, 'TC1_INJECTED_SECOND_TASK_SAVE_FAILURE.');
    assert.equal((await read('clients', taskFailClient.id)).active, true, 'parent update is prevented after task failure');
    assert.equal((await read('projects', taskFailProject.id)).active, true, 'project write preceding failed task rolls back');
    assert.equal((await read('tasks', firstFailTask.id)).status, 'doing', 'first completed task save rolls back');
    assert.equal((await read('tasks', secondFailTask.id)).status, 'done', 'failed task remains unchanged');

    const unauthorizedEmail = 'cascade-viewer@example.invalid';
    await api('/api/collections/users/records', 'POST', { email: unauthorizedEmail, password, passwordConfirm: password, role: 'viewer' }, superToken, 200);
    const viewer = await auth('users', unauthorizedEmail);
    await patch(other.id, { active: false }, viewer, 404);
    assert.equal((await read('clients', other.id)).active, true);
    const superClient = await create('clients', { name: 'Superuser client', code: 'cascade-super', active: true });
    const superProject = await create('projects', { name: 'Superuser project', client: superClient.id, active: true });
    await patch(superClient.id, { active: false }, superToken, 200);
    assert.equal((await read('projects', superProject.id)).active, false);
  } finally {
    await stop(child);
    assert.equal(dirname(fixture), runtime);
    assert.ok(fixture.startsWith(join(runtime, 'owned-')));
    await rm(fixture, { recursive: true, force: true });
  }
});
