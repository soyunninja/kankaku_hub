# Desktop entries previews — not applied

The PNGs are the deliverables: 1440 × 1000, Spanish UI, identical standard synthetic seed data and incumbent application CSS in both themes.

- `A-light.png`, `A-dark.png`: all nine dimensions visible; reporting context first, entry-only filters with their grouping restriction, then agent/status/machine.
- `B-light.png`, `B-dark.png`: context and preview-only Sessions/Entries mode with inline More filters disclosure (zero active secondary filters).
- `B-expanded-light.png`, `B-expanded-dark.png`: all supporting filters revealed inline.

`render.cjs` logs into the isolated fixture and clones the current rendered DOM, stripping Vue event handlers. Only the authored More filters disclosure works; Enter toggling and focus were checked. No filter, export, assignment or mode actions are functional. API mutation requests are blocked. No full keyboard or contrast audit was performed.

`A.html` and `B.html` are captured DOM snapshots referencing the now-stopped isolated Vite assets, not offline-functional deliverables. The executable disclosure is provided by the renderer, not serialized HTML. No application code was changed.

`measurements.json` records the confirmation pass: no document overflow, nine dimensions, 25 seeded session rows, table right edge 1415px, visible expansion controls, zero table card/content padding. Horizontal cell padding is 6px to keep the original grouped columns and expanders inside the content area. Session names preserve the incumbent ellipsis behavior. A table begins at y=454; B collapsed at y=231; B expanded at y=418. Inter is the declared incumbent font stack, not a claim about installed font availability.

One correction batch added a theme-transition settling delay and reduced horizontal cell padding; no further render loop. The isolated stack at `/tmp/kankaku-entries-desktop-preview.dO8w5A` was stopped after capture. No shipping behavior or mobile design is proposed.
