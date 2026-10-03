# Headerless shell with bottom account controls

Move shell utilities into the left navigation footer, with the avatar/account row last at the bottom. Page titles remain authoritative; authenticated pages no longer reserve space for a persistent header.

## Intent and boundaries

- Desktop: a borderless rounded 15rem sidebar inset 24px from the canvas, with height `calc(100dvh - 48px)`, independently scrolling navigation, and a non-shrinking bottom footer.
- Mobile: one ordinary-flow menu trigger opens the existing left Sheet, locally overriding only the navigation Sheet's right border to zero. The same footer places search and the viewer badge above the account row. The latest user decision removes theme/language controls from both menus: they remain available exclusively on the existing Settings page.
- Preserve the single command palette, keyboard shortcut, localized utility menus, avatar fallback, full account email, and local logout followed by `/login`.
- Preserve page filters, domain logic, navigation taxonomy, flat surfaces, and existing semantic colors. The next palette phase and parent independent review remain separate.
- Retain the unused legacy Header source while the existing avatar wiring unit test references it; never import it into the live shell.

## Checklist

- [x] Implement layout and footer with account controls last.
- [x] Preserve utility access, Sheet/palette focus, and breakpoint focus without stealing page-filter focus.
- [x] Replace intentional header assertions and add read-only shell regressions.
- [x] Run unit tests, typecheck, lint, diff checks, and sidecar parsing.
- [x] Run the owned :3003/:8093 browser suite with only the approved bulk-assignment exclusion; stop the stack.
- [ ] Parent independent combined review after the pending palette phase.

## Verification contract

Strict TDD is disabled by the parent's visual Vue/browser-wiring policy. Ordinary functional verification is required. Browser tests may authenticate and read, but must not mutate business records. The approved browser exclusion is `--grep-invert "bulk assignment end-to-end"`; write-fixture opt-ins remain disabled.

Only the outside-footer/menu focus segment in `web/e2e/entries-desktop-filters.spec.ts` may change. Its original Theme sentinel is now the footer Search button, focused without opening the palette. Existing filter-value, filter-focus, and BODY/no-focus-steal assertions remain intact. `surface-style.spec.ts` keeps its accessible Open menu selector and all style/navigation/focus assertions.

## Observed verification

- Final 24px inset run: 46 browser tests passed, including all eight new shell tests, existing filter/ledger focus checks, and every surface-style check. One required test failed: `polish.spec.ts` / `mobile viewport (390px) never overflows horizontally` / `every table-in-card screen fits inside the viewport`. Its first action still targets a Projects table row; the current Projects page uses cards. No assertion was weakened or test excluded to hide this failure.
- Earlier runs exposed navigation remount reads on resize; keeping desktop navigation mounted resolved them without changing SidebarNav or record APIs. A new logout assertion was corrected to accept the existing `/login?redirect=/entries` behavior. Two intermediate cold runs also failed `disclosure preserves active filters, export snapshot, focus, and mode guards`; that test passed in the final run. This history is retained, not treated as base-failure certification.
- Unit tests: 586 passed, 38 skipped. Typecheck passed. Lint: zero errors, 23 warnings. Diff and sidecar parsing checks passed. Mechanical detector returned zero findings before the final spacing-only correction.
- Final browser artifacts: `/tmp/kankaku-sidebar-footer.Rnaucw/shell-out`. All task-owned stacks were stopped; temporary evidence directories were retained. No business-record CRUD or write-fixture opt-in was used during browser checks.
- Required suite remains non-green, so the writer handoff is partial. Palette work and parent independent review remain pending.

## Delivery

No version bump, commit, push, or release is authorized. Completion evidence and remaining risks go to the parent; this document does not certify final combined review.
