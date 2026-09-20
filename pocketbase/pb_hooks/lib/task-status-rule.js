// Pure rule for the "work arrived on a task" automation. CommonJS and
// ES5-friendly so PocketBase's goja runtime and `node --test` both load it.
//
// A task that has recorded work IS in progress: that is an observable fact,
// so `open` -> `doing` is safe to automate. Finishing is a human judgement
// (does it work? has the client seen it?), so this rule never returns `done`
// and never touches a task that is already `done`. Anything it does not
// recognise is left alone rather than guessed.
function nextStatusOnLinkedWork(currentStatus) {
  return currentStatus === "open" ? "doing" : null;
}

module.exports = { nextStatusOnLinkedWork: nextStatusOnLinkedWork };
