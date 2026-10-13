/// <reference path="../pb_data/types.d.ts" />

function guardProjectCreate(event) {
  return require(`${__hooks}/lib/project-lifecycle.js`).handleProjectCreate(event);
}

function guardProjectUpdate(event) {
  return require(`${__hooks}/lib/project-lifecycle.js`).handleProjectUpdate(event);
}

onRecordCreate(guardProjectCreate, 'projects');
onRecordUpdate(guardProjectUpdate, 'projects');
