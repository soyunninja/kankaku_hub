// Fixed SQL only; all request and catalog values are scalar bound parameters.
const ELIGIBLE = "machine = {:key} COLLATE BINARY AND member = '' AND (attributed_machine = '' OR attributed_machine = {:machine})";
function select(key, machineId) {
  return { sql: 'SELECT id, started_at, department, attributed_machine FROM task_entries WHERE ' + ELIGIBLE + ' ORDER BY id',
    params: { key: key, machine: machineId } };
}
function update(preview, row, department) {
  return {
    sql: "UPDATE task_entries SET member = {:member}, attributed_machine = {:machine}, department = CASE WHEN department = '' THEN {:department} ELSE department END, updated = strftime('%Y-%m-%d %H:%M:%fZ', 'now') WHERE id = {:id} AND " + ELIGIBLE,
    params: { id: row.id, key: preview.machine_key, member: preview.member, machine: preview.machine_id, department: department },
  };
}
function preview(machine, member, rows, hash) {
  if (!machine.member || member.id !== machine.member) throw new Error('Machine must have an assigned member.');
  return { machine_id: machine.id, machine_key: machine.key, member: member.id, count: rows.length,
    snapshot: hash(JSON.stringify([machine, member, rows])) };
}
function assertFresh(request, current) {
  for (const field of ['machine_id', 'machine_key', 'member', 'count', 'snapshot']) {
    if (request[field] !== current[field]) throw new Error('Backfill preview is stale.');
  }
}
function validRequest(body, apply) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const fields = apply ? ['machine_id', 'machine_key', 'member', 'count', 'snapshot'] : ['machine_id'];
  if (Object.keys(body).length !== fields.length || Object.keys(body).some((key) => fields.indexOf(key) < 0)) return false;
  if (typeof body.machine_id !== 'string' || !/^[a-zA-Z0-9]{1,15}$/.test(body.machine_id)) return false;
  if (!apply) return true;
  return typeof body.machine_key === 'string' && body.machine_key.length > 0 && body.machine_key.length <= 200 &&
    typeof body.member === 'string' && /^[a-zA-Z0-9]{1,15}$/.test(body.member) &&
    Number.isSafeInteger(body.count) && body.count >= 0 && typeof body.snapshot === 'string' && /^[a-f0-9]{64}$/.test(body.snapshot);
}
module.exports = { select, update, preview, assertFresh, validRequest };
