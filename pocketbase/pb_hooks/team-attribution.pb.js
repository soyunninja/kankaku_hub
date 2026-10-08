/// <reference path="../pb_data/types.d.ts" />

// Model hooks cover regular REST, batch, and privileged app saves alike.
// Keep history and the current assignment in the same atomic record write.
onRecordCreate((e) => {
  const collection = e.record.collection().name;
  const field = collection === 'machines' ? 'member' : 'department';
  const history = collection === 'machines' ? 'assignment_history' : 'department_history';
  e.record.set(history, [{ at: new Date().toISOString(), value: e.record.getString(field) }]);
  return e.next();
}, 'machines', 'team_members');

onRecordUpdate((e) => {
  const rule = require(`${__hooks}/lib/team-attribution.js`);
  return e.app.runInTransaction((tx) => {
    // Reload under the write transaction; never trust a stale request's history.
    e.app = tx;
    const collection = e.record.collection().name;
    const current = tx.findRecordById(collection, e.record.id);
    if (collection === 'machines' && current.getString('key') !== e.record.getString('key')) {
      throw new BadRequestError('Machine keys are immutable.');
    }
    const field = collection === 'machines' ? 'member' : 'department';
    const history = collection === 'machines' ? 'assignment_history' : 'department_history';
    const items = rule.decodeHistory(current.get(history));
    // Ensure a strict order even for multiple writes in the same millisecond.
    const now = rule.nextInstant(items, Date.now());
    e.record.set(history, rule.append(items, current.getString(field), e.record.getString(field), now));
    return e.next();
  });
}, 'machines', 'team_members');

onRecordCreate((e) => {
  const rule = require(`${__hooks}/lib/team-attribution.js`);
  // Ignore every supplied attribution field, including a forged empty value.
  for (const field of ['attributed_machine', 'member', 'department']) e.record.set(field, '');
  const key = e.record.getString('machine');
  if (key) {
    // List queries distinguish no match from a database failure. Fail closed on errors.
    const machines = e.app.findRecordsByFilter('machines', 'key = {:key}', '', 1, 0, { key: key });
    if (machines.length) {
      const machine = machines[0];
      const started = e.record.getString('started_at');
      const memberId = rule.at(machine.get('assignment_history'), started);
      e.record.set('attributed_machine', machine.id);
      e.record.set('member', memberId);
      if (memberId) {
        const member = e.app.findRecordById('team_members', memberId);
        e.record.set('department', rule.at(member.get('department_history'), started));
      }
    }
  }
  return e.next();
}, 'task_entries');

onRecordUpdate((e) => {
  const original = e.record.original();
  // Measurement retries may extend ended_at, but cannot repurpose an identity.
  for (const field of ['task_id', 'machine', 'started_at']) {
    if (e.record.getString(field) !== original.getString(field)) {
      throw new BadRequestError('Entry attribution identity is immutable: ' + field);
    }
  }
  for (const field of ['attributed_machine', 'member', 'department']) {
    e.record.set(field, original.getString(field));
  }
  return e.next();
}, 'task_entries');
