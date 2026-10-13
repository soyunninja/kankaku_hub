// This privileged route bypasses the immutable ordinary task_entries update hook.
routerAdd('POST', '/api/kankaku/client-attribution/{action}', (e) => {
  const rule = require(`${__hooks}/lib/client-attribution.js`);
  if (!e.auth || e.auth.collection().name !== 'users' || e.auth.getString('role') !== 'owner') {
    throw new ForbiddenError('Only the owner may attribute client work.');
  }
  const action = e.request.pathValue('action');
  if (action !== 'preview' && action !== 'apply') throw new NotFoundError('Unknown client attribution action.');
  const apply = action === 'apply';
  const body = e.requestInfo().body;
  if (!rule.validRequest(body, apply)) throw new BadRequestError('Invalid client attribution request.');

  function readSnapshot(tx) {
    const clients = tx.findRecordsByFilter('clients', 'id = {:id}', '', 1, 0, { id: body.client_id });
    const members = tx.findRecordsByFilter('team_members', 'id = {:id}', '', 1, 0, { id: body.member });
    if (!clients.length) throw new NotFoundError('Unknown client.');
    if (!members.length) throw new NotFoundError('Unknown team member.');
    const client = clients[0], member = members[0];
    let project = null;
    if (body.project_id) {
      const projects = tx.findRecordsByFilter('projects', 'id = {:id}', '', 1, 0, { id: body.project_id });
      if (!projects.length) throw new NotFoundError('Unknown project.');
      project = projects[0];
      if (project.getString('client') !== body.client_id) throw new BadRequestError('Project must belong to the requested client.');
    }
    const selectedQuery = rule.select(body);
    const eligible = arrayOf(new DynamicModel({ id: '' }));
    tx.db().newQuery(selectedQuery.sql).bind(selectedQuery.params).all(eligible);
    if (eligible.length !== body.entry_ids.length) throw new BadRequestError('Selected entries must belong to this client and remain unattributed.');
    const departmentHistory = rule.decodeDepartmentHistory(member.get('department_history'));
    const referencedDepartments = [...new Set(departmentHistory.map((item) => item && item.value).filter((value) => value))];
    for (const departmentId of referencedDepartments) {
      const references = tx.findRecordsByFilter('departments', 'id = {:id}', '', 1, 0, { id: departmentId });
      if (!references.length) throw new BadRequestError('Department history references an unknown department.');
    }
    const rows = [];
    for (const id of body.entry_ids) {
      const matches = tx.findRecordsByFilter('task_entries', 'id = {:id}', '', 1, 0, { id: id });
      if (!matches.length) throw new BadRequestError('One or more selected entries are missing; select again.');
      const record = matches[0];
      if (record.getString('client') !== body.client_id) throw new BadRequestError('Selected entries must belong to the requested client.');
      if (body.project_id && record.getString('project') !== body.project_id) throw new BadRequestError('Selected entries must belong directly to the requested project.');
      if (record.getString('member') !== '') throw new BadRequestError('Selected entries must be unattributed; select again.');
      const startedAt = record.getString('started_at');
      const historicalDepartment = rule.historicalDepartment(departmentHistory, startedAt);
      if (!record.getString('department') && historicalDepartment) {
        const departments = tx.findRecordsByFilter('departments', 'id = {:id}', '', 1, 0, { id: historicalDepartment });
        if (!departments.length) throw new BadRequestError('Historical department no longer exists.');
      }
      rows.push({ id: record.id, client: record.getString('client'), project: record.getString('project'), member: record.getString('member'),
        department: record.getString('department'), attributed_machine: record.getString('attributed_machine'),
        started_at: startedAt, ended_at: record.getString('ended_at'), updated: record.getString('updated'),
        historical_department: historicalDepartment });
    }
    rows.sort((a, b) => a.id.localeCompare(b.id));
    const state = {
      client: { id: client.id, active: client.getBool('active'), updated: client.getString('updated') },
      project: project ? { id: project.id, client: project.getString('client'), updated: project.getString('updated') } : null,
      member: { id: member.id, active: member.getBool('active'), department: member.getString('department'),
        updated: member.getString('updated'), history: departmentHistory },
      rows,
    };
    return { preview: rule.preview(body, state, (value) => $security.sha256(value)), state };
  }

  let response;
  e.app.runInTransaction((tx) => {
    const current = readSnapshot(tx);
    if (!apply) { response = current.preview; return; }
    try { rule.assertFresh(body, current.preview); }
    catch (_) { throw new ApiError(409, 'Client attribution preview is stale; preview again.'); }
    let updated = 0;
    for (const row of current.state.rows) {
      const department = row.department || row.historical_department;
      const query = rule.update(body, row, department);
      tx.db().newQuery(query.sql).bind(query.params).execute();
      const changed = new DynamicModel({ n: 0 });
      tx.db().newQuery('SELECT changes() AS n').one(changed);
      if (changed.n !== 1) throw new ApiError(409, 'Selected entries changed concurrently; preview again.');
      updated += changed.n;
    }
    if (updated !== body.entry_ids.length) throw new ApiError(409, 'Selected entries changed concurrently; preview again.');
    response = { client_id: body.client_id, member: body.member, updated_count: updated };
    if (body.project_id) response.project_id = body.project_id;
  });
  return e.json(200, response);
}, $apis.requireAuth('users'));
