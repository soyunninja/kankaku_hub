# Open Design web style guide

## Intent

Create a separate visual, navigable Open Design style guide documenting the implemented kankaku-hub web interface. This is documentation, not a redesign or authorization to edit application code. The user explicitly requested the guide in Spanish. Localize its visible copy and usage README; keep code identifiers, token names, source paths and filenames unchanged. This explicit override applies to the external guide, not the web application's locales.

## Tasks

- [x] Extract current source-grounded light/dark tokens, component geometry, states and exceptions through read-only mapping.
- [x] Generate a separate Open Design project with an interactive style-guide preview.
- [ ] Localize the generated guide and its usage README to Spanish without changing tokens or behavior.
- [ ] Check the Spanish guide against current source and provide its preview reference.

## Source authority

Current CSS and Vue components take precedence over historical DESIGN.md frontmatter. That frontmatter still contains obsolete 36px/8px/transparent field values; ordinary controls are actually 44px high, radius 16px and muted-filled. Do not reproduce these obsolete values.

Use the 73 actual color primitives, not generated tonal ramps as application tokens. Dark muted is #1C1C1C; elevated popover/secondary/accent is #292929. Primary and chart-1 are separate normative OKLCH roles. Dark focus paint is neutral, distinct from exact pink brand tokens. Do not claim a blanket WCAG certification.

The pending toolbar correction provides a dedicated muted resting/hover treatment for the six reported toolbar triggers. Confirm its final verification status before labeling the guide's corresponding examples verified.

## Acceptance criteria

- Separate Open Design project; no application, backend, seed, publishing or version changes.
- Navigable sections: foundations, semantic colors, typography/numerals, spacing/radii, components, states/accessibility, layout/table patterns, and do/don't examples.
- Functional light/dark switching and representative focus/disabled/invalid component examples.
- Correct 44px controls, 44/36 segmented groups, 16/12px radii, 24px layout rhythm and intentional compact calendar/table exceptions.
- Matching muted toolbar triggers, borderless action buttons/cards, visible focus/error indicators, no decorative table hover.
- No new brand, invoicing/rate concepts, private reference screenshots or real user/auth data.
- Source provenance and honest platform/verification limits.

## Evidence

Read-only source extraction: task musulngl-3-404s. A separate Open Design project, “kankaku-hub — Web Style Guide”, was created and supplied with reference/implemented-tokens.json (37 light and 36 dark color declarations plus actual Button source and current geometry). Generation was commissioned through Open Design using its installed local runtime. Generation succeeded with index.html, README.md and a reusable token JSON copy. The generator performed static checks only. Independent runtime verification (task musvhv8e-6-y478) found mobile clipping, incorrect field/focus/destructive specimens, decorative shadows/borders, wrong layout metrics and incomplete interactions/content. The verifier stopped safely when the user requested Spanish; all owned browsers closed, no project files changed. Evidence: /tmp/od-guide-verify-36dE0P/results.json. Open Design is now revising the guide in Spanish using reference/spanish-rendered-review.md; fresh runtime verification remains pending. The first generation attempt failed before producing artifacts because the local runtime's configured default model was unsupported for its account. A new generation request explicitly selected an advertised alternative model and succeeded; no global configuration, login, or billing mode was changed.

Generated preview: http://127.0.0.1:59617/api/projects/kankaku-hub-web-style-guide-9c6c/raw/index.html

Studio reference (current daemon session): http://127.0.0.1:59625/projects/kankaku-hub-web-style-guide-9c6c/conversations/09358e1f-32d3-4506-918c-c17169a35e52
