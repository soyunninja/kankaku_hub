/* eslint-disable */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { inheritedTaskId } = require("./task-inheritance-rule.js");

test("a new entry of a session whose assigned entries all point at ONE task inherits it", () => {
  assert.equal(inheritedTaskId({ ownTask: "", sessionId: "s1", sessionTaskIds: ["t1"] }), "t1");
  assert.equal(inheritedTaskId({ ownTask: "", sessionId: "s1", sessionTaskIds: ["t1", "t1"] }), "t1");
});

test("never guesses: a session split across two tasks inherits nothing", () => {
  assert.equal(inheritedTaskId({ ownTask: "", sessionId: "s1", sessionTaskIds: ["t1", "t2"] }), "");
});

test("an entry that already names a task keeps it", () => {
  assert.equal(inheritedTaskId({ ownTask: "t9", sessionId: "s1", sessionTaskIds: ["t1"] }), "");
});

test("no session id, or a session with no assigned entry, inherits nothing", () => {
  assert.equal(inheritedTaskId({ ownTask: "", sessionId: "", sessionTaskIds: ["t1"] }), "");
  assert.equal(inheritedTaskId({ ownTask: "", sessionId: "s1", sessionTaskIds: [] }), "");
  assert.equal(inheritedTaskId({ ownTask: "", sessionId: "s1", sessionTaskIds: ["", null, undefined] }), "");
});
