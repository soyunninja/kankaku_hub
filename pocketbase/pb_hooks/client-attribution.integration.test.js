const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdir, mkdtemp, lstat, realpath } = require('node:fs/promises');
const { createServer } = require('node:net');
const { resolve, join, dirname } = require('node:path');
const { randomBytes } = require('node:crypto');

const root = resolve(__dirname, '../..');
const binary = join(root, 'pocketbase/bin/pocketbase');
const runtime = '/tmp/kankaku-client-attribution-disposable';
const env = { PATH: '/usr/bin:/bin', TZ: 'UTC' };
async function command(args) {
  const child = spawn(binary, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'ignore'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  const [code] = await once(child, 'close');
  assert.equal(code, 0, 'PocketBase setup failed (output suppressed)');
  return output;
}
async function sqlite(database, sql) {
  const child = spawn('/usr/bin/sqlite3', [database, sql], { env, stdio: ['ignore', 'ignore', 'ignore'] });
  const [code] = await once(child, 'close');
  assert.equal(code, 0, 'Disposable fixture SQL failed (output suppressed)');
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

test('CA-1 isolated PocketBase attribution is client-scoped, stale-safe and preserves measurements', { timeout: 90000 }, async () => {
  assert.match(await command(['--version']), /\b0\.40\.4\b/);
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  const info = await lstat(runtime);
  assert.ok(info.isDirectory() && !info.isSymbolicLink());
  assert.equal(await realpath(runtime), join(await realpath('/tmp'), 'kankaku-client-attribution-disposable'));
  const fixture = await mkdtemp(join(runtime, 'owned-'));
  let child;
  try {
    const flags = [`--dir=${join(fixture, 'data')}`, `--migrationsDir=${join(root, 'pocketbase/pb_migrations')}`, `--hooksDir=${__dirname}`];
    const password = randomBytes(24).toString('hex');
    const adminEmail = 'ca-superuser@example.invalid';
    await command(['superuser', 'upsert', adminEmail, password, ...flags]);
    const port = await unusedPort();
    const base = `http://127.0.0.1:${port}`;
    async function startServer() {
      child = spawn(binary, ['serve', `--http=127.0.0.1:${port}`, `--publicDir=${join(fixture, 'public')}`, ...flags],
        { cwd: fixture, env, stdio: 'ignore' });
      let ready = false;
      for (let i = 0; i < 150; i++) {
        assert.equal(child.exitCode, null, 'Disposable PocketBase exited');
        try { const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(300), redirect: 'error' }); if (r.ok) { ready = true; break; } } catch (_) {}
        await new Promise((ok) => setTimeout(ok, 100));
      }
      assert.ok(ready, 'Disposable PocketBase readiness timeout');
    }
    await startServer();
    async function api(path, method, body, token, expected = 200) {
      const r = await fetch(base + path, { method, redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const payload = r.status === 204 ? null : await r.json();
      assert.ok(Array.isArray(expected) ? expected.includes(r.status) : r.status === expected,
        `${method} ${path}: unexpected status ${JSON.stringify(payload)}`);
      return payload;
    }
    const auth = (collection, email) => api(`/api/collections/${collection}/auth-with-password`, 'POST', { identity: email, password });
    const admin = (await auth('_superusers', adminEmail)).token;
    async function user(role) {
      const email = `ca-${role}@example.invalid`;
      await api('/api/collections/users/records', 'POST', { email, password, passwordConfirm: password, role }, admin);
      return (await auth('users', email)).token;
    }
    const owner = await user('owner'), service = await user('service'), viewer = await user('viewer');
    const create = (collection, body) => api(`/api/collections/${collection}/records`, 'POST', body, owner);
    const read = (collection, id) => api(`/api/collections/${collection}/records/${id}`, 'GET', undefined, owner);
    const route = (action, body, token = owner, expected = 200) => api(`/api/kankaku/client-attribution/${action}`, 'POST', body, token, expected);
    const client = await create('clients', { name: 'CA inactive client', code: 'ca-inactive-client', active: false });
    const other = await create('clients', { name: 'CA other client', code: 'ca-other-client', active: true });
    await api(`/api/collections/clients/records/${client.id}`, 'PATCH', { active: true }, owner);
    const projectA = await create('projects', { name: 'CA project A', client: client.id, active: false });
    const projectB = await create('projects', { name: 'CA project B', client: client.id, active: true });
    const projectC = await create('projects', { name: 'CA project C for deletion', client: client.id, active: true });
    const foreignProject = await create('projects', { name: 'CA foreign project', client: other.id, active: true });
    await api(`/api/collections/clients/records/${client.id}`, 'PATCH', { active: false }, owner);
    const department = await create('departments', { name: 'CA dated department', active: true });
    const changedDepartment = await create('departments', { name: 'CA updated department history', active: true });
    const member = await create('team_members', { name: 'CA inactive member', department: department.id, active: false });
    const noHistory = await create('team_members', { name: 'CA no history member', active: false });
    const unknownHistoryMember = await create('team_members', { name: 'CA unknown history department', active: false });
    const noHistoryBefore = await read('team_members', noHistory.id);
    const unknownHistoryBefore = await read('team_members', unknownHistoryMember.id);
    const started = new Date(Date.now() + 60000).toISOString();
    const ended = new Date(Date.parse(started) + 2000).toISOString();
    const createEntry = (task_id, clientId, extra = {}) => create('task_entries', { task_id, client: clientId, machine: 'unknown-ca-machine',
      started_at: started, ended_at: ended, wall_ms: 2000, work_ms: 1500, waiting_ms: 500,
      input: 7, output: 9, cost: 1.25, status: 'completed', ...extra });
    const dated = await createEntry('ca-dated-entry', client.id);
    const raw = await create('work_records', { kankaku_id: 'ca-work-record', task_entry: dated.id,
      started_at: started, role: 'orchestrator', status: 'completed', wall_ms: 2000, work_ms: 1500, cost: 1.25 });
    const rawBefore = await read('work_records', raw.id);
    const preserved = await createEntry('ca-preserved-entry', client.id);
    const missingHistory = await createEntry('ca-no-history-entry', client.id);
    const unknownHistoryEntry = await createEntry('ca-unknown-history-entry', client.id);
    const foreign = await createEntry('ca-foreign-entry', other.id);
    const staleDepartmentEntry = await createEntry('ca-stale-department-entry', client.id);
    const staleDateEntry = await createEntry('ca-stale-date-entry', client.id);
    const projectEntry = await createEntry('ca-project-entry', client.id, { project: projectA.id });
    const otherProjectEntry = await createEntry('ca-other-project-entry', client.id, { project: projectB.id });
    const foreignProjectEntry = await createEntry('ca-foreign-project-entry', other.id, { project: foreignProject.id });
    const staleProjectEntry = await createEntry('ca-stale-project-entry', client.id, { project: projectA.id });
    const staleParentEntry = await createEntry('ca-stale-parent-entry', client.id, { project: projectA.id });
    const clientWideProjectEntry = await createEntry('ca-client-wide-project-entry', client.id, { project: projectA.id });
    const movedParentEntry = await createEntry('ca-moved-parent-entry', client.id, { project: projectB.id });
    const replayClientEntry = await createEntry('ca-client-preview-replay-entry', client.id, { project: projectA.id });
    const replayStripEntry = await createEntry('ca-project-preview-strip-entry', client.id, { project: projectA.id });
    const mixedProjectA = await createEntry('ca-mixed-apply-a', client.id, { project: projectA.id });
    const mixedProjectB = await createEntry('ca-mixed-apply-b', client.id, { project: projectB.id });
    const crossApplyA = await createEntry('ca-cross-apply-a', client.id, { project: projectA.id });
    const crossApplyB = await createEntry('ca-cross-apply-b', client.id, { project: projectB.id });
    const deletedProjectEntry = await createEntry('ca-deleted-project-parent-entry', client.id, { project: projectC.id });
    const deletedEntry = await createEntry('ca-deleted-entry', client.id, { project: projectA.id });
    const survivingEntry = await createEntry('ca-surviving-entry', client.id, { project: projectA.id });
    const staleDepartmentRequest = { client_id: client.id, member: member.id, entry_ids: [staleDepartmentEntry.id] };
    const staleDateRequest = { client_id: client.id, member: member.id, entry_ids: [staleDateEntry.id] };
    const staleDepartmentPreview = await route('preview', staleDepartmentRequest);
    const staleDatePreview = await route('preview', staleDateRequest);
    await stop(child);
    const badDateHistory = JSON.stringify([{ at: 'not-a-valid-utc-date', value: '' }]);
    const unknownDepartmentHistory = JSON.stringify([{ at: new Date().toISOString(), value: 'zzzzzzzzzzzzzzz' }]);
    const shiftedStarted = new Date(Date.parse(started) + 5000).toISOString();
    const shiftedEnded = new Date(Date.parse(shiftedStarted) + 2000).toISOString();
    await sqlite(join(fixture, 'data/data.db'), `UPDATE task_entries SET department = '${other.id}' WHERE id = '${preserved.id}'`);
    await sqlite(join(fixture, 'data/data.db'), `UPDATE task_entries SET department = '${other.id}', updated = strftime('%Y-%m-%d %H:%M:%fZ', 'now') WHERE id = '${staleDepartmentEntry.id}'`);
    await sqlite(join(fixture, 'data/data.db'), `UPDATE task_entries SET started_at = '${shiftedStarted}', ended_at = '${shiftedEnded}', updated = strftime('%Y-%m-%d %H:%M:%fZ', 'now') WHERE id = '${staleDateEntry.id}'`);
    await sqlite(join(fixture, 'data/data.db'), `UPDATE team_members SET department_history = '${badDateHistory}' WHERE id = '${noHistory.id}'`);
    await sqlite(join(fixture, 'data/data.db'), `UPDATE team_members SET department_history = '${unknownDepartmentHistory}' WHERE id = '${unknownHistoryMember.id}'`);
    await startServer();
    assert.equal((await read('task_entries', preserved.id)).department, other.id);
    await route('apply', { ...staleDepartmentRequest, snapshot: staleDepartmentPreview.snapshot }, owner, 409);
    await route('apply', { ...staleDateRequest, snapshot: staleDatePreview.snapshot }, owner, 409);
    assert.equal((await read('task_entries', staleDepartmentEntry.id)).member, '');
    assert.equal((await read('task_entries', staleDateEntry.id)).member, '');
    await route('preview', { client_id: client.id, member: noHistory.id, entry_ids: [missingHistory.id] }, owner, 400);
    await route('apply', { client_id: client.id, member: noHistory.id, entry_ids: [missingHistory.id], snapshot: 'a'.repeat(64) }, owner, 400);
    await route('preview', { client_id: client.id, member: unknownHistoryMember.id, entry_ids: [unknownHistoryEntry.id] }, owner, 400);
    await route('apply', { client_id: client.id, member: unknownHistoryMember.id, entry_ids: [unknownHistoryEntry.id], snapshot: 'a'.repeat(64) }, owner, 400);
    assert.equal((await read('task_entries', missingHistory.id)).member, '');
    assert.equal((await read('task_entries', unknownHistoryEntry.id)).member, '');
    await stop(child);
    await sqlite(join(fixture, 'data/data.db'), `UPDATE team_members SET department_history = '${JSON.stringify(noHistoryBefore.department_history)}' WHERE id = '${noHistory.id}'`);
    await sqlite(join(fixture, 'data/data.db'), `UPDATE team_members SET department_history = '${JSON.stringify(unknownHistoryBefore.department_history)}' WHERE id = '${unknownHistoryMember.id}'`);
    await startServer();
    const ordinaryAttempt = await api(`/api/collections/task_entries/records/${dated.id}`, 'PATCH', { member: member.id }, owner);
    assert.equal(ordinaryAttempt.member, '', 'Ordinary record updates cannot change attribution');
    const untouched = JSON.stringify(await read('task_entries', dated.id));
    const request = { client_id: client.id, member: member.id, entry_ids: [dated.id] };
    const preview = await route('preview', request);
    assert.equal(preview.count, 1);
    assert.equal(preview.client_id, client.id);
    assert.equal(preview.member, member.id);
    assert.match(preview.snapshot, /^[a-f0-9]{64}$/);
    for (const token of [service, viewer]) await route('preview', request, token, 403);
    await route('preview', request, admin, 403);
    await route('preview', request, null, 401);
    await route('apply', { ...request, snapshot: preview.snapshot }, service, 403);
    await route('preview', { ...request, extra: true }, owner, 400);
    await route('preview', { ...request, project_id: '' }, owner, 400);
    await route('preview', { ...request, project_id: null }, owner, 400);
    await route('preview', { ...request, project_id: foreignProject.id }, owner, 400);
    await route('preview', { ...request, project_id: '000000000000000' }, owner, 404);
    await route('preview', { ...request, project_id: projectA.id, extra: true }, owner, 400);
    await route('preview', { ...request, project_id: projectA.id, snapshot: 'a'.repeat(64) }, owner, 400);
    await route('preview', { client_id: client.id, member: member.id, project_id: projectA.id, entry_ids: [projectEntry.id, otherProjectEntry.id] }, owner, 400);

    const clientReplayRequest = { client_id: client.id, member: noHistory.id, entry_ids: [replayClientEntry.id] };
    const clientReplayPreview = await route('preview', clientReplayRequest);
    await route('apply', { ...clientReplayRequest, project_id: projectA.id, snapshot: clientReplayPreview.snapshot }, owner, 409);
    assert.equal((await read('task_entries', replayClientEntry.id)).member, '');
    const stripProjectRequest = { client_id: client.id, member: noHistory.id, project_id: projectA.id, entry_ids: [replayStripEntry.id] };
    const stripProjectPreview = await route('preview', stripProjectRequest);
    await route('apply', { client_id: client.id, member: noHistory.id, entry_ids: [replayStripEntry.id], snapshot: stripProjectPreview.snapshot }, owner, 409);
    assert.equal((await read('task_entries', replayStripEntry.id)).member, '');

    const mixedApply = { client_id: client.id, member: noHistory.id, project_id: projectA.id, entry_ids: [mixedProjectA.id, mixedProjectB.id] };
    await route('apply', { ...mixedApply, snapshot: 'a'.repeat(64) }, owner, 400);
    assert.equal((await read('task_entries', mixedProjectA.id)).member, '');
    assert.equal((await read('task_entries', mixedProjectB.id)).member, '');

    const crossProjectClientRequest = { client_id: client.id, member: noHistory.id, entry_ids: [crossApplyA.id, crossApplyB.id] };
    const crossProjectClientPreview = await route('preview', crossProjectClientRequest);
    assert.deepEqual(Object.keys(crossProjectClientPreview).sort(), ['client_id', 'count', 'member', 'snapshot']);
    const crossProjectClientApply = await route('apply', { ...crossProjectClientRequest, snapshot: crossProjectClientPreview.snapshot });
    assert.deepEqual(Object.keys(crossProjectClientApply).sort(), ['client_id', 'member', 'updated_count']);
    assert.equal(crossProjectClientApply.updated_count, 2);
    assert.equal((await read('task_entries', crossApplyA.id)).member, noHistory.id);
    assert.equal((await read('task_entries', crossApplyB.id)).member, noHistory.id);

    const deletedProjectRequest = { client_id: client.id, member: noHistory.id, project_id: projectC.id, entry_ids: [deletedProjectEntry.id] };
    const deletedProjectPreview = await route('preview', deletedProjectRequest);
    await api(`/api/collections/projects/records/${projectC.id}`, 'DELETE', undefined, owner, 204);
    await route('apply', { ...deletedProjectRequest, snapshot: deletedProjectPreview.snapshot }, owner, 404);
    const deletedProjectEntryAfter = await api(`/api/collections/task_entries/records/${deletedProjectEntry.id}`, 'GET', undefined, owner, 200);
    assert.equal(deletedProjectEntryAfter.member, '', 'PocketBase retains this row after project deletion, and it is not attributed');

    const deleteEntryRequest = { client_id: client.id, member: noHistory.id, project_id: projectA.id, entry_ids: [deletedEntry.id, survivingEntry.id] };
    const deleteEntryPreview = await route('preview', deleteEntryRequest);
    const survivingBeforeDelete = await read('task_entries', survivingEntry.id);
    await api(`/api/collections/task_entries/records/${deletedEntry.id}`, 'DELETE', undefined, owner, 204);
    await route('apply', { ...deleteEntryRequest, snapshot: deleteEntryPreview.snapshot }, owner, 400);
    assert.deepEqual(await read('task_entries', survivingEntry.id), survivingBeforeDelete, 'Deleting one selected entry rejects the batch without changing its surviving companion');

    const projectRequest = { client_id: client.id, member: noHistory.id, project_id: projectA.id, entry_ids: [projectEntry.id] };
    const otherProjectBefore = await read('task_entries', otherProjectEntry.id);
    const projectBefore = await read('task_entries', projectEntry.id);
    const projectPreview = await route('preview', projectRequest);
    assert.deepEqual(Object.keys(projectPreview).sort(), ['client_id', 'count', 'member', 'project_id', 'snapshot']);
    assert.equal(projectPreview.project_id, projectA.id);
    const projectApplied = await route('apply', { ...projectRequest, snapshot: projectPreview.snapshot });
    assert.deepEqual(Object.keys(projectApplied).sort(), ['client_id', 'member', 'project_id', 'updated_count']);
    assert.equal(projectApplied.project_id, projectA.id);
    assert.equal(projectApplied.updated_count, 1);
    assert.equal((await read('task_entries', projectEntry.id)).member, noHistory.id);
    assert.deepEqual(await read('task_entries', otherProjectEntry.id), otherProjectBefore, 'Project-scoped apply leaves another same-client project record unchanged');
    const clientWide = await route('preview', { client_id: client.id, member: noHistory.id, entry_ids: [clientWideProjectEntry.id, otherProjectEntry.id] });
    assert.equal(clientWide.count, 2, 'Client-only selection remains able to select entries across same-client projects');
    const staleProjectRequest = { client_id: client.id, member: member.id, project_id: projectA.id, entry_ids: [staleProjectEntry.id] };
    const staleProjectPreview = await route('preview', staleProjectRequest);
    await stop(child);
    await sqlite(join(fixture, 'data/data.db'), `UPDATE task_entries SET project = '${projectB.id}' WHERE id = '${staleProjectEntry.id}'`);
    await startServer();
    await route('apply', { ...staleProjectRequest, project_id: projectB.id, snapshot: staleProjectPreview.snapshot }, owner, 409);
    assert.equal((await read('task_entries', staleProjectEntry.id)).member, '');
    const staleParentRequest = { client_id: client.id, member: member.id, project_id: projectA.id, entry_ids: [staleParentEntry.id] };
    const staleParentPreview = await route('preview', staleParentRequest);
    await api(`/api/collections/projects/records/${projectA.id}`, 'PATCH', { name: 'CA moved parent' }, owner);
    await route('apply', { ...staleParentRequest, snapshot: staleParentPreview.snapshot }, owner, 409);
    assert.equal((await read('task_entries', staleParentEntry.id)).member, '');
    const movedParentRequest = { client_id: client.id, member: member.id, project_id: projectB.id, entry_ids: [movedParentEntry.id] };
    const movedParentPreview = await route('preview', movedParentRequest);
    await api(`/api/collections/projects/records/${projectB.id}`, 'PATCH', { client: other.id }, owner);
    await route('apply', { ...movedParentRequest, snapshot: movedParentPreview.snapshot }, owner, 400);
    assert.equal((await read('task_entries', movedParentEntry.id)).member, '');
    assert.deepEqual(await read('task_entries', projectEntry.id), { ...projectBefore, member: noHistory.id, department: '', updated: (await read('task_entries', projectEntry.id)).updated });
    await route('preview', { ...request, extra: true }, owner, 400);
    await route('preview', { ...request, entry_ids: [dated.id, foreign.id] }, owner, 400);
    await route('apply', { ...request, entry_ids: [dated.id, foreign.id], snapshot: 'a'.repeat(64) }, owner, 400);
    await route('preview', { ...request, entry_ids: ['000000000000999'] }, owner, 400);
    await route('apply', { ...request, entry_ids: ['000000000000999'], snapshot: 'a'.repeat(64) }, owner, 400);
    assert.equal((await read('task_entries', dated.id)).member, '', 'Mixed invalid batches do not partially assign');
    await route('preview', { ...request, entry_ids: [dated.id, dated.id] }, owner, 400);
    const stale = await route('preview', request);
    await api(`/api/collections/team_members/records/${member.id}`, 'PATCH', { department: changedDepartment.id }, owner);
    await route('apply', { ...request, snapshot: stale.snapshot }, owner, 409);
    assert.equal((await read('task_entries', dated.id)).member, '');
    const fresh = await route('preview', request);
    const applied = await route('apply', { ...request, snapshot: fresh.snapshot });
    assert.equal(applied.updated_count, 1);
    const attributed = await read('task_entries', dated.id);
    assert.equal(attributed.member, member.id);
    assert.equal(attributed.department, changedDepartment.id);
    assert.equal(attributed.attributed_machine, '');
    await route('apply', { client_id: client.id, member: member.id, entry_ids: [dated.id, staleDateEntry.id], snapshot: 'a'.repeat(64) }, owner, 400);
    assert.equal((await read('task_entries', staleDateEntry.id)).member, '', 'Mixed already-attributed batch does not partially assign');
    assert.deepEqual(await read('work_records', raw.id), rawBefore);
    const allowedDifference = { ...attributed, member: '', department: '', updated: '' };
    const original = JSON.parse(untouched); original.updated = '';
    assert.deepEqual(allowedDifference, original);
    const preservedPreview = await route('preview', { client_id: client.id, member: noHistory.id, entry_ids: [preserved.id] });
    await route('apply', { client_id: client.id, member: noHistory.id, entry_ids: [preserved.id], snapshot: preservedPreview.snapshot });
    assert.equal((await read('task_entries', preserved.id)).department, other.id, 'Existing department is preserved');
    const noHistoryPreview = await route('preview', { client_id: client.id, member: noHistory.id, entry_ids: [missingHistory.id] });
    await route('apply', { client_id: client.id, member: noHistory.id, entry_ids: [missingHistory.id], snapshot: noHistoryPreview.snapshot });
    assert.equal((await read('task_entries', missingHistory.id)).department, '', 'No department history is not replaced with the current department');
    assert.equal((await read('task_entries', foreign.id)).member, '');

    const rollbackA = await createEntry('ca-rollback-a', client.id);
    const rollbackB = await createEntry('ca-rollback-b', client.id);
    const rollbackIds = [rollbackA.id, rollbackB.id].sort();
    const rollbackRequest = { client_id: client.id, member: member.id, entry_ids: rollbackIds };
    const rollbackBefore = await Promise.all(rollbackIds.map((id) => read('task_entries', id)));
    await stop(child);
    await sqlite(join(fixture, 'data/data.db'), `CREATE TRIGGER ca_injected_second_save BEFORE UPDATE OF member ON task_entries WHEN OLD.id = '${rollbackIds[1]}' BEGIN SELECT RAISE(ABORT, 'CA1_INJECTED_SECOND_SAVE_FAILURE'); END`);
    await startServer();
    const rollbackPreview = await route('preview', rollbackRequest);
    const failedApply = await route('apply', { ...rollbackRequest, snapshot: rollbackPreview.snapshot }, owner, 400);
    assert.equal(failedApply.message, 'Something went wrong while processing your request.');
    const rollbackAfter = await Promise.all(rollbackIds.map((id) => read('task_entries', id)));
    assert.deepEqual(rollbackAfter, rollbackBefore, 'Failed second write rolls back the entire selected record set');
    await route('apply', { client_id: client.id, member: member.id, entry_ids: [dated.id], snapshot: fresh.snapshot }, owner, 400);
  } finally {
    await stop(child);
    assert.equal(dirname(fixture), runtime);
    assert.ok(fixture.startsWith(join(runtime, 'owned-')));
  }
});
