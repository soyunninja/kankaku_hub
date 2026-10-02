# Entries mobile ledger B

## Approved intent

Implement the selected B measurement ledger below 768px in the existing app.
Preserve desktop B at and above 768px, product names, Spanish Registros,
measurement quality, D6, export snapshots, and existing request ownership.
Preview PNGs are visual authority, not API implementations.

## Delivery plan

Two coherent steps: presentational mobile renderer and responsive filters;
then focused integration verification and one batched visual inspection.
Forecast: approximately 300–650 authored lines (advisory, not a cap).
Strict TDD is disabled by explicit parent choice for Vue/browser integration.

## Checklist

- [x] Pure renderer uses page-owned totals, entries, cache and action handlers.
- [x] Three columns keep identity, work and token cost together without overflow.
- [x] Primary period/client; seven secondary mobile filters including project.
- [x] Shared More state preserves values and reveals relocated focused controls.
- [x] Accessible mode, expansion, detail and sorting controls; focus restoration.
- [x] Desktop table structure, sticky expander and all hardening preserved.
- [x] Functional checks and read-only browser verification complete.
- [x] Batched 320/390/430 theme inspection, screenshots and measurements recorded.
- [x] Final independent verification passed; desktop and mobile B approved.

## Boundaries and evidence

No raw work_records aggregation, backend changes, release actions or new brand.
Fallback continues to use existing pre-consolidated task_entries grouping.
Physical devices, Safari and screen-reader certification are not established.
No persistent memory mirror is available or claimed.

## Implementation rationale

The page adapts existing server sessionRows and existing fallback groupOf
values into display-only props. Flat rows use their own measurements directly.
The child emits expansion, retry, detail (with the actual trigger event),
selection, session-filter and sort actions; it owns no API client or requests.
Known quality notes read actual entry fields or available server counters;
no aggregate quality classification or new session arithmetic is introduced.

Only one ledger tree renders at a time. Filter inputs remain single instances:
Teleport moves project between desktop primary and mobile More. The existing
More boolean is shared across viewports, initially closed; relocation reveals
it when needed to preserve focus. Sheet close returns to its connected origin,
or the period control if resizing unmounted that origin.

## Observed verification

- `pnpm --dir web test`: 581 passed, 38 skipped; 48 passing files, one skipped.
- `pnpm --dir web typecheck`: passed.
- `pnpm --dir web lint`: passed, zero errors and 23 incumbent prop warnings.
- Implementation worker's required read-only Playwright selection: 52 passed in Chromium (separate from the independent rerun below).
- `git diff --check`: passed.
- Impeccable detector ran once against both UI files: exit 0, zero findings;
  `/tmp/kankaku-mobile-ledger-b.yfDH57/impeccable-detect.json`.

Earlier failures were corrected: refresh gained a dependency the source-extraction
unit harness did not inject (reset moved to a watcher), Japanese narrow sort
headers needed wrapping, a fixture literal lost precision, and a new outer-table
selector inadvertently counted the four nested headers. No assertions were
weakened to permit overflow or incorrect column counts.

Actual B first-record y is 372.66 at 320/390/430/667px in both themes, versus
the preview's recorded baseline y=792 at 390px. Document and ledger horizontal
overflow are zero; sampled measurements remain unclipped, including large
flat values with long EN/ES/JA identity/client/project text. Sampled mobile
controls are at least 44px high and wide. These are layout observations,
not a device or accessibility certification.

Grouped work/cost match the same desktop page fields (first row 18m/$0.1117).
Expansion reads once and survives collapse/re-expand without another read;
detail getOne reads once. Resizing the presentation makes zero telemetry reads.
All six advanced controls, project and period retain focus across 767/768px.
Seven mobile secondary filters become six desktop secondary filters without
changing applied values; closed-pane export keeps its snapshot. Clear removes
deep-link context without auto-switching flat mode. Retry/loading/error/empty,
404 fallback, session marker versus detail, viewer permissions, stale guards,
CSV/XLSX and partial-export consent checks passed. Desktop outer shapes remain
8 flat / 10 grouped / 4 nested at 1280 and 1440; sticky grouped expanders were
checked in light/dark and extended catalog contexts.

### Final independent verification

Independent task `muriouxg-x-czt9` passed. Source inspection confirmed the
presentational renderer and page-owned queries, caches, filter reset, detail
and export; server measurements, pre-consolidated fallback and flat task_entries
remain unchanged, with no raw aggregation or billing additions. Checks covered
seven mobile versus six desktop secondary filters, resize focus/state retention,
expansion/request counts, export snapshots, stale guards, complete expanded
metadata and 10KB JSON, large Japanese amounts, and desktop 8/10/4 columns.
Spanish retains the actual title Registros.

Independent unit checks recorded 581 passed / 38 skipped; typecheck passed,
lint had zero errors / 23 incumbent warnings, and diff checking passed.
`npm run web:build` passed with toolchain warnings. The safe 12-spec Chromium
selection first recorded 51 passed, one cold-navigation timeout and 86 pending
checks amid dev-module HTTP failures; no application defect was established.
The unchanged rerun recorded 52 passed. This is not a first-attempt all-pass
claim or a replacement for the worker's separate 52-pass evidence above.
The owned verification instance at `/tmp/kankaku-mobile-b-verify.p3nd7X` was
stopped and its logs retained; original inspection/final-out evidence remains.
An immediate pre-transition `context-detail.json` focus value of false is not
a settled-close failure: settled close-focus verification passed.

Both phone themes were inspected; zero overflow at 320/390/430/667px is
emulated-width evidence only. Desktop and mobile visual improvements are now
approved, not pending. The historic critique score of 25/40 remains historic;
no rescore, physical-device/orientation proof, other-engine/iOS Safari proof,
screen-reader certification, native Japanese review or blanket WCAG claim
is established.

### Actual B artifacts (not prototype captures)

The parent copied inspected implementation captures to:
- `.impeccable/previews/entries-mobile/implemented-light.png` (Spanish light).
- `.impeccable/previews/entries-mobile/implemented-light-en.png` (English light).
- `.impeccable/previews/entries-mobile/implemented-dark.png` (English dark).

All generated evidence is under `/tmp/kankaku-mobile-ledger-b.yfDH57/mobile-out/`.

- Light: `entries-mobile-ledger-B-ac-bda55-urements-and-cached-details-chromium/B-actual-light-390.png`.
- Dark: `entries-mobile-ledger-B-ac-6aae2-urements-and-cached-details-chromium/B-actual-dark-390.png`.
- Expanded: the same respective directories contain
  `B-actual-expanded-light-390.png` and `B-actual-expanded-dark-390.png`.
- Each theme directory contains `measurements.json` and actual 320/430/667px captures.
- Flat and More: `entries-mobile-ledger-flat-231ca-serve-focus-and-query-state-chromium/`.
- Fallback: `entries-mobile-ledger-tota-2abe8-e-groups-with-no-lazy-fetch-chromium/`.
- Large-value locale captures and `large-measurements.json`:
  `entries-mobile-ledger-long-2349c-n-readable-at-narrow-widths-chromium/` (EN),
  `entries-mobile-ledger-long-96104-n-readable-at-narrow-widths-chromium/` (ES),
  `entries-mobile-ledger-long-8c48a-n-readable-at-narrow-widths-chromium/` (JA).
- Desktop captures/geometry: `entries-desktop-filters-*` and
  `entries-accessibility-keyb-*/desktop-flat-*`,
  `entries-accessibility-nest-*/desktop-expanded-*`.

Emulated coarse-pointer taps exercised More, expansion, retry and details.
The 667px capture is a sub-md viewport-width check, not a physical landscape
phone test (its capture height remains 844px). Physical iOS/Android, Safari,
screen readers, native-speaker Japanese review and blanket AA certification
remain unverified. No custom gesture control was introduced.

The parent completed independent confirmation and retains terminal git ownership.
No commits, pushes, deployment or version changes were made; branch
`feat/entries-desktop-filters` and unrelated dirty work were retained.
