/// <reference path="../pb_data/types.d.ts" />

routerAdd('POST', '/api/kankaku/team-members/create-with-machine', (e) => {
  const rule = require(`${__hooks}/lib/team-member-create.js`);
  if (!e.auth || e.auth.collection().name !== 'users' || e.auth.getString('role') !== 'owner') {
    throw new ForbiddenError('Only the owner may create team members.');
  }
  const request = rule.validateRequest(e.requestInfo().body);
  let response;
  e.app.runInTransaction((tx) => {
    const machines = tx.findRecordsByFilter('machines', 'id = {:id}', '', 1, 0, { id: request.machine_id });
    const machine = machines.length ? machines[0] : null;
    try { rule.assertClaimable(machine); }
    catch (error) {
      if (error.status === 409) throw new ApiError(409, error.message);
      throw error;
    }

    if (request.department) {
      const departments = tx.findRecordsByFilter('departments', 'id = {:id}', '', 1, 0, { id: request.department });
      const department = departments.length ? departments[0] : null;
      rule.assertActiveDepartment(department);
    }

    const memberCollection = tx.findCollectionByNameOrId('team_members');
    const member = new Record(memberCollection);
    member.set('name', request.name);
    member.set('department', request.department);
    member.set('active', true);
    tx.save(member);

    machine.set('member', member.id);
    tx.save(machine);
    response = {
      member: { id: member.id, name: member.getString('name'), department: member.getString('department'), active: member.getBool('active') },
      machine: { id: machine.id, key: machine.getString('key'), name: machine.getString('name'), member: machine.getString('member'), active: machine.getBool('active') },
    };
  });
  return e.json(200, response);
}, $apis.requireAuth('users'));
