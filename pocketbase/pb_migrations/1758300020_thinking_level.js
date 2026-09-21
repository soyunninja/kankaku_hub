/// <reference path="../pb_data/types.d.ts" />

// The model's reasoning effort ("thinking level") at the time a record
// settled, as the agent names it — for pi: off, minimal, low, medium, high,
// xhigh. Free text on purpose: the hub is agent-agnostic and another agent
// may use other names. Optional: rows synced before this field existed, and
// agents that cannot report it, leave it empty. On BOTH collections, like
// `model`: an orchestrator and its subagents can run at different efforts.
migrate((app) => {
  for (const name of ["task_entries", "work_records"]) {
    const collection = app.findCollectionByNameOrId(name);
    collection.fields.add(new TextField({ name: "thinking_level", required: false, max: 40 }));
    app.save(collection);
  }
}, (app) => {
  for (const name of ["task_entries", "work_records"]) {
    const collection = app.findCollectionByNameOrId(name);
    collection.fields.removeByName("thinking_level");
    app.save(collection);
  }
});
