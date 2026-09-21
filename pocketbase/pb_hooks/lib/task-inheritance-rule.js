/* eslint-disable */
// Pure rule behind task-inheritance.pb.js — no PocketBase globals, so it runs
// under plain Node for tests.
//
// An agent session is attached to a task as a whole (the web's "sessions
// without task" queue). Work recorded in that same session AFTERWARDS arrives
// with no task: the extension never chooses one. Without this rule those rows
// are invisible — the queue only lists sessions where NO entry has a task.
//
// Returns the task id to set on the new entry, or "" to leave it alone. It
// never guesses: a session whose assigned entries point at two different tasks
// inherits nothing, and an entry that already names a task is never touched.
function inheritedTaskId(input) {
  if (input.ownTask) return "";
  if (!input.sessionId) return "";
  const distinct = [];
  for (const id of input.sessionTaskIds || []) {
    if (id && distinct.indexOf(id) === -1) distinct.push(id);
  }
  return distinct.length === 1 ? distinct[0] : "";
}

module.exports = { inheritedTaskId };
