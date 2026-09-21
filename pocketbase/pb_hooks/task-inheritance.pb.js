/// <reference path="../pb_data/types.d.ts" />

// A new `task_entries` row with no task inherits the task its session is
// already attached to — see lib/task-inheritance-rule.js for the rule and why.
//
// Runs BEFORE the row is saved (`onRecordCreate`), so the row is born with
// the task and task-auto-doing.pb.js's after-create hook then sees it too.
// Only on create: an update never re-inherits, so clearing a task by hand in
// the web stays cleared.
//
// GOJA CONSTRAINT (see favicon.pb.js): a handler cannot see this file's
// top-level scope, so everything it needs is required INSIDE it.
//
// A failure here must never fail the write: measurement data is what matters.
onRecordCreate((e) => {
  try {
    const rule = require(`${__hooks}/lib/task-inheritance-rule.js`);
    const sessionId = e.record.get("session_id");
    const ownTask = e.record.get("task");
    if (!ownTask && sessionId) {
      const rows = arrayOf(new DynamicModel({ task: "" }));
      e.app
        .db()
        .newQuery("SELECT DISTINCT task FROM task_entries WHERE session_id = {:sid} AND task != '' LIMIT 3")
        .bind({ sid: sessionId })
        .all(rows);
      const taskId = rule.inheritedTaskId({ ownTask: ownTask, sessionId: sessionId, sessionTaskIds: rows.map((row) => row.task) });
      if (taskId) e.record.set("task", taskId);
    }
  } catch (err) {
    e.app.logger().warn("task-inheritance: could not inherit the session's task", "error", String(err));
  }
  return e.next();
}, "task_entries");
