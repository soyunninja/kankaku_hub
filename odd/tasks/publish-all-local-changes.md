# Publish all remaining local project changes

## Authorization
Owner explicitly requests incorporating all changes into Git, on main, and pushing. This supersedes the earlier Organization-only source scope. Include coherent remaining project code, tests, technical documentation, and safe project configuration/assets. Broad scope does not authorize publishing credentials, private agent/session data, runtime checkpoints, caches, or generated test output. Preserve all excluded local files; no deletion or cleanup.

Main/origin/main was verified at `d030f860ffdc0197283bad534064c267b068ddb7`. Primary worktree remains on release `8857e811405c5b146b7e42eaad815a30fda0adb6` with local changes. Compare files against main to avoid treating already-published release bookkeeping as new work. Root/public version remains 0.4.0; do not bump again without a reason.

## Tasks
- [x] T1 (done): Audit every remaining candidate against main; identify exact publishable surfaces and privacy/runtime exclusions.
- [x] T2 (done): Transfer audited changes into a fresh sequential same-clone feature worktree, preserving primary files and avoiding unrelated source edits.
- [ ] T3 (in_progress): Independently verify the exact delivery candidate, including applicable UI/proxy tests and normal hooks; commit observed work units.
- [ ] T4 (pending): Safely advance/push main, publish final task closure, and synchronize the primary branch only when audited files match main without discarding local data.

## Safeguards
Read-only audit before a bounded writer. Parent derives allowed repository-relative surfaces from evidence; no blind stage-all. One source writer at a time. Fresh worktree isolation is sequential. Preserve existing source refs, old worktree registrations, original caches/dependencies, private preview/Tailscale processes, backend records, and verification artifacts. No force-push, reset, stash, branch deletion/pruning, credentials exposure, dependency installation, preview restart, tag, npm publication, or deployment.

Existing source changes already implement the requested UI/proxy behavior; use observed existing tests and proportionate checks without inventing historical RED. Add test-first fixes only for newly observed deterministic defects. Functional verification remains independent; native review follows the user-owned switch, currently off, and ordinary commit hooks are never bypassed.

The final bookkeeping closure should be published after the observed functional delivery so no self-created uncommitted task ledger is mistaken for remaining project work. Record functional work-unit identities before its final documentation commit; persist the final Git-delivery identity in memory without an endless self-referential ledger rewrite.

## T1 audited publication scope

Verifier `muvcpdyz-2a-pmrk` inventoried 83 publishable paths against main: 73 additions and 10 updates, approximately 3 MB including 24 synthetic/archived PNGs. The bulk of review volume is historical ODD/review documentation. Both residual UI and same-origin/private-preview dependency closures are included, along with safe project `.gga` configuration and durable mock design evidence. No additional source area or version bump is needed.

Bounded screening of source/config/documentation found no private-key, credential-URL, provider/GitHub token, AWS-key, or JWT patterns. One fixture credential was classified as documented synthetic data. This is pattern screening, not a universal secret guarantee or forensic image certification.

Excluded and preserved locally: `.kankaku/**` (private worklogs/IDs/checkpoints), `.pi/**` (personal harness/log/PID data), `web/.vitest/**` (generated reports), and the six generated preview DOM HTML files: desktop `A.html`/`B.html`; mobile `A-dark.html`/`A-light.html`/`B-dark.html`/`B-light.html`. No deletion or pruning is authorized.

The literal transfer manifest is retained at `/var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/kankaku-hub-all-changes-audit.wavbtfyt/publication-manifest.json`. Only its 83 exact paths are allowed; PNG inventory is fixed at 8 desktop + 14 mobile + 2 charcoal captures. Unexpected additions are rejected. `odd/tasks/prepare-hub-0.4.0.md` already equals main and needs no new source delta; the integration ledger is an update despite primary Git reporting it untracked.

Parent fetched origin main and confirmed remote/local `d030f860ffdc0197283bad534064c267b068ddb7`. Fresh sequential worktree `/var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/kankaku-hub-publish-all.6fmu8xqq/worktree` uses feature branch `feat/publish-all-local-changes`, rooted at main. A bounded worker transfers exact audited bytes only; no functional edits, source refactor, test weakening, or new version. Source fixes require a separately bounded observed-defect task.

## Literal audited allowlist
```text
.gga
.impeccable/critique/2026-10-02T12-32-09Z__web-app-pages-entries-index-vue.md
.impeccable/previews/dark-neutral-charcoal/implemented-dashboard-dark.png
.impeccable/previews/dark-neutral-charcoal/implemented-entries-dark.png
.impeccable/previews/entries-desktop/A-dark.png
.impeccable/previews/entries-desktop/A-light.png
.impeccable/previews/entries-desktop/B-dark.png
.impeccable/previews/entries-desktop/B-expanded-dark.png
.impeccable/previews/entries-desktop/B-expanded-light.png
.impeccable/previews/entries-desktop/B-light.png
.impeccable/previews/entries-desktop/README.md
.impeccable/previews/entries-desktop/implemented-dark.png
.impeccable/previews/entries-desktop/implemented-light.png
.impeccable/previews/entries-desktop/inspect.cjs
.impeccable/previews/entries-desktop/measurements.json
.impeccable/previews/entries-desktop/render.cjs
.impeccable/previews/entries-mobile/A-dark.png
.impeccable/previews/entries-mobile/A-expanded-light.png
.impeccable/previews/entries-mobile/A-filters-light.png
.impeccable/previews/entries-mobile/A-flat-light.png
.impeccable/previews/entries-mobile/A-light.png
.impeccable/previews/entries-mobile/B-dark.png
.impeccable/previews/entries-mobile/B-expanded-light.png
.impeccable/previews/entries-mobile/B-filters-light.png
.impeccable/previews/entries-mobile/B-flat-light.png
.impeccable/previews/entries-mobile/B-light.png
.impeccable/previews/entries-mobile/README.md
.impeccable/previews/entries-mobile/baseline-mobile.png
.impeccable/previews/entries-mobile/implemented-dark.png
.impeccable/previews/entries-mobile/implemented-light-en.png
.impeccable/previews/entries-mobile/implemented-light.png
.impeccable/previews/entries-mobile/import-evidence.json
.impeccable/previews/entries-mobile/measurements.json
.impeccable/previews/entries-mobile/renderer.cjs
DESIGN.md
odd/entries-session-bulk-task-assignment/tasks
odd/tasks/cache-hit-display.md
odd/tasks/card-contained-form-backgrounds.md
odd/tasks/client-available-cost-shares.md
odd/tasks/clients-grid-design.md
odd/tasks/contract-publication-doc-corrections.md
odd/tasks/dark-theme-gentleman-cute.md
odd/tasks/demo-dataset-screenshots.md
odd/tasks/engram-narrative.md
odd/tasks/entries-compact-dates.md
odd/tasks/entries-grouped-by-session.md
odd/tasks/entries-project-filter.md
odd/tasks/entries-session-auto-expand.md
odd/tasks/entries-session-bulk-task-assignment.md
odd/tasks/entry-sheet-combobox-labels.md
odd/tasks/filter-select-identity.md
odd/tasks/hub-combobox-migration.md
odd/tasks/merge-hub-0.4.0-to-main.md
odd/tasks/open-design-web-style-guide.md
odd/tasks/organization-tabs-prototype.md
odd/tasks/organization-unified-overview.md
odd/tasks/prepare-hub-0.3.0.md
odd/tasks/private-tailnet-preview.md
odd/tasks/projects-grid-design.md
odd/tasks/projects-sortable-columns.md
odd/tasks/publish-all-local-changes.md
odd/tasks/publish-pending-project-changes.md
odd/tasks/rebase-cache-hit-on-main.md
odd/tasks/retire-commands-page.md
odd/tasks/select-label-style.md
odd/tasks/task-inheritance-assignment.md
odd/tasks/tasks-client-project-filter.md
odd/tasks/unassigned-load-recovery.md
odd/tasks/viewer-role.md
scripts/tailnet-loopback-proxy.mjs
scripts/tailnet-loopback-proxy.test.mjs
web/app/assets/css/tailwind.css
web/app/lib/pocketbase-url.ts
web/app/pages/index.vue
web/app/pages/settings/index.vue
web/app/plugins/pocketbase.client.ts
web/e2e/card-contained-fields.spec.ts
web/e2e/dashboard-chart-preferences.spec.ts
web/e2e/dashboard-chart-recovery.spec.ts
web/e2e/dashboard-project-series.spec.ts
web/e2e/tailnet-preview.spec.ts
web/nuxt.config.ts
web/tests/pocketbase-url.test.ts
```

## T2 observed exact transfer and verification gate

Worker `muvd5hv5-2b-vg7m` transferred exactly 83 audited regular non-symlink files: 10 tracked updates and 73 additions, no extras. Every source matched recorded SHA256 before copying; all destination/source/manifest hashes and source/destination permission modes matched afterward. Assigned branch/base and the empty index were unchanged. No functional edits, refactoring, version bump, tests, hooks, staging, or commits were performed.

Transfer-only work has no meaningful new behavioral RED; historical checks are not claimed as current verification. Native ASSESS on the assigned worktree was **unassessable** because untracked scope needed declaration; RDD was off, outcome unknown, conservative small fallback profile. The returned plan requires writer self-verification and a separate independent verifier. The worker's structural evidence is self-verification; fresh independent functional checks follow. No native approval is claimed.

Parent synchronizes this task transition only, then stages the exact 83 paths. Functional content remains the worker's audited copy. The candidate requires typecheck preparation before full Vitest, applicable root fixtures including the new ephemeral loopback proxy test, and read-only browser checks without business-record writes or private-preview changes. The authored card-fields suite requires isolated ports 3003/8093; do not weaken its guard or remap those ports to the live backend.

### Passive whitespace normalization
The initial cached whitespace check found one trailing space in the archived critique's YAML `na_heuristics:` line (line 5). Parent removed only that space in the primary and candidate copies and restaged that document. This is a passive metadata normalization, not a behavior change or functional RED. The historical critique content and all functional source remain unchanged. Manifest hashes for this document and parent task bookkeeping are refreshed; independent functional verification still follows.

## Expanded 0.4.1 instruction and verified intermediate baseline

Owner now requests embedded Organization creation actions and version 0.4.1 before commit/push, retaining all previously authorized project changes. Clarification selected New project for Projects and New client for Clients. Track the UI unit in `odd/tasks/organization-catalog-create-actions.md`. Do not publish the intermediate 0.4.0 candidate first; extend the literal candidate scope only with bounded UI tests/pages, root version, and parent bookkeeping.

Verifier `muvdpb3i-2d-05gx` completed the frozen old 83-path baseline: typecheck0,324focused,851full/38skip,12manifest(including3loopbacktests),155hooks,19seed;12Dashboard,1cardstructural,6alternativeHTTPSlight/dark/mobile/desktop,1health check. Retained artifacts `/var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/kankaku-independent-83-resumed-76feea2b`. Authored isolated card suite stayed unexecuted(3003/8093 unavailable); owner-authenticated alternative checks did not verify backend ACLs. Original 681 exported blobs, source/cache records, refs, and logical/binary index identities remained unchanged. No original services or backend records changed.

Hash discrepancy was independently resolved as different inputs: SHA256 of canonical staged entry stream afb16881... versus binary index8d569db6..., not source drift. External helper path/ESM harness errors were corrected outside the repo and retained, not application RED. Parent pauses final verification/publication until bounded new UI and version changes are complete; new final candidate receives fresh checks.

## Ready to assemble final 0.4.1 source

Organization action regression verification now passed 40/40 and typecheck at root/public0.4.1. Pre-change mounted placement/permission sensitivity was 37pass/3fail, explicitly post-implementation. Source and caches held identity. The excluded PID checkpoint75019 status transition was separately classified as documented dynamic crash-recovery state, exact cause unknown, without source-integrity evidence or any runtime repair. Retain that limitation; do not make private runtime inventory an immutable publication identity.

Final combined allowlist is the original83 exact paths plus six bounded additions: Clients/Projects pages, `package.json`, the new mounted actions test, updated Projects test, and the new UI feature ledger. ExistingNuxt/publedger hashes change only as explicitly authorized; total **89 paths**. Parent compiles a refreshed literal/hash manifest before the single copy-only transfer. Final verification binds the canonical `git ls-files --stage -z` entry stream, not raw binary-index bytes.
