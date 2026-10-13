/// <reference path="../pb_data/types.d.ts" />

onRecordUpdate((e) => {
  const cascade = require(`${__hooks}/lib/client-cascade.js`);
  return cascade.handleClientUpdate(e);
}, 'clients');
