// Source-only until isolated PocketBase verification confirms transaction and SQL APIs.
// Raw SQL intentionally bypasses the attribution-preserving entry model hook.
routerAdd('POST', '/api/kankaku/team-backfill/{action}', (e) => {
  const rule = require(`${__hooks}/lib/team-backfill.js`);
  const history = require(`${__hooks}/lib/team-attribution.js`);
  // Explicit auth collection check: another auth collection cannot impersonate an owner.
  if (!e.auth || e.auth.collection().name !== 'users' || e.auth.getString('role') !== 'owner') {
    throw new ForbiddenError('Only the owner may backfill team attribution.');
  }
  const action = e.request.pathValue('action');
  if (action !== 'preview' && action !== 'apply') throw new NotFoundError('Unknown backfill action.');
  const apply = action === 'apply';
  const body = e.requestInfo().body;
  if (!rule.validRequest(body, apply)) throw new BadRequestError('Invalid backfill request.');

  function readSnapshot(tx) {
    // Query lists so a missing record is distinct from a database error.
    const machines = tx.findRecordsByFilter('machines', 'id = {:id}', '', 1, 0, { id: body.machine_id });
    if (!machines.length) {
      if (apply) throw new ApiError(409, 'Backfill preview is stale; preview again.');
      throw new NotFoundError('Unknown machine.');
    }
    const machine = machines[0];
    const memberId = machine.getString('member');
    if (apply && memberId !== body.member) throw new ApiError(409, 'Backfill preview is stale; preview again.');
    if (!memberId) throw new BadRequestError('Machine must have an assigned member.');
    const member = tx.findRecordById('team_members', memberId);
    const query = rule.select(machine.getString('key'), machine.id);
    // Fail closed rather than silently applying a subset of a large machine.
    const result = arrayOf(new DynamicModel({ id: '', started_at: '', department: '', attributed_machine: '' }));
    tx.db().newQuery(query.sql + ' LIMIT 10001').bind(query.params).all(result);
    if (result.length > 10000) throw new BadRequestError('Backfill exceeds the 10000 entry limit.');
    const rows = [];
    for (const row of result) rows.push({ id: row.id, started_at: row.started_at,
      department: row.department, attributed_machine: row.attributed_machine });
    const departmentHistory = history.decodeHistory(member.get('department_history'));
    const preview = rule.preview({ id: machine.id, key: machine.getString('key'), member: memberId,
      updated: machine.getString('updated'), history: history.decodeHistory(machine.get('assignment_history')) },
    { id: member.id, updated: member.getString('updated'), history: departmentHistory }, rows, (s) => $security.sha256(s));
    return { preview: preview, rows: rows, history: departmentHistory };
  }

  let response;
  // Read and write using only tx, never the outer app. A stale read/write upgrade
  // or any failed row must abort the whole transaction, not return partial success.
  e.app.runInTransaction((tx) => {
    const state = readSnapshot(tx);
    if (!apply) { response = state.preview; return; }
    try { rule.assertFresh(body, state.preview); }
    catch (_) { throw new ApiError(409, 'Backfill preview is stale; preview again.'); }
    let updated = 0;
    for (const row of state.rows) {
      const department = history.at(state.history, row.started_at);
      const query = rule.update(state.preview, row, department);
      tx.db().newQuery(query.sql).bind(query.params).execute();
      const count = new DynamicModel({ n: 0 });
      tx.db().newQuery('SELECT changes() AS n').one(count);
      if (count.n !== 1) throw new ApiError(409, 'Backfill changed concurrently; preview again.');
      updated += count.n;
    }
    if (updated !== state.preview.count) throw new ApiError(409, 'Backfill count changed.');
    response = { machine_id: state.preview.machine_id, machine_key: state.preview.machine_key,
      member: state.preview.member, updated_count: updated };
  });
  // Respond only after the transaction has successfully committed.
  return e.json(200, response);
}, $apis.requireAuth('users'));
