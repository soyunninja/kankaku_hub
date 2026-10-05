# Correct sync reassignment, access rules and npm publication docs

Goal: Make four existing docs accurately distinguish create-only sync updates from kankaku 1.2.0's explicit Tasks CLI reassignment, describe the actual owner/service write rules and relation/audit limits, and record npm publication of `kankaku-hub@0.2.0` on 2026-09-28. Preserve the original ADR decision.

Scope: `docs/adr/0011-create-only-assignment-fields.md`, `docs/contract.md`, `docs/specs/hub-schema-and-access-rules.md`, `docs/runbooks/publish-hub-package.md` only, plus this tracking note. Do not change application code, migrations or unrelated dirty work. The user later authorized a scoped commit and push; no build, package or deployment.

## Tasks
- [x] T1 — Add a historical update note to ADR 0011; clarify explicit CLI PATCH, sync omission, relation coherence and absent reassignment audit in the contract. Source decision preserved; committed in `af24eca`.
- [x] T2 — Align SCHEMA-REQ-005 and its evidence with migration 1758300021 owner/service write permissions and viewer read-only status. Migration unchanged; committed in `af24eca`.
- [x] T3 — Update npm runbook publication status for version 0.2.0 and retain future-release procedure. npm registry reported 0.2.0 published at 2026-09-28T13:15:22.677Z; committed in `af24eca`.
- [x] T4 — Independently read back all facts and run focused documentation/diff checks; present the requested diff. Four-doc diff 30 additions/7 deletions; `git diff --check` and committed diff check passed. Independent readback confirmed original ADR Decision unchanged, migration owner/service rules, relation/audit absence and npm registry publication; no runtime test/build.

The user later authorized commit and push: `af24eca62d7ffdc6f28d02e62eeff7d762537a61` (`docs(hub): align assignment, access, and publication records`) contains only the four documentation files. `origin/feat/cache-hit-display` matches that commit (0 ahead/0 behind). The already-staged Claude SVG and other dirty changes remain local; this tracking note remains untracked. Rollback boundary: this four-document commit.
