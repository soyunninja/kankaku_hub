const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nextStatusOnLinkedWork } = require("./task-status-rule.js");

test("an open task that receives linked work moves to doing", () => {
  assert.equal(nextStatusOnLinkedWork("open"), "doing");
});

test("a task already in progress is left alone", () => {
  assert.equal(nextStatusOnLinkedWork("doing"), null);
});

test("a done task is NEVER reopened or changed by incoming work: closing is the owner's call", () => {
  assert.equal(nextStatusOnLinkedWork("done"), null);
});

test("the rule never produces done: finishing a prompt is not finishing a task", () => {
  for (const status of ["open", "doing", "done", "", undefined, null, "archived", "DOING"]) {
    assert.notEqual(nextStatusOnLinkedWork(status), "done");
  }
});

test("unknown, empty or malformed statuses are left alone rather than guessed", () => {
  for (const status of ["", undefined, null, "archived", "OPEN", " open ", 0, {}, []]) {
    assert.equal(nextStatusOnLinkedWork(status), null);
  }
});
