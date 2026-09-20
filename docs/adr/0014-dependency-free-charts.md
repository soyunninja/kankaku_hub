# 0014 — Charts are a dependency-free SVG component

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-20 |

## Context

The dashboard and project-detail screens (proposal §9.2) need a time-series
chart. A charting library (Chart.js, ApexCharts, ECharts, ...) would be the
default choice, but this project's development environment has shown
unreliable network behaviour for package installation (see `ESTADO.md`'s
account of `pnpm dlx shadcn-vue add ...` hanging on a lockfile
supply-chain-policy verification step, unrelated to actual network
reachability but still a real friction point for adding dependencies).

## Decision

Build the chart as a dependency-free, hand-written inline SVG component:
`web/app/components/charts/StackedBarChart.vue`. It is sized via VueUse's
`useElementSize` (a dependency already in the project) so its `viewBox`
tracks the real container width via `ResizeObserver`, rather than a fixed
pixel width.

## Consequences

- No charting-library dependency, no bundle-size or licensing surface for
  that concern, no upgrade treadmill for a chart library's API.
- The component owns its own accessibility (keyboard-focusable bar groups,
  `role="img"`) and both-theme styling directly, rather than fighting a
  library's theming API.
- Any future chart type (line, pie, ...) requires hand-writing it the same
  way; there is no library to reach for when a new visualization is needed.

## Alternatives considered

- **Adopt a charting library** — rejected for this stage given the
  environment's dependency-installation friction and the small, well-scoped
  set of visualizations actually needed (proposal §9.2 deliberately keeps
  scope narrow: time/cost by project and client, over a date range).

## Related

- Code: `kankaku-hub/web/app/components/charts/StackedBarChart.vue`
- Spec: [`../specs/web-dashboard.md`](../specs/web-dashboard.md)
- Evidence: `kankaku-hub/ESTADO.md` ("Pase de pulido visual/UX" section, item 4 and the shadcn-vue CLI note)
