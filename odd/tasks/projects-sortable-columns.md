# Sort Projects by every data column

Goal: Projects table supports sorting by Name (alphabetical), Client, Status, Work time and Cost, ascending/descending, with a visible and accessible active sort. Actions is not data and is not sortable. Initial order is Name ascending. Sorting works on the already-loaded project catalog and after the client filter; metrics use raw numeric totals, never formatted strings.

Scope: Projects page, pure sort helper/unit tests, en/es/ja accessible copy, and focused isolated browser regression. No schema/sync/backend change, no recomputation from `work_records`, no mutation of shared `useProjects` order.

Choices: First activation of text columns is ascending; status/time/cost start descending (active/highest first), next activation reverses. Missing totals sort as zero because that is what the table displays. Deterministic ties fall back to locale-aware project name and ID. Locale-aware `Intl.Collator` handles case/diacritics/numeric substrings. `aria-sort` on the active table header, focusable buttons in each data header; keep existing Time hint. Do not sort Actions.

Existing limit: project catalog `getFullList` paginates all records. The totals route currently reads at most 200 groups and warns on more; records without fetched totals display zero. This is pre-existing and outside this sorting change, but should be reported if it affects verification.

Working tree: `feat/cache-hit-display` has multiple prior uncommitted authorized changes (cache hit, filters, Commands retirement, version 0.2.0) and unrelated owner files. Preserve them. No commit/push/build/deploy unless explicitly requested. Estimated ~120–220 authored lines, review alongside tests.

## Tasks
- [ ] T1 — Add tested pure comparators for project rows across all five data columns, locale and stable ties. Implemented and 14 focused tests passed; commit pending.
- [ ] T2 — Add sortable accessible headers and filtered sorted rows, with focused browser regression. Implemented; isolated browser passed; commit pending.
- [ ] T3 — Independently verify unit/type/lint, keyboard/visual behavior on isolated browser, and report limitations. Unit/type/lint passed; isolated keyboard/ordering E2E passed; commit pending.

## Progress
- Read-only map: `web/app/pages/projects/index.vue` shows Name/Client/Status/Time/Cost/Actions, filters client locally, loads project catalog in name order and totals separately; no pagination in page. Current rendered missing totals are zero; all data headers are plain text.

- T2 delegated writer wired non-mutating sorting, accessible header buttons and localized names; independent verifier found Projects totals listener could catch sidebar session totals, corrected to `group_by === 'project'`. Integrated suite 483 pass/38 skip, typecheck/lint passed.
- Existing :3002 app was stale; fresh throwaway stack :3003/:8093 seeded without touching live or existing stack. Dedicated browser spec 1/1 passed including keyboard, aria-sort, all columns and client filter. Totals route 200-group limit remains pre-existing.

Next: work-unit commit remains pending explicit authorization; no build/push/deploy.
