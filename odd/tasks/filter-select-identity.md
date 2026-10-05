# Filter select identity

## Objective
Make filter controls self-explanatory across Tasks and Entries: visible labels for the two Tasks header selectors, and client favicons before names in client selector options and selected triggers on both pages.

## Scope and constraints
- `web/app/pages/tasks/index.vue` and `web/app/pages/entries/index.vue` only for behavior; add one focused test under `web/tests/` if useful. Do not change shared Select or ClientAvatar APIs, schema, locale files, backend calls, or unrelated Projects/Clients work.
- Tasks header has client/project Selects lacking visible labels; associate unique label `for` and Select `id` while keeping existing aria-label, All option, project-reset handler and view tabs. Dialog form labels already exist and are outside this request.
- Both client filters use Select's optional visual `#option` and `#selected` slots, decorative `ClientAvatar size="xs"` before name for real client options; All remains plain text. Preserve text labels for search/accessibility and no avatar for missing client lookup. Reuse existing localized common.client/project keys.
- Existing Entries page has uncommitted label/padding changes; preserve all of them. Do not touch owner data or run E2E on :8090/:3000.

## Execution and checks
- TDD: no explicit strict-TDD setting found; ordinary focused checks. Exact runners: `pnpm --dir web exec eslint app/pages/tasks/index.vue app/pages/entries/index.vue tests/filter-client-avatar-contract.test.ts`, `pnpm --dir web exec vitest run tests/filter-client-avatar-contract.test.ts`, `pnpm --dir web test`, `pnpm --dir web typecheck`, `git diff --check`.
- Forecast below ~150 authored lines; ask-on-risk strategy; no commit/deployment without explicit owner request.

## Tasks
- [x] F1 — Add visible Tasks filter labels and favicon/name option/selection content to both client filters. Route: delegated multi-file writer. Acceptance: All plain, search and keyboard semantics unchanged, no data/filter logic change.
- [x] F2 — Add focused checks and run lint/tests/typecheck plus independent risk-gated verification. Route: same writer self-check then verifier per native assessment.
- [ ] F3 — Inspect authenticated local Tasks and Entries filters and report visual/keyboard limitations. Route: parent/owner visual signoff.

## Progress
- Read-only scout mapped two Tasks top filters, already-visible Entries labels and Projects' existing Select slot pattern. F1 implemented by bounded writer: Tasks labels/IDs and client avatars in Tasks/Entries selected and option slots; no locale/shared-component changes.
- F2 complete: writer observed ESLint, focused Vitest (6 passed), full suite 519 passed/38 skipped, typecheck and diff check passing. Parent spot-checked typecheck/diff check. Native assess unassessable due unrelated untracked files; independent verifier found no scoped functional defect and repeated ESLint/diff check, but did not rerun focused Vitest due generated-cache authorization uncertainty. Tests are source contracts, not mounted interactions.
- Projects and Clients visual signoffs remain separate.

## Next step
Owner inspects authenticated Tasks and Entries filters for visual/keyboard signoff. Projects card-layout correction proceeds separately.
