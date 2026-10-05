# Show human labels in the entry sheet Combobox search fields

Goal: When opening Cliente, Proyecto or Tarea in an entry detail Sheet, the selected value shown in the Combobox search input is the corresponding human-readable option label, never a raw PocketBase ID. Preserve stored relation IDs, selection/search behavior, and client/project/task dependency rules.

Cause to verify: The shared `Select.vue` adapter maps IDs to trigger labels and `ComboboxItem` text values, but does not pass Reka UI's `ComboboxInput.displayValue` mapper. Reka defaults its input display to the selected string value (an ID). A missing option remains a separate hypothesis; do not change data values or relation scope without evidence.

Scope: `web/app/components/ui/select/Select.vue` and focused `web/e2e/entry-detail.spec.ts` assertions using an isolated disposable fixture. No schema/sync/backend changes; preserve other uncommitted work. The original isolated :3003/:8093 test stack was stopped with fixture data retained; restart only our own throwaway stack without reseeding, or create a fresh exact guarded pair.

Checks: Focused browser regression in Sheet for all three labels, `pnpm --dir web test`, `pnpm --dir web typecheck`, `pnpm --dir web lint`, `git diff --check`. No screenshot E2E, production build, commit, push or deploy without explicit request.

## Tasks
- [ ] T1 — Add failing browser assertions for selected client/project/task search-field labels in EntryDetailSheet, with fixture cleanup. Implemented; RED observed: Cliente input rendered `3uzzp57wmiqnfy6` instead of Cajamar, Tarea input rendered `th7khrcshmgi2lr` instead of task title. Proyecto assertion follows client, so not reached yet; commit pending.
- [ ] T2 — Map selected value to option label through ComboboxInput displayValue while preserving stored IDs and explicit empty-option behavior. Implemented; focused Sheet browser GREEN 2/2, commit pending.
- [ ] T3 — Independently rerun browser and integrated checks, report residual warnings and pending commit. Shared Combobox browser 4/4, unit 483 pass/38 skip, typecheck/lint/diff passed; commit pending.

Progress: source review found `ComboboxInputProps.displayValue` in installed reka-ui; the root modelValue is the stored ID. Existing detail E2E fixtures expose clientName/projectName and create a task in a separate test. TDD mode not explicitly configured; use an observed failing focused regression without claiming strict TDD.

RED: Reused our retained throwaway :3003/:8093 stack without reseeding; focused two-case E2E failed exactly on raw ID displayed by ComboboxInput. Both fixture `finally` blocks ran without cleanup errors, although PB record absence was not independently checked. No app source fix yet.

GREEN: Shared adapter now passes `ComboboxInput :display-value` mapping known stored IDs and the private empty key to option labels, unknown values to empty. Focused Sheet browser 2/2 passed: Cliente, Proyecto and Tarea input labels, persisted client and task links unchanged. Separate shared Combobox browser 4/4 passed. Independent unit 483 passed/38 skipped, Nuxt typecheck passed, lint 0 errors/23 warnings, diff check passed. Both Sheet fixture `finally` paths ran without errors, but deletion HTTP statuses are not asserted. New output artifacts in dedicated throwaway PW_OUTPUT_DIR. No schema/sync change.

Next: work-unit commit remains pending explicit authorization. No build/push/deploy. Existing branch `feat/cache-hit-display` is dirty with prior authorized changes; preserve all unrelated files.
