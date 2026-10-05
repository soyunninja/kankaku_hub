# Clients grid design

## Objective
Adapt the Clients index to the supplied dark Projects screenshot: prominent heading and count, search, grid/list toggle, and a responsive two-column grid of compact rounded client cards. The user explicitly excluded the screenshot's sidebar. Preserve the current table as list view and all detail/edit/archive flows.

## Problem and rationale
The current Clients page is a dense table. The reference's searchable, scannable grid offers a clearer overview; client-specific content must replace project/deployment metadata rather than invent new database fields.

## Scope and constraints
- Edit only `web/app/pages/clients/index.vue`, locale strings in `web/i18n/locales/{en,es,ja}.json`, and focused tests under `web/tests/` if needed. Do not modify schema, data fetching, or shared UI components without escalation.
- Show client avatar/name, website or code, active state, and existing last-month-through-today time/cost totals in the grid. Retain all information in list view.
- Search by client name, code, and website; filter locally over already-loaded clients, without network queries. Keep archived and protected unassigned clients visible unless excluded by search.
- Default to grid; provide an accessible button toggle to list. Card detail opening must be keyboard-operable without nested interactive controls; preserve writer-only edit/archive actions and protected-client guard. No sidebar.
- Updated user requirement: three columns on desktop, two on mobile. Make the card internals fit narrow two-column cells without hiding actions or clipping metrics; skeleton layout follows the same breakpoints. Owner requested another small reduction of the grid-card favicon (40px → 32px → 28px), without changing avatars elsewhere. Respect i18n and existing loading/empty states.
- Existing unrelated `web/app/pages/entries/index.vue` edits are outside scope; do not touch them.

## Execution and checks
- TDD: no explicit project/session strict-TDD setting found; ordinary focused functional checks (not a claim of strict RED/GREEN). Runner: `pnpm --dir web test`, `pnpm --dir web exec eslint app/pages/clients/index.vue`, `pnpm --dir web typecheck`, and `pnpm --dir web generate` where appropriate.
- Delivery: ask-on-risk; forecast roughly 200–350 authored changed lines, one cohesive work unit, no chaining expected. Commit/delivery not authorized by the UI request; leave uncommitted for owner review.

## Tasks
- [x] C1 — Implement the Clients search, accessible grid/list toggle, responsive grid cards and i18n. Route: delegated direct writer (4+ file mapping and multi-file write). Acceptance: no sidebar, controls work, current table and actions remain accessible, no changed backend calls.
- [x] C2 — Add or adapt focused tests for search, view behavior, permissions/empty states as practical; run lint, i18n/test suite, typecheck/build; inspect diff and limitations. Route: same bounded writer for implementation checks, independent verifier per native risk assessment.
- [~] C3 — Apply three-desktop/two-mobile columns and compact card internals, reduce only the client grid-card favicon to 28px, then inspect local browser layout and interaction; report precise verification. Route: delegated bounded writer for page + test, parent visual check.

## Progress
- User confirmed no sidebar. Read-only mapper identified the page, reusable avatar/name and action components, locales, i18n parity tests, and constraints.
- C1 implemented by bounded writer in the Clients page and three locale files: grid default, local search, accessible grid/list switch, client cards, preserved list/actions and no sidebar.
- C2 complete: `web/tests/clients-page.test.ts` covers local search and markup/count contracts. Independent verifier found no high-severity defects; P3 singular wording corrected across all locales and tested for 0/1/2. P2 remains a documented limitation: source-string tests do not prove mounted interaction. Writer reran ESLint, web test suite (495 passed, 38 skipped), typecheck and diff check successfully. Parent spot-checked targeted Vitest (12 passed) and diff check. Native assessment was unassessable because unrelated untracked files require declaration, so independent verification was used.
- C3 responsive and second avatar-size correction applied; `size-7` (28px) now replaces page-local `size-8` (32px), visual signoff pending. Shared avatar defaults unchanged. Independent verifier confirmed the 28px tailwind-merge override, ESLint, focused Vitest (14 passed) and diff check; browser computed style remains unverified. Skeleton and cards use two mobile / three desktop columns, with compact wrapping internals that retain actions. Focused Vitest (14 passed), ESLint, typecheck and diff check passed, including a parent spot check. Automated authenticated visual inspection remains blocked: screenshot reaches login and documented dev credentials did not authenticate this local database. Playwright MCP navigation also failed. No data or auth state was changed.
- Existing Entries diff and local dev stack were not changed by the writer.

## Next step
Owner visually checks `http://localhost:3000/clients` on desktop/mobile. C3 remains unchecked until observed. Projects redesign is tracked separately; no commit/deployment.
