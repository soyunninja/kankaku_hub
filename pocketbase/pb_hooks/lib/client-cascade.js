function shouldCascade(previousActive, nextActive) {
  return previousActive && !nextActive;
}

function handleClientUpdate(event) {
  const originalApp = event.app;
  return originalApp.runInTransaction((tx) => {
    // e.next() must save the triggering client through this same transaction.
    event.app = tx;
    try {
      const current = tx.findRecordById('clients', event.record.id);
      if (!shouldCascade(current.getBool('active'), event.record.getBool('active'))) {
        return event.next();
      }

      const projects = tx.findRecordsByFilter(
        'projects',
        'client = {:client}',
        'id',
        0,
        0,
        { client: event.record.id },
      );
      for (const project of projects) {
        if (project.getBool('active')) {
          project.set('active', false);
          tx.save(project);
        }
      }
      const taskCascade = require('./task-close-cascade.js');
      taskCascade.closeClientTasks(tx, event.record.id);
      return event.next();
    } finally {
      event.app = originalApp;
    }
  });
}

module.exports = { shouldCascade, handleClientUpdate };
