# Card-contained form backgrounds and Dashboard header refinement

## Authorization and scope

The user requests `var(--background)` for form fields inside cards. A focused scope choice explicitly limits this to inputs, native selects, field-like combobox triggers and textarea; checkbox/switch states, action buttons and teleported popup surfaces are excluded. Outside-card fields retain `var(--muted)`.

The user subsequently explicitly included Appearance and Language option buttons in Settings, choosing canvas backgrounds only for unselected options. Their selected options retain primary pink. Use a narrow opt-in marker for these field-like option buttons and expose selection through aria-pressed; this is not a global action-button background change.

The user additionally requests right-aligned Dashboard chart selectors and removal of the visible Time series, By client and By project card titles. Preserve selector labels, accessible section context, table headers, metrics, chart grouping and query behavior.

The user also requests matching padding for individual task-board cards: change their inner content from 12px to 24px on all sides, retain outer py-0 to avoid double vertical padding, and leave list/history wrappers, drag/status behavior and task details unchanged. Read-only mapping confirmed the board CardContent p-3 in web/app/pages/tasks/index.vue; shared cards otherwise provide 24px gutters.

Base: main commit 237fee20db9ad989263118d906987fe965aee9c3, version 0.3.9. Branch: feat/card-contained-form-backgrounds. This request does not authorize commit, push, merge, version bump or publication. Preserve unrelated local/untracked work and the separate external style-guide project.

## Tasks

- [x] Map shared control/card boundaries and resolve field/widget scope.
- [x] Implement contextual field backgrounds, Dashboard header refinements and focused regression coverage/documentation.
- [x] Implement and verify the explicit unselected Settings option exception.
- [ ] Align individual task-board card content padding to 24px with focused read-only geometry coverage.
- [ ] Independently verify both themes and responsive layouts without business writes.

## Acceptance

- Ordinary card-contained input/native select/combobox trigger/textarea backgrounds resolve to canvas: light #F9F9F9, dark #141414. Outside-card muted fills remain light #F2F2F2/dark #1C1C1C.
- Background-only contextual rule; preserve 44px/radius16 geometry, compact exceptions, focus/invalid indicators, disabled states and meaningful widget boundaries.
- Keep primary/destructive buttons, checkbox/switch selection fills, and elevated portalled popups unchanged. The explicit Settings exception is limited to unselected Appearance/Language option buttons; selected options remain primary pink with readable foreground and aria-pressed.
- Chart controls align to the content's right edge; wrap without clipping at 320/390px. Remove only the three requested visible headings, not other Dashboard titles or table column headers. Accessible labels/context remain available.
- D6 totals and existing chart query/ranking/retry/persistence/export behavior unchanged. Never sum raw work_records or introduce invoice/rate data.
- Fresh unit/type/lint/build checks and guarded Chromium cases at 320/390/1280 in light/dark. Only owned isolated seeded 3003/8093 stack; never owner 3000/8090 or unrelated 3002/8092. No business CRUD/status/profile/assignment/drag; auth/refresh and read-only totals/subscriptions permitted. Never focus inactive task-status tabs.
- Stop owned stacks/browsers and report actual receipts; no blanket WCAG/non-Chromium certification.

## Implementation intent

Implement a shared, unlayered background-only card field exception, right-align wrapping chart controls, and remove the three requested visible headers while preserving translated accessible regions. Keep all palette values, control geometry, state indicators and chart logic unchanged. Add read-only responsive/theme regression coverage and replace only obsolete chart-title locators.

The parent authorized generated-only verification outputs in `web/.nuxt/**`, `web/.output/**`, `web/.vitest/**`, `web/node_modules/.cache/**`, `web/node_modules/.vite/**`, and `web/node_modules/.vite-temp/**`. These are not additional authored source surfaces. Browser receipts and isolated-stack output stay in owned `/tmp`.

## Settings follow-up intent

The new authorized exception will opt in only actual Appearance/Language option buttons with `data-card-option` and select canvas only for `aria-pressed="false"`. Selected options retain their default primary paint and readable foreground; selection derives from `colorMode.preference` (including System), not resolved theme, and actual locale. Existing handlers remain unchanged. Add stable card markers and extend the existing six responsive/theme cases with real resting/settled-hover paint, geometry, focus, preference changes, locale changes and active-primary counterexamples. Locale audit: Settings calls `useI18n().setLocale`, `web/app/app.vue` persists locale only in localStorage, and Nuxt uses no-prefix/local locale files; no business/profile update handler is involved. Strict TDD remains disabled. Preserve all prior completed implementation and evidence; the optional table timeout remains parent-owned and will not be retried by this writer.

Settings follow-up implementation checkpoint: the marker/aria-pressed bindings and shared inactive-only background selector are in place; existing handlers and variants are unchanged. DESIGN describes only this explicit exception. Existing six browser cases were extended (no new case-count inflation). Fresh unit/type/lint/whitespace/build checks passed: 594 tests passed/38 skipped, no type errors, 0 lint errors/23 warnings, four generated routes. Browser verification follows on a fresh owned stack.

## Observed implementation checks

Shared contextual rule and three header refinements are implemented; chart ranking/recovery/preferences tests now use the stable chart marker without removing assertions. New focused coverage exercises real login Inputs, Dashboard comboboxes, outside-card controls and independent portals; card-contained NativeSelect/Textarea state contracts have honest static coverage.

Fresh checks: `pnpm --dir web test` passed (49 files, 594 tests; 1 file/38 tests skipped); `pnpm --dir web typecheck` passed; `pnpm --dir web lint` passed (0 errors, 23 warnings in unchanged files); `git diff --check` passed; `npm run web:build` passed (4 prerendered routes, existing unused-import/SPA notices). Browser verification is next; implementation task remains open until those checks finish. Independent verification remains parent-owned.

## Browser checkpoint and incident

The required focused commands passed: card-contained fields 7/7 (six theme/viewport cases plus static contract), chart series/recovery/preferences 12/12, control consistency 18/18, surface style 5/5: 42 cases total. No failed assertion or business write attempt was reported. Existing control/surface coverage was retained unchanged because its muted counterexamples live outside cards.

Optional audited `table-surface-consistency` run reached its fifth of seven cases and hit the external 240-second command budget; the first four progressed without a reported failure. No timeout increase or blind retry. Owned stack `/tmp/kankaku-card-contained-20260720-0912` was stopped; process inspection found no owned Playwright/Chromium processes and no 3003/8093 listeners afterward. Unrelated MCP browser services were untouched. This optional check remains incomplete and will be handed to the parent as an incident.

Screenshot inspection confirmed requested header removal and right-aligned wrapping selectors. The first capture caught a closing portal transition, so focused coverage now waits for popup closure before the Dashboard capture and explicitly persists its observed color/mutation receipt. A fresh focused run will verify that evidence-only test refinement; the optional timed-out suite will not be retried.

## Final implementation handoff

The final focused run passed 7/7 after the receipt/screenshot refinement. Fresh unit/type/lint checks passed again (594 passed/38 skipped; no type errors; 0 lint errors/23 warnings). Required distinct browser coverage remains 42 passing cases. Independent verification is still pending; overall worker handoff is partial solely because the optional table suite exceeded the external command budget.

Observed rendered counterexamples across all six configurations: login Inputs and both chart selectors resolve to opaque canvas (light RGB 249/249/249, dark 20/20/20); Dashboard Export and Entries client filter stay opaque muted (light 242/242/242, dark 28/28/28). Popup background resolves independently to popover (light white, dark 41/41/41); popup opacity can be transitional during opening, so this is background-token evidence, not a composed contrast certification. Focus-visible rings, checkbox/switch checked states, local unsaved textarea boundaries and compact calendar controls passed existing suites. Invalid priority and disabled composite opacity remain source-backed/static contracts, not newly exercised card state claims. Card-contained NativeSelect/Textarea are not mounted in the guarded flows: no synthetic DOM controls were introduced. All 73 color primitives, DESIGN frontmatter, font stacks and existing geometry declarations are unchanged in the diff. No query, data, translation, chart algorithm or export implementation changed.

Durable final evidence: `/tmp/kankaku-card-contained-20260720-final/pw-card/` contains six `card-field-receipt.json` files and twelve login/Dashboard screenshots. Each receipt records `denied: []` and `businessMutations: 0`. Original control/surface/table progress screenshots and control color receipts remain under `/tmp/kankaku-card-contained-20260720-0912/pw-{control,surface,table}/`. Auth/read-only totals/subscriptions were allowed; seeded business records were created only by explicitly authorized stack provisioning, not browser interactions. Both owned stacks were stopped without purge. Final `lsof`/process inspection found no owned 3003/8093 listeners, stack processes, Playwright tests or Chromium processes. Unrelated MCP services and LocalCodex were not stopped.

### Exact browser commands and results

- `PW_BASE_URL=http://127.0.0.1:3003 NUXT_PUBLIC_PB_URL=http://127.0.0.1:8093 PW_OUTPUT_DIR=/tmp/kankaku-card-contained-20260720-0912/pw-card pnpm --dir web exec playwright test e2e/card-contained-fields.spec.ts --reporter=line --max-failures=1`: 7 passed, 35.3s.
- `PW_BASE_URL=http://127.0.0.1:3003 NUXT_PUBLIC_PB_URL=http://127.0.0.1:8093 PW_OUTPUT_DIR=/tmp/kankaku-card-contained-20260720-0912/pw-chart pnpm --dir web exec playwright test e2e/dashboard-project-series.spec.ts e2e/dashboard-chart-recovery.spec.ts e2e/dashboard-chart-preferences.spec.ts --reporter=line --grep-invert 'bulk assignment end-to-end' --max-failures=1`: 12 passed, 28.1s.
- `PW_BASE_URL=http://127.0.0.1:3003 NUXT_PUBLIC_PB_URL=http://127.0.0.1:8093 PW_OUTPUT_DIR=/tmp/kankaku-card-contained-20260720-0912/pw-control pnpm --dir web exec playwright test e2e/control-consistency.spec.ts --reporter=line --grep-invert 'bulk assignment end-to-end' --max-failures=1`: 18 passed, 2.1m.
- `PW_BASE_URL=http://127.0.0.1:3003 NUXT_PUBLIC_PB_URL=http://127.0.0.1:8093 PW_OUTPUT_DIR=/tmp/kankaku-card-contained-20260720-0912/pw-surface pnpm --dir web exec playwright test e2e/surface-style.spec.ts --reporter=line --grep-invert 'bulk assignment end-to-end' --max-failures=1`: 5 passed, 33.8s.
- `PW_BASE_URL=http://127.0.0.1:3003 NUXT_PUBLIC_PB_URL=http://127.0.0.1:8093 PW_OUTPUT_DIR=/tmp/kankaku-card-contained-20260720-0912/pw-table pnpm --dir web exec playwright test e2e/table-surface-consistency.spec.ts --reporter=line --grep-invert 'bulk assignment end-to-end' --max-failures=1`: incomplete, external timeout at 240s during case 5/7; no retry.
- `PW_BASE_URL=http://127.0.0.1:3003 NUXT_PUBLIC_PB_URL=http://127.0.0.1:8093 PW_OUTPUT_DIR=/tmp/kankaku-card-contained-20260720-final/pw-card pnpm --dir web exec playwright test e2e/card-contained-fields.spec.ts --reporter=line --max-failures=1`: final 7 passed, 37.3s.
- `STACK_DIR=/tmp/kankaku-card-contained-20260720-0912; scripts/isolated-stack.sh up "$STACK_DIR" --pb-port 8093 --web-port 3003 --seed`: successful seeded provisioning.
- `STACK_DIR=/tmp/kankaku-card-contained-20260720-0912; scripts/isolated-stack.sh down "$STACK_DIR"`: stopped owned processes, retained evidence.
- `STACK_DIR=/tmp/kankaku-card-contained-20260720-final; scripts/isolated-stack.sh up "$STACK_DIR" --pb-port 8093 --web-port 3003 --seed`: successful fresh seeded provisioning.
- `STACK_DIR=/tmp/kankaku-card-contained-20260720-final; scripts/isolated-stack.sh down "$STACK_DIR"`: stopped owned processes, retained evidence.

### Learnings

1. CardHeader is a grid by default; an explicit flex override, not flex-row alone, establishes the requested alignment.
2. A narrow unlayered background declaration overrides utility paint without resetting focus, invalid, geometry or semantic states.
3. Portalled combobox surfaces are outside the card DOM and retain independent surface tokens.
4. Line-reporter attachments alone are not durable JSON receipts; explicitly write observed receipts to the owned output directory.
5. Optional long suites need parent-controlled bounded execution; an external timeout is incomplete evidence, not an assertion failure or permission to extend budgets.

No commit, push, version change or publication was performed. Native review/assessment and independent verification remain parent-owned.

## Settings follow-up handoff

The Settings extension is implemented and its required checks are complete. Fresh distinct browser results remain 42: extended card/Settings suite 7, chart regressions 12, control consistency 18, surface style 5. Both option groups were exercised in all six light/dark × 320/390/1280 configurations: inactive normal/settled-hover backgrounds match canvas, active backgrounds match primary and active labels match primary foreground, with 44px/r16/padding12/font geometry and keyboard rings intact. Real clicks update theme preference and all three locales; System is pressed according to stored preference while the resolved light/dark option remains unpressed. Settings wraps without document overflow. Original login/chart canvas, outside-card muted and independent popover checks still pass. All 73 palette primitives and DESIGN frontmatter remain unchanged; Settings renders version 0.3.9. The only production addition since the prior handoff is the inactive option opt-in and selection attributes; no handlers, primitives, data/query/backend logic or locale files changed.

Fresh verification commands:

- `pnpm --dir web test`: 49 files/594 tests passed; 1 file/38 tests skipped.
- `pnpm --dir web typecheck`: passed.
- `pnpm --dir web lint`: passed, 0 errors/23 warnings.
- `git diff --check`: passed.
- `npm run web:build`: passed, four prerendered routes with the same unused-import/SPA notices.
- `PW_BASE_URL=http://127.0.0.1:3003 NUXT_PUBLIC_PB_URL=http://127.0.0.1:8093 PW_OUTPUT_DIR=/tmp/kankaku-card-options-20260720/pw-card pnpm --dir web exec playwright test e2e/card-contained-fields.spec.ts --reporter=line --max-failures=1`: 7 passed, 1.1m.
- `PW_BASE_URL=http://127.0.0.1:3003 NUXT_PUBLIC_PB_URL=http://127.0.0.1:8093 PW_OUTPUT_DIR=/tmp/kankaku-card-options-20260720/pw-chart pnpm --dir web exec playwright test e2e/dashboard-project-series.spec.ts e2e/dashboard-chart-recovery.spec.ts e2e/dashboard-chart-preferences.spec.ts --reporter=line --grep-invert 'bulk assignment end-to-end' --max-failures=1`: 12 passed, 28.0s.
- `PW_BASE_URL=http://127.0.0.1:3003 NUXT_PUBLIC_PB_URL=http://127.0.0.1:8093 PW_OUTPUT_DIR=/tmp/kankaku-card-options-20260720/pw-control pnpm --dir web exec playwright test e2e/control-consistency.spec.ts --reporter=line --grep-invert 'bulk assignment end-to-end' --max-failures=1`: 18 passed, 2.1m.
- `PW_BASE_URL=http://127.0.0.1:3003 NUXT_PUBLIC_PB_URL=http://127.0.0.1:8093 PW_OUTPUT_DIR=/tmp/kankaku-card-options-20260720/pw-surface pnpm --dir web exec playwright test e2e/surface-style.spec.ts --reporter=line --grep-invert 'bulk assignment end-to-end' --max-failures=1`: 5 passed, 33.6s.
- `STACK_DIR=/tmp/kankaku-card-options-20260720; scripts/isolated-stack.sh up "$STACK_DIR" --pb-port 8093 --web-port 3003 --seed`: successful fresh owned provisioning on previously free ports.
- `STACK_DIR=/tmp/kankaku-card-options-20260720; scripts/isolated-stack.sh down "$STACK_DIR"`: owned processes stopped without purge.

Durable evidence: `/tmp/kankaku-card-options-20260720/pw-card/` contains six color/state receipts and eighteen login/Dashboard/Settings screenshots. All six receipts record `denied: []`, `businessMutations: 0`; local preference/locale changes performed no business/profile submission. Cleanup inspection reports no 3003/8093 listeners and no owned stack/Playwright/Chromium processes. Original optional table external-budget incident remains historical/incomplete, not an assertion failure or a check retried in this phase; the parent owns its independent bounded run.

Additional learnings:

1. Option selection must follow theme preference, not resolved theme: System and Dark/Light may resolve identically but have different pressed states.
2. Pair an explicit marker with `aria-pressed="false"` to preserve active primary paint without generalizing action-button backgrounds.
3. Settle actual hover transitions before sampling paint; reuse the existing matrix rather than claiming new tests for expanded assertions.

Task-board padding is explicitly queued for a sequential writer: its pending checkbox and parent scope paragraph are preserved; no task page or padding test was edited. Independent verification remains unchecked. No git delivery or publication was performed. Current authored review footprint is below 400 lines, including the untracked focused spec and feature document.

## Evidence / routing

Read-only mapping: gentle-ai-explore task “map form-control backgrounds inside cards”, returned synchronously to the parent conversation. Current selectors: web/app/pages/index.vue chart CardHeader around line654 and breakdown cards around lines698/706; shared Select marks data-slot=combobox-trigger. Card marks data-slot=card. Portalled ComboboxList/PopoverContent are not card descendants.

No active callable memory tools were discovered; repository task file is the durable record and no Engram mirror is claimed. Existing visual/browser wiring strict TDD mode remains Disabled; ordinary regression checks must be observed, not fabricated as RED/GREEN.
