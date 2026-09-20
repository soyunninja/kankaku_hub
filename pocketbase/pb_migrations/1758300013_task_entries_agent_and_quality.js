/// <reference path="../pb_data/types.d.ts" />

// Makes the hub agent-agnostic: every `task_entries` row says WHICH coding
// agent produced it and HOW WELL each figure was measured, so the web can
// show what it has, label what is approximate, and never blend figures that
// are not comparable without saying so.
//
// The quality fields are selects with explicit values, NOT bools: PocketBase
// bools have no default and read back as `false`, which would make "not
// measured" indistinguishable from "unknown / written by an older client".
// An empty value always means "not reported".
//
//   agent             which agent ran the work, lowercase slug ("pi", "opencode")
//   agent_version     that agent's own version, free text
//   plugin            the integration that wrote the row ("kankaku" for the pi package)
//   plugin_version    its version
//   waiting_quality   measured    — time blocked on the human was observed and
//                                   excluded, so work_ms < wall_ms is meaningful
//                     unavailable — the agent exposes no such signal; work_ms
//                                   equals wall_ms and is an UPPER bound
//   cost_quality      measured    — provider-reported cost per turn
//                     estimated   — computed from token counts and a price table
//                     unknown     — cost is 0 because it could not be known
//   subagent_linkage  linked         — child work is folded into this row
//                     unlinked       — children exist but could not be joined
//                     not_applicable — the run used no subagents
//
// Existing rows were all written by the pi package, whose measurement is the
// full one, so they are backfilled accordingly rather than left "not reported".
migrate((app) => {
  const collection = app.findCollectionByNameOrId("task_entries");

  collection.fields.add(new TextField({ name: "agent", required: false, max: 40 }));
  collection.fields.add(new TextField({ name: "agent_version", required: false, max: 60 }));
  collection.fields.add(new TextField({ name: "plugin", required: false, max: 60 }));
  collection.fields.add(new TextField({ name: "plugin_version", required: false, max: 60 }));
  collection.fields.add(new SelectField({
    name: "waiting_quality",
    required: false,
    maxSelect: 1,
    values: ["measured", "unavailable"],
  }));
  collection.fields.add(new SelectField({
    name: "cost_quality",
    required: false,
    maxSelect: 1,
    values: ["measured", "estimated", "unknown"],
  }));
  collection.fields.add(new SelectField({
    name: "subagent_linkage",
    required: false,
    maxSelect: 1,
    values: ["linked", "unlinked", "not_applicable"],
  }));

  collection.addIndex("idx_task_entries_agent_started", false, "agent, started_at", "");

  app.save(collection);

  app.db().newQuery(
    "UPDATE task_entries SET " +
      "agent = 'pi', plugin = 'kankaku', " +
      "waiting_quality = 'measured', cost_quality = 'measured', " +
      "subagent_linkage = CASE WHEN subagent_count > 0 THEN 'linked' ELSE 'not_applicable' END " +
      "WHERE agent = '' OR agent IS NULL"
  ).execute();
}, (app) => {
  const collection = app.findCollectionByNameOrId("task_entries");

  collection.removeIndex("idx_task_entries_agent_started");
  for (const name of ["agent", "agent_version", "plugin", "plugin_version", "waiting_quality", "cost_quality", "subagent_linkage"]) {
    collection.fields.removeByName(name);
  }

  return app.save(collection);
});
