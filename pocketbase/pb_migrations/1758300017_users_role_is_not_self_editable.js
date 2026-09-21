/// <reference path="../pb_data/types.d.ts" />

// SECURITY FIX. `users.updateRule` was `id = @request.auth.id`, with nothing
// restricting WHICH fields an account may change on itself. `role` is one of
// them, so the `service` account — whose credentials ship with every kankaku
// install — could `PATCH` its own record to `role: "owner"` and take over the
// hub (write/delete clients, projects and tasks, call owner-only routes).
// Found by an independent review on 2026-09-21 and reproduced live.
//
// An account may still update itself, but never its own `role`: the request
// must not change that field. Roles are assigned by a superuser only (CLI or
// dashboard), which bypasses collection rules by design.
//
// `:changed` is evaluated against the stored value, so re-sending the same
// role (as a full-record PUT-style client would) is still accepted.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("users");
  collection.updateRule = "id = @request.auth.id && @request.body.role:changed = false";
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("users");
  collection.updateRule = "id = @request.auth.id";
  return app.save(collection);
});
