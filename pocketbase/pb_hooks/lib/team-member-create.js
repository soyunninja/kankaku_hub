function invalid(message) {
  const error = new Error(message || 'Invalid member creation request.');
  error.status = 400;
  return error;
}

function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid();
  const allowed = ['name', 'department', 'machine_id'];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw invalid();
  if (typeof body.name !== 'string' || typeof body.machine_id !== 'string' ||
      (body.department !== undefined && typeof body.department !== 'string')) throw invalid();
  const name = body.name.trim();
  const machineId = body.machine_id.trim();
  const department = body.department === undefined ? '' : body.department.trim();
  if (!name || name.length > 200 || !machineId) throw invalid();
  return { name: name, department: department, machine_id: machineId };
}

function conflict() {
  const error = new Error('Selected machine is no longer active and unassigned.');
  error.status = 409;
  return error;
}

function assertClaimable(machine) {
  if (!machine || machine.getBool('active') !== true || machine.getString('member') !== '') throw conflict();
}

function assertActiveDepartment(department) {
  if (!department || department.getBool('active') !== true) throw invalid('Select an existing active department.');
}

module.exports = { validateRequest: validateRequest, assertClaimable: assertClaimable,
  assertActiveDepartment: assertActiveDepartment };
