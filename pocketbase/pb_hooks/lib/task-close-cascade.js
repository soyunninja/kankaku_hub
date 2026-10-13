// CommonJS/ES5-compatible because this module runs in PocketBase's Goja hooks.
function closeProjectTasks(app, projectId) {
  const tasks = app.findRecordsByFilter(
    'tasks',
    'project = {:project} && status != {:closed}',
    'id',
    0,
    0,
    { project: projectId, closed: 'closed' },
  );
  for (const task of tasks) {
    task.set('status', 'closed');
    app.save(task);
  }
  return tasks.length;
}

function closeClientTasks(app, clientId) {
  const projects = app.findRecordsByFilter(
    'projects',
    'client = {:client}',
    'id',
    0,
    0,
    { client: clientId },
  );
  let closed = 0;
  for (const project of projects) closed += closeProjectTasks(app, project.id);
  return closed;
}

module.exports = { closeProjectTasks, closeClientTasks };
