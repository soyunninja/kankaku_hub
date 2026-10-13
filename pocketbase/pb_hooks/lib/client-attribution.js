const ID = /^[a-z0-9]{15}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ENTRY_FIELDS = ['id', 'client', 'project', 'member', 'department', 'attributed_machine', 'started_at', 'ended_at', 'updated'];

function validRequest(body, apply) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const fields = apply ? ['client_id', 'member', 'entry_ids', 'snapshot'] : ['client_id', 'member', 'entry_ids'];
  const scoped = Object.prototype.hasOwnProperty.call(body, 'project_id');
  if (scoped) fields.push('project_id');
  if (Object.keys(body).length !== fields.length || Object.keys(body).some((key) => !fields.includes(key))) return false;
  if (scoped && (typeof body.project_id !== 'string' || !ID.test(body.project_id))) return false;
  if (typeof body.client_id !== 'string' || !ID.test(body.client_id) ||
      typeof body.member !== 'string' || !ID.test(body.member) || !Array.isArray(body.entry_ids) ||
      body.entry_ids.length < 1 || body.entry_ids.length > 200 || body.entry_ids.some((id) => typeof id !== 'string' || !ID.test(id)) ||
      new Set(body.entry_ids).size !== body.entry_ids.length) return false;
  return !apply || (typeof body.snapshot === 'string' && DIGEST.test(body.snapshot));
}

function placeholders(ids) {
  return ids.map((_, i) => '{:id' + i + '}').join(', ');
}
function params(selection) {
  const result = { client: selection.client_id };
  selection.entry_ids.forEach((id, i) => { result['id' + i] = id; });
  return result;
}
function select(selection) {
  const projectClause = selection.project_id ? ' AND project = {:project}' : '';
  const bound = params(selection);
  if (selection.project_id) bound.project = selection.project_id;
  return { sql: "SELECT " + ENTRY_FIELDS.join(', ') + " FROM task_entries WHERE client = {:client} AND member = ''" + projectClause + " AND id IN (" + placeholders(selection.entry_ids) + ') ORDER BY id', params: bound };
}
function update(selection, row, department) {
  const projectClause = selection.project_id ? ' AND project = {:project}' : '';
  const queryParams = { id: row.id, client: selection.client_id, member: selection.member, department: department,
    old_department: row.department, attributed_machine: row.attributed_machine, started_at: row.started_at, ended_at: row.ended_at, updated: row.updated };
  if (selection.project_id) queryParams.project = selection.project_id;
  return { sql: "UPDATE task_entries SET member = {:member}, department = CASE WHEN department = '' THEN {:department} ELSE department END, updated = strftime('%Y-%m-%d %H:%M:%fZ', 'now') WHERE id = {:id} AND client = {:client}" + projectClause + " AND member = '' AND department = {:old_department} AND attributed_machine = {:attributed_machine} AND started_at = {:started_at} AND ended_at = {:ended_at} AND updated = {:updated}", params: queryParams };
}
function parseUtcInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error('History timestamps must be PocketBase UTC instants.');
  }
  const normalized = value.replace(' ', 'T');
  const time = Date.parse(normalized);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== normalized) {
    throw new Error('History contains an invalid UTC timestamp.');
  }
  return time;
}
function rawHistory(value) {
  if (value && typeof value.string === 'function') value = value.string();
  if (value == null) return [];
  if (typeof value === 'string') {
    if (!value.trim()) return [];
    value = JSON.parse(value);
  }
  if (!Array.isArray(value)) throw new Error('Department history must be an array.');
  return value;
}
function decodeDepartmentHistory(historyValue) { return rawHistory(historyValue); }
function historicalDepartment(historyValue, instant) {
  const target = parseUtcInstant(instant);
  const items = rawHistory(historyValue);
  const byTime = new Map();
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        typeof item.at !== 'string' || typeof item.value !== 'string') {
      throw new Error('Department history contains a malformed item.');
    }
    const time = parseUtcInstant(item.at);
    if (item.value !== '' && !ID.test(item.value)) throw new Error('Department history contains an invalid department id.');
    if (byTime.has(time) && byTime.get(time) !== item.value) {
      throw new Error('Department history has conflicting values at the same timestamp.');
    }
    byTime.set(time, item.value);
  }
  let latest = -Infinity;
  let department = '';
  for (const [time, value] of byTime) {
    if (time <= target && time > latest) { latest = time; department = value; }
  }
  return department;
}

function preview(selection, state, hash) {
  const snapshot = JSON.stringify([selection.client_id, selection.project_id || null, selection.member, state.client, state.project || null, state.member, state.rows]);
  const result = { client_id: selection.client_id, member: selection.member, count: state.rows.length, snapshot: hash(snapshot) };
  if (selection.project_id) result.project_id = selection.project_id;
  return result;
}
function assertFresh(request, current) {
  for (const key of ['client_id', 'member', 'snapshot', 'project_id']) {
    if (request[key] !== current[key]) throw new Error('Client attribution preview is stale.');
  }
  if (Object.prototype.hasOwnProperty.call(request, 'count') && request.count !== current.count) {
    throw new Error('Client attribution preview is stale.');
  }
}
module.exports = { validRequest, select, update, decodeDepartmentHistory, historicalDepartment, preview, assertFresh };
