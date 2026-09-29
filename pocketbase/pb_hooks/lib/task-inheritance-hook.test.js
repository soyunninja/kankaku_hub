"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");
const { join } = require("node:path");

const hookSource = readFileSync(join(__dirname, "..", "task-inheritance.pb.js"), "utf8");
const inheritanceRule = require("./task-inheritance-rule.js");

function runCreate({ fields, sessionTasks = [], relations = {}, lookupFailure = "" }) {
  let handler;
  let nextCalls = 0;
  const warnings = [];
  const values = { ...fields };
  const record = {
    get(name) { return values[name] ?? ""; },
    set(name, value) { values[name] = value; },
  };
  const app = {
    db() {
      return {
        newQuery() {
          return {
            bind() { return this; },
            all(rows) { rows.push(...sessionTasks.map((task) => ({ task }))); },
          };
        },
      };
    },
    findRecordById(collection, id) {
      if (`${collection}:${id}` === lookupFailure) throw new Error("lookup failed");
      const found = relations[collection]?.[id];
      if (!found) throw new Error("record not found");
      return { get(name) { return found[name] ?? ""; } };
    },
    logger() { return { warn(...args) { warnings.push(args); } }; },
  };

  runInNewContext(hookSource, {
    onRecordCreate(fn, collection) {
      assert.equal(collection, "task_entries");
      handler = fn;
    },
    DynamicModel: function DynamicModel(initial) { Object.assign(this, initial); },
    arrayOf() { return []; },
    __hooks: "/hooks",
    require(path) {
      assert.equal(path, "/hooks/lib/task-inheritance-rule.js");
      return inheritanceRule;
    },
  }, { filename: "task-inheritance.pb.js" });
  assert.equal(typeof handler, "function");
  handler({ record, app, next() { nextCalls++; } });
  assert.equal(nextCalls, 1, "the create handler must continue exactly once");
  return { values, warnings };
}

const relations = {
  tasks: { task1: { project: "project1" } },
  projects: { project1: { client: "client1" } },
  clients: {
    unassigned: { unassigned: true },
    regular: { unassigned: false },
  },
};

test("a unique session task fills project and client for an unassigned entry", () => {
  const { values } = runCreate({
    fields: { session_id: "session1", task: "", project: "", client: "unassigned" },
    sessionTasks: ["task1"],
    relations,
  });
  assert.equal(values.task, "task1");
  assert.equal(values.project, "project1");
  assert.equal(values.client, "client1");
});

test("a regular client and project remain untouched when the task is inherited", () => {
  const { values } = runCreate({
    fields: { session_id: "session1", task: "", project: "ownProject", client: "regular" },
    sessionTasks: ["task1"],
    relations,
  });
  assert.equal(values.task, "task1");
  assert.equal(values.project, "ownProject");
  assert.equal(values.client, "regular");
});

test("ambiguous or taskless sessions leave the entry unchanged", () => {
  for (const sessionTasks of [["task1", "task2"], []]) {
    const fields = { session_id: "session1", task: "", project: "", client: "unassigned" };
    const { values } = runCreate({ fields, sessionTasks, relations });
    assert.deepEqual(values, fields);
  }
});

test("an explicit task never changes an unassigned entry's project or client", () => {
  const fields = { session_id: "session1", task: "task9", project: "", client: "unassigned" };
  const { values, warnings } = runCreate({ fields, sessionTasks: ["task1"], relations });
  assert.deepEqual(values, fields);
  assert.equal(warnings.length, 0);
});

test("failed relation lookups do not block creation or lose task inheritance", () => {
  for (const lookupFailure of ["clients:unassigned", "tasks:task1", "projects:project1"]) {
    const { values, warnings } = runCreate({
      fields: { session_id: "session1", task: "", project: "", client: "unassigned" },
      sessionTasks: ["task1"],
      relations,
      lookupFailure,
    });
    assert.equal(values.task, "task1", lookupFailure);
    assert.equal(values.project, "", lookupFailure);
    assert.equal(values.client, "unassigned", lookupFailure);
    assert.equal(warnings.length, 1, lookupFailure);
  }
});
