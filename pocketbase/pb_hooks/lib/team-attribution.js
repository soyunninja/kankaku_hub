// JSONRaw is a byte-like Go value, not a JavaScript history array.
function decodeHistory(history) {
  if (history && typeof history.string === 'function') history = history.string();
  if (typeof history === 'string') history = history.trim() ? JSON.parse(history) : null;
  if (history == null) return [];
  if (!Array.isArray(history)) throw new Error('Expected a JSON history array.');
  return history;
}

// Histories are server-generated, ordered UTC instants. No retroactive edits.
function at(history, instant) {
  const time = Date.parse(instant);
  let value = '';
  for (const item of decodeHistory(history)) {
    if (item && Number.isFinite(Date.parse(item.at)) && Date.parse(item.at) <= time) value = item.value;
  }
  return value;
}

function nextInstant(history, now) {
  let time = now;
  for (const item of decodeHistory(history)) {
    const previous = item ? Date.parse(item.at) : NaN;
    if (Number.isFinite(previous)) time = Math.max(time, previous + 1);
  }
  // Date's representable range is narrower than finite JavaScript numbers.
  if (!Number.isFinite(time) || Math.abs(time) > 8640000000000000) {
    throw new Error('History timestamp is outside the supported date range.');
  }
  return new Date(time).toISOString();
}

function append(history, previous, value, now) {
  const items = decodeHistory(history).slice();
  if (previous !== value) items.push({ at: now, value: value });
  return items;
}

module.exports = { decodeHistory: decodeHistory, nextInstant: nextInstant, at: at, append: append };
