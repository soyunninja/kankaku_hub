# Publish all remaining local project changes

## Authorization
Owner explicitly requests incorporating all changes into Git, on main, and pushing. This supersedes the earlier Organization-only source scope. Include coherent remaining project code, tests, technical documentation, and safe project configuration/assets. Broad scope does not authorize publishing credentials, private agent/session data, runtime checkpoints, caches, or generated test output. Preserve all excluded local files; no deletion or cleanup.

Main/origin/main was verified at `d030f860ffdc0197283bad534064c267b068ddb7`. At initial authorization, the primary worktree remained on release `8857e811405c5b146b7e42eaad815a30fda0adb6` with local changes. Compare files against main to avoid treating already-published release bookkeeping as new work. At that initial authorization, root/public version remained 0.4.0. The later explicit 0.4.1 instruction below superseded that version baseline.

## Tasks
- [x] T1 (done): Audit every remaining candidate against main; identify exact publishable surfaces and privacy/runtime exclusions.
- [x] T2 (done): Transfer audited changes into a fresh sequential same-clone feature worktree, preserving primary files and avoiding unrelated source edits.
- [x] T3 (done): Independently verify the exact delivery candidate, including applicable UI/proxy tests and normal hooks; commit observed work units.
- [x] T4 (done): Safely advance/push main, publish final task closure, and synchronize the primary branch only when audited files match main without discarding local data.

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

## Final functional closure — 0.4.1 published to Git main

Functional work unit **`2e0a6edae5cc794bba1a4cff9eff3fea5bc48aff`** (`feat: release dashboard and catalog updates in 0.4.1`) contains all 89 authorized paths, +4228/-43, tree `12872b76315d7cd693fc2a9ccceaf47a8f927983`. Parent's guarded normal fast-forward push succeeded; fresh local main, origin/main, and GitHub main matched this commit. Root/public version is **0.4.1**. This is Git publication, not production deployment.

Independent final verifier `muvk3cki-2j-siub` observed preparation/typecheck exit 0; focused 332 tests across 21 files; full 859 passed / 38 live-configured skipped across 64 files (one skipped file); manifest 12 including three loopback fixtures; hooks 155; seed 19. Browser evidence totals **32 distinct checks**: Organization 12, Dashboard 12, alternative HTTPS Card 6, health 1, original card structure 1. Organization checks covered light/dark, 320/390/1280 widths, embedded/standalone writer/viewer UI, immediate control-group sibling placement, desktop rightward/mobile wrapping geometry, enabled unique writer actions and existing dialogs closed by Escape, unchanged filters/views/search and standalone headings. Viewer coverage is intercepted UI behavior, not backend ACL verification.

The first external Organization driver recorded 6 pass / 6 fail due to an incorrect nearest-DIV/H1 assumption. Its traces remain; a separate header-ancestor driver retained behavior assertions and passed all 12. Repository tests were not weakened. The original six isolated Card cases remain **unrun** (3003/8093 unavailable); guards were not remapped. No live PocketBase fixture writes occurred; 38 live cases lacked the configured URL. Earlier 40/40 and meaningful 37/3 old-page sensitivity are post-implementation evidence, not historical TDD.

All 89 candidate/stage/primary/export hashes and modes matched. The exact indexed proof covered **683** paths/blobs/executable modes, not the anticipated 687; canonical entry-stream SHA256 was `d2f298fe4361d0a9fc2c66d7238bcd5d94810f64a56180d4a18a7fcd4e71a3d1`. Primary 254 functional paths, 40,110 cache files, 43,134 historical artifact records and six private DOM HTML files were preserved. Independent dependencies comprised 39,659 files and 2,652 contained relative links with no shared inodes. Business mutation requests were not invoked; 42 receipts recorded zero mutations (authentication/refresh/reads only).

Final evidence remains at `/var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/kankaku-independent-041-8hszeo_7/`, including the original **final-proof exit 1** for worklog protection. It was not rerun or rebaselined. Separate read-only incident diagnosis `muvknpw2-2k-jpk4` cleared that delivery blocker with high-confidence evidence of valid same-version Kankaku/Pi parent-child `agent_settled` telemetry: a +1247-byte single JSON append, unchanged prior prefixes/inode/mode, verifier session identity and parent-PID correlation, followed by inflight settlement. Redacted supplement: `/var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/kankaku-worklog-incident-diagnosis-cb5ajlih/redacted-proof.json`. This is not loaded-module/syscall certainty or exact-actor attribution. Old inflight75019 disappearance remains consistent with lifecycle settlement but unattributed. No repair, truncation, deletion or private-content export occurred; excluded runtime data is dynamic, not universally byte-immutable.

Normal GGA 2.10.1 Codex hook passed for three static TypeScript files; it did not cover Vue/tests and is not a test substitute. RDD was off; native ASSESS was unassessable for untracked/runtime scope, and independent high fallback verification was met. No native approval/receipt is claimed. No build/generate/pack, npm publication, tag, deployment, real Save, backend viewer ACL, physical-phone/accessibility audit or reboot was established. Production Hub/Engram/OpenShip integration remains separately blocked with services unchanged.

**Observed delivery complete:** functional main publication at `2e0a6edae5cc794bba1a4cff9eff3fea5bc48aff` was followed by normal documentation checkpoint commit/push `344d645fa39d8b6ff92d6aeb87bde57a6f900911`; fresh GitHub main matched that checkpoint. Parent verified all 683 desired tracked blobs/executable modes, staged exactly 90 source-compatible paths with the incoming tree safeguard, and successfully switched primary normally to main at `344d645fa39d8b6ff92d6aeb87bde57a6f900911`, with clean index and tracked working tree. Proof: `/var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/kankaku-hub-all-changes-audit.wavbtfyt/publication-041-primary-sync.json`. Excluded private runtime files remain preserved and dynamic. All T4 outcomes were observed at this checkpoint; publication of this subsequent passive status update is not claimed here.
