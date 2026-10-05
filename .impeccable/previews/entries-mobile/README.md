# Entries: mobile previews only

No application, desktop, locale, configuration or release source was changed. Show both options before asking the owner for a preference; neither is selected for implementation.

## Compare

- **A — compact session list:** title first, condensed client/project context, labelled work and token cost in the same block. Thin dividers, one ledger surface, inline disclosure.
- **B — compact ledger:** fixed identity, work and token-cost columns together; date/client/project below the title. Inline secondary information, not horizontal identity scrolling.

Main captures: `A-light.png`, `B-light.png`, `A-dark.png`, `B-dark.png`.
Additional evidence: `A-expanded-light.png`, `B-expanded-light.png`, `A-flat-light.png`, `B-flat-light.png`, `A-filters-light.png`, `B-filters-light.png`, and the untouched source `baseline-mobile.png`.

All images are browser viewport captures at 390 × 844, without handset decoration.

Absolute directory: `/Users/baldboy/desarrollo/soyun.ninja/kankaku-hub/.impeccable/previews/entries-mobile/`.

## Data and boundaries

The isolated standard seed created 437 fictional task entries. `renderer.cjs` authenticated the isolated fixture owner, rendered the real Entries page in a fresh browser, captured its grouped table fields, opened the first session to capture its actual child entry, then read the existing flat view. Both options import the same rendered values. First sessions:

| Title | Work | Token cost |
| --- | --- | --- |
| Add file upload validation | 18m | $0.1117 |
| Migrate auth to PocketBase | 3h 19m | $0.0678 |
| Optimize dashboard queries | 3h 16m | $0.0402 |

Grouped measurements come from the existing server session totals over consolidated `task_entries`; nothing aggregates raw `work_records`. No new measurement or API contract is implied. Avatar initials are retained in the imported client labels. Full titles and table context are available in inline disclosures. Only the first grouped disclosure illustrates an actual loaded child; other session disclosures show their imported context, not a fabricated child list.

Primary period/client plus seven secondary dimensions are represented: project, model, quality, search, agent, status, machine. More count starts at zero and excludes period/client. Grouped model, quality and search remain disabled, with a persistent Entries hint in the pane. Source date presets remain the intended semantics; the visual period trigger does not implement a new picker.

Filters, view-mode buttons, export, shell menus and entry-detail content are visual previews, not functional replacements. Native details disclosures are locally operable; the child “Ver detalles” demonstrates the access affordance rather than reproducing the complete existing detail sheet. No assignment, CRUD, download, clipboard or production write actions were invoked. The existing header DOM was reused; its inherited breadcrumb remains hidden at mobile width.

## Observed checks

`measurements.json` records both options in both themes at widths 320, 390 and 430. Document and main ledger overflow are zero in all twelve checks; sampled primary numeric text is not clipped. Visible main buttons/disclosures measure at least 44 × 44 px. First disclosure was opened using focus + Enter for each option. This is not a complete accessibility certification.

First-record top positions:

| Width | A | B |
| --- | --- | --- |
| 320 | 346 | 408.5 |
| 390 | 330 | 371.5 |
| 430 | 330 | 371.5 |

The actual baseline first record started at y=792 at 390 px. Light and dark CSS background values are recorded in the measurements; incumbent source CSS supplies all semantic tokens. Screenshots were captured after settling the theme, not during a transition.

Engine: Playwright Chromium with an emulated mobile viewport. No physical iOS/Android, Safari, touch-gesture or native-device certification. No swipe interaction introduced.

`git diff --check` passed. Before/after git status retained the same pre-existing modified and unrelated untracked files; all 13 pre-existing modified web files were byte-identical to the startup isolated clone. Changes made here are confined to this preview directory.

The owned stack on 8093/3003 was stopped. Logs/data retained at `/tmp/kankaku-entries-mobile-preview.lFdxLV`. Other stacks were untouched.

The HTML files reference stopped temporary Vite assets and are not durable standalone demos. The PNGs and JSON are the durable review artifacts. Re-running the renderer requires a freshly seeded authorized isolated stack at the same ports and the existing Playwright dependency; no installation is needed.
