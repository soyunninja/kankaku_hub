function requiresActiveParent(projectActive, parentActive) {
  return projectActive && !parentActive;
}

function isActiveParent(project, app) {
  const client = app.findRecordById('clients', project.getString('client'));
  return client.getBool('active');
}

function handleProjectUpdate(event) {
  const originalApp = event.app;
  return originalApp.runInTransaction((tx) => {
    event.app = tx;
    try {
      const current = tx.findRecordById('projects', event.record.id);
      const nextActive = event.record.getBool('active');
      if (requiresActiveParent(nextActive, isActiveParent(event.record, tx))) {
        throw new BadRequestError('Cannot activate a project while its client is inactive.');
      }
      if (current.getBool('active') && !nextActive) {
        require('./task-close-cascade.js').closeProjectTasks(tx, event.record.id);
      }
      return event.next();
    } finally {
      event.app = originalApp;
    }
  });
}

function handleProjectCreate(event) {
  const originalApp = event.app;
  return originalApp.runInTransaction((tx) => {
    event.app = tx;
    try {
      if (requiresActiveParent(event.record.getBool('active'), isActiveParent(event.record, tx))) {
        throw new BadRequestError('Cannot activate a project while its client is inactive.');
      }
      return event.next();
    } finally {
      event.app = originalApp;
    }
  });
}

module.exports = { requiresActiveParent, isActiveParent, handleProjectUpdate, handleProjectCreate };
