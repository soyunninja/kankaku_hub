// Pure helper for pb_hooks/last-activity.pb.js (goja and Node compatible).
//
// Given the newest started_at and the newest settled_at found in
// work_records, return the most recent of both as an ISO-8601 UTC string,
// or null when neither is a valid date. PocketBase stores dates as
// "YYYY-MM-DD HH:MM:SS.sssZ", which is normalised to "T" form here.
function toTime(value) {
  if (typeof value !== 'string' || value === '') return null;
  const time = Date.parse(value.replace(' ', 'T'));
  return Number.isNaN(time) ? null : time;
}

function lastActivityAt(startedAt, settledAt) {
  const times = [toTime(startedAt), toTime(settledAt)].filter((t) => t !== null);
  if (times.length === 0) return null;
  return new Date(Math.max.apply(null, times)).toISOString();
}

module.exports = { lastActivityAt };
