---
target: /entries
total_score: 25
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
target_identity: "file:/Users/baldboy/desarrollo/soyun.ninja/kankaku-hub/web/app/pages/entries/index.vue"
target_fingerprint: "sha256:2a72038a6deb532518e29127305b8db76cf9a13a64e1853f2e2b1c914d1a5a4f"
target_path: /Users/baldboy/desarrollo/soyun.ninja/kankaku-hub/web/app/pages/entries/index.vue
timestamp: 2026-10-02T12-32-09Z
slug: web-app-pages-entries-index-vue
---
Method: dual-agent (A: muqxgkar-a-uoug · B: muqxh4px-b-ww6r)

# Critique of `/entries`

## Design Specificity Verdict

The visual identity works; the main opportunity is access to measurements. Sessions, consolidated entries, client/project context, and work/waiting/token detail make this recognizably kankaku's measurement ledger. Preserve its identity rather than redesigning its aesthetics.

## Design Health Score

25/40 — Acceptable, with significant usability improvements needed. This is a heuristic judgment, not accessibility certification. All ten heuristics apply.

| # | Heuristic | Score /4 | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Clear loading/errors; weak detail focus. |
| 2 | Match system / real world | 3 | Appropriate terminology; terse pagination. |
| 3 | User control and freedom | 2 | Panels can be dismissed; no consolidated filter reset. |
| 4 | Consistency and standards | 3 | Cohesive system; sorting headers are not accessible controls. |
| 5 | Error prevention | 3 | Date validation and grouping constraints protect context. |
| 6 | Recognition rather than recall | 2 | Disabled filters and mobile context loss. |
| 7 | Flexibility and efficiency | 2 | Presets/grouping exist; detail/sorting depend on pointer access. |
| 8 | Aesthetic and minimalist design | 2 | Initial mobile filter panel consumes too much space. |
| 9 | Error recovery | 3 | Retry exists; empty-result recovery remains manual. |
| 10 | Help and documentation | 2 | Tooltips exist; mode restrictions need visible guidance. |
| **Total** | | **25/40** | **Acceptable** |

## Overall Impression

Keep the ledger. Improve access to its measurements rather than replacing its visual identity. Neutral surfaces, restrained pink signaling, tabular numerals, and the dark plum-toned system remain coherent.

## What's Working

- Session → entry → detail disclosure matches the measurement audit workflow without duplicating all information.
- The detail explains work, elapsed time, waiting, and raw records, supporting interpretation and trust.
- Both themes retain a coherent, restrained identity. Preserve them.

## Priority Issues

### [P1] Keyboard access and detail accessibility

Flat and nested rows open detail by click without an equivalent keyboard-accessible detail control. Date/time/cost headers use click handlers without focusable controls or `aria-sort`. Browser evidence also confirmed the sheet's ARIA naming and description identifiers do not resolve, leaving an unnamed dialog. Initial focus did not reach its intended heading.

Why: keyboard users cannot complete the same primary inspection path as pointer users; active ordering and detail context are harder to understand.

Fix: add named detail buttons per entry, buttons inside sorting headers with visible direction and `aria-sort`, and correctly linked sheet title/description with reliable initial focus.

Suggested command: `/impeccable harden /entries`.

Evidence: `web/app/pages/entries/index.vue:660–694,869–889,1028,1072,1125–1140`; `web/app/components/entries/EntryDetailSheet.vue:216–223`; A screenshot `09-desktop-en-dark-flat.png`, B `element-evidence.json` and `desktop-detail-overlay.aria.txt`.

### [P1] Mobile separates measurements from work identity

At 390px the ledger starts around y=752. The primary grouped table is approximately 1170px wide within a 356px viewport, requiring about 814px horizontal travel. Time/cost becomes visible after the session identity disappears.

Why: users must remember which work belongs to the measurements. Totals remain reachable; this is context friction, not an inability-to-view-totals claim.

Fix: lead with period/client and disclose secondary filters; keep session identity, time, cost, and expansion together in a compact narrow-screen presentation. Retain the full desktop ledger.

Suggested command: `/impeccable adapt /entries`.

Evidence: `index.vue:704–775,910–967`; A `13-mobile-es-light-top.png`, `15-mobile-es-light-table-right.png`, `17-mobile-es-dark-table-left.png`. B fallback geometry is different and is not substituted for primary grouped measurements.

### [P2] Disabled filters need an obvious route to activation

Model, measurement quality, and prompt search are visible but disabled in default grouped mode. Native title help exists, but is not reliable touch guidance. Persistent explanation appears after unsupported filters are active.

Why: users must infer that a separate grouping switch unlocks these controls; disabled controls still consume attention and space.

Fix: add adjacent explanation and an explicit switch-to-entry-view action, or an entry-only filter disclosure that explains/performs the transition. Preserve protection against silently dropping filters.

Suggested command: `/impeccable clarify /entries`.

Evidence: `index.vue:750–785`; A desktop/mobile grouped screenshots.

### [P2] Empty results show invalid pagination and manual recovery

A nonexistent model shows no matching entries followed by `0 · 1/0`; users must reverse individual filters because no clear-all action exists.

Why: page one of zero undermines confidence; recovering from combined filters is needlessly laborious.

Fix: show zero entries without an invalid page fraction and add Clear filters, retaining the distinction between no matches and loading errors.

Suggested command: `/impeccable harden /entries`.

Evidence: `index.vue:450–455,1108–1116`; A `10-empty-model-filter.png`.

## Deterministic Scan and Browser Evidence

Static CLI detector ran once successfully: exit 0, JSON `[]`, zero findings. This does not certify the rendered UI, because the Vue page delegates to components and Tailwind classes.

Injected browser detector reported 10 element groups and 11 detail logs: nine undersized avatar initials, one Inter-font advisory, and one repeated-Todos advisory. Initials accompany full names, Inter fits the operational interface, and each Todos belongs to a different labeled filter. These are contextual/non-actionable signals, not priority defects or nine separate usability failures.

Browser inspection added a genuine finding: unresolved sheet ARIA references and an unnamed dialog. The source and captured DOM corroborate it; actual screen-reader software was not tested.

Assessment A inspected primary grouped rendering. B's request guard blocked the read-only POST totals query; B then deliberately activated fallback with a synthetic 404. That guard-induced failure is not an application defect, and B's fallback geometry/disabled-filter state does not establish primary grouped behavior.

Mutable preflight and detector injection succeeded in headless Chromium; no human-visible browser tab or overlay is claimed. Only B's initial fallback grouped state was automatically scanned; its later mobile/flat/detail captures did not independently rescan.

## Cognitive Load and Persona Red Flags

Moderate desktop load and high mobile load under the reference checklist: nine filter dimensions, weak progressive disclosure, and mobile loss of row identity. Searchable selectors mitigate some complexity. Cognitive-load classification does not imply P0 severity.

- Alex: must leave grouped mode to filter by model; sorting and detail remain pointer-dependent.
- Sam: can expand sessions, but cannot complete entry inspection through an equivalent keyboard control; the detail's accessible name is unresolved.
- Casey: scrolls through a long filter panel, then horizontally through the ledger to relate session identity to cost.

## Emotional Journey

Arrival feels trustworthy. Disabled controls introduce hesitation. Detailed measurements provide clarity, but mobile travel and the empty `1/0` ending interrupt confidence.

## Minor Observations and Limits

CSV/XLSX export exists and has an accessible name; a visible label could improve discovery. Uncertainty is clearer in the detail than the table, but this sample does not establish an incorrect result. Date dismissal worked; presets apply immediately, so Escape does not imply reverting an already applied live filter.

Full screen-reader behavior, comprehensive contrast, 200% zoom, owner-only workflows, successful Retry recovery, and downloaded workbook contents were not fully revalidated in this critique. Prior regression tests cover recovery/export. No source changes or record CRUD occurred. Parent runtime and B's helper server were stopped; temporary evidence was retained.

Evidence roots: `/tmp/kankaku-entries-critique.u1DGUa/assessment-a/` and `/tmp/kankaku-entries-critique.u1DGUa/assessment-b/`.

## Questions to Consider

Can narrow screens retain work identity alongside measurements without discarding audit information? Can users discover available filters without interpreting disabled controls?

Archive language: English, in accordance with repository artifact conventions; the user-facing report was delivered in Spanish with the same findings and priorities.
