/// <reference path="../pb_data/types.d.ts" />

// When a `task_entries` row gets linked to a task, an `open` task moves to
// `doing` on its own. The hub does it, not a client, so the rule holds no
// matter who made the link: the web's "sessions without task" queue today,
// the pi extension choosing a task at session start later.
//
// It deliberately stops there. `done` is never set and a `done` task is never
// reopened — see lib/task-status-rule.js for why.
//
// This runs with the app's own privileges, so a `service` account (which the
// API rules forbid from writing `tasks`) can cause this ONE transition and
// nothing else. That is intended: it is a consequence of recording work, not
// a general write path into `tasks`.
//
// GOJA CONSTRAINT (see favicon.pb.js): a hook handler cannot see this file's
// top-level scope, so everything it needs is required INSIDE the handler.
//
// A failure here must never fail the write that triggered it: measurement
// data is what matters, the status is a convenience. Errors are logged and
// swallowed, and `e.next()` always runs.
function registerTaskAutoDoing(register) {
  register((e) => {
    try {
      const rule = require(`${__hooks}/lib/task-status-rule.js`);
      const taskId = e.record.get("task");
      if (taskId) {
        const task = e.app.findRecordById("tasks", taskId);
        const next = rule.nextStatusOnLinkedWork(task.get("status"));
        if (next) {
          task.set("status", next);
          e.app.save(task);
        }
      }
    } catch (err) {
      e.app.logger().warn("task-auto-doing: could not update task status", "error", String(err));
    }
    return e.next();
  }, "task_entries");
}

registerTaskAutoDoing(onRecordAfterCreateSuccess);
registerTaskAutoDoing(onRecordAfterUpdateSuccess);
