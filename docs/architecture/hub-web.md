# Hub web (Nuxt SPA)

`web/` — Nuxt 4.5 (`nuxt: ^4.5.2`), `ssr: false` (a pure client-routed SPA),
PocketBase JS SDK `^0.28.1`. Built with `nuxt generate` and served by
PocketBase itself via `--publicDir` — one process, one binary, no Node
server in production. See [ADR 0015](../adr/0015-static-spa-served-by-pocketbase.md).

## Routing and pages

`app/pages/` (file-based routing, no `pages/` prefix per Nuxt 4's `app/` convention):

| Route | File | Screen |
|---|---|---|
| `/` | `index.vue` | Dashboard: KPIs, comparison vs. previous period, stacked time-series chart, breakdown by client/project, top costly entries, "include Sin determinar" toggle, debounced realtime refresh. |
| `/login` | `login.vue` | Auth entry point; the only route reachable while unauthenticated. |
| `/clients` | `clients/index.vue` | Client CRUD + archive; "Sin determinar" protected from edit/delete. |
| `/projects` | `projects/index.vue` | Project CRUD + archive + `repo_paths` editor. |
| `/projects/:id` | `projects/[id].vue` | Project detail: KPIs, trend, tasks, top prompts, breakdown by model. |
| `/tasks` | `tasks/index.vue` | Task board (drag-and-drop by status) + list view, CRUD, accumulated cost/time per task. |
| `/unassigned` | `unassigned/index.vue` | "Sin determinar" reassignment queue. |
| `/entries` | `entries/index.vue` | Entries explorer: filters, server pagination/sort, detail drawer with `work_records` children. |
| `/settings` | `settings/index.vue` | Theme, language, hub URL, current user, schema summary, app version. |

## Layouts and shell

- `app/layouts/default.vue` — the authenticated shell: full-height flex
  layout (`h-dvh`), sticky sidebar (`SidebarNav.vue`, collapses to a `Sheet`
  on mobile), header with translated breadcrumbs, command palette
  (`CommandPalette.vue`, Ctrl/Cmd+K over clients/projects/tasks).
- `app/layouts/auth.vue` — the unauthenticated (login) shell.
- `app/middleware/auth.global.ts` — client-only route guard: calls
  `ensureFreshSession()`, then redirects unauthenticated users to `/login`
  (preserving `?redirect=`) and authenticated users away from `/login`.

## Data access

One shared PocketBase client (`app/plugins/pocketbase.client.ts`), provided
as `$pb` via `useNuxtApp()`. Base URL resolution, in order:

1. `NUXT_PUBLIC_PB_URL` (any environment).
2. In `nuxt dev` with no override: `http://127.0.0.1:8090` (the Nuxt dev
   server runs on a different port than PocketBase).
3. Otherwise (the production static build, served by PocketBase itself):
   `window.location.origin` — deliberately **not** an empty/relative string.
   The PocketBase SDK builds request paths like `api/collections/...`
   without a leading slash, which the browser resolves against the
   *current page path*, not the origin root. From a deep-linked route like
   `/clients` that is not exactly `/`, a relative base silently produces
   wrong URLs (`/clients/api/...`). An absolute origin sidesteps that
   entirely.

Each domain area gets a thin composable over `$pb.collection(...)`, sharing
state via `useState` (so a page revisit doesn't refetch until `refresh()` is
called): `useAuth`, `useClients`, `useProjects`, `useTasks`,
`useTaskEntries`, `useEntriesExplorer`, `useUnassignedQueue`, `useToast`.
Auth (`useAuth.ts`) wraps PocketBase's own `authStore` (already
localStorage-backed): `ensureFreshSession()` calls `authRefresh()` once on
boot for a persisted token, clearing it on failure rather than retrying —
there are no stored credentials to retry with client-side.

## The D6 guard

`app/lib/aggregate.ts` carries a header comment declaring it the only module
in the web allowed to sum `task_entries` fields (`sumTaskEntries`,
`groupByKey` and its `groupByClient`/`groupByProject`/`groupByModel`
specializations, `avgCostPerTask`, `groupUnassigned`). It never imports or
sums `work_records`. See [`aggregation.md`](aggregation.md#the-shared-fixture-guard)
and [ADR 0007](../adr/0007-web-is-a-view-layer.md).

## Unassigned queue

`app/composables/useUnassignedQueue.ts`: fetches every `task_entries` row
whose `client` is the "Sin determinar" id; `app/lib/aggregate.ts#groupUnassigned`
groups them by `(legacy_client_label, repo_project)` — keyed by a JSON tuple
rather than string concatenation, since both fields routinely contain spaces
and would corrupt a naive delimiter join. Bulk reassignment
(`bulkAssign`) uses PocketBase's batch API (`$pb.createBatch()`), chunked at
50 rows (server caps a single `/api/batch` call at 100 sub-requests), with
per-chunk progress reporting and per-request status checking (the batch
endpoint does not fail the whole call for one bad sub-request).
`app/lib/suggest-client.ts` additionally proposes a pre-filled client for
each group by **exact** normalized match (lowercase, no spaces/punctuation/
accents) against a client's name or code — deliberately conservative: it
never does fuzzy/typo correction (consistent with
[proposal §5.4](../proposal.md#54-fuzzy-matching-is-deliberately-absent)),
and the user still confirms the assignment.

## Entries explorer

`app/composables/useEntriesExplorer.ts` — server-side paginated/sorted/
filtered browse of `task_entries` via `$pb.collection('task_entries').getList(...)`,
filtering on `client`/`project`/`task`/`status`/`model`/`machine`/date range/
prompt substring, with `expand: 'client,project,task'`. Filter values are
escaped (`escapeFilterValue`, local to this composable) before interpolation
into the PocketBase filter string. Each row's detail drawer shows its child
`work_records` with an explicit "never summed" notice.

## Charts

`app/components/charts/StackedBarChart.vue` — a dependency-free inline SVG
component (no charting library), sized via VueUse's `useElementSize`
(ResizeObserver) so the `viewBox` matches the real container width instead
of a fixed pixel width. See [ADR 0014](../adr/0014-dependency-free-charts.md).

## Theming

`@nuxtjs/color-mode` (`^4.0.1`), configured in `nuxt.config.ts`:
`preference: 'dark'`, `fallback: 'dark'`, `storageKey: 'kankaku-color-mode'`.
Dark is the default with no flash of the wrong theme (verified with
Playwright on a fresh profile); a dark/light/system switcher
(`ThemeToggle.vue`) persists the choice to `localStorage`.

## i18n

`@nuxtjs/i18n` (`^10.6.0`), `strategy: 'no_prefix'`, `defaultLocale: 'es'`,
**`detectBrowserLanguage: false`** — Spanish is a hard default per an
explicit owner requirement, never auto-detected from the browser; only an
explicit choice through `LocaleSwitcher.vue` (persisted) changes it.
Locale files: `web/i18n/locales/es.json`, `web/i18n/locales/en.json`.
`tests/i18n.test.ts` compares both files key-by-key and fails on divergence
or an empty value.

## UI components

`app/components/ui/` holds shadcn-vue-style primitives (`reka-ui` + `cva` +
`tailwind-merge` + `@lucide/vue` icons), currently mid-polish (see
[ESTADO.md](../../ESTADO.md)) and possibly migrating to the official
shadcn-vue registry components. This document deliberately does not track
the primitive-by-primitive implementation detail of that folder — treat it
as "a component library the app pages consume," and expect it to keep
changing shape independent of the requirements above.

## The `nuxt generate` + PocketBase static-serving gotcha

With `ssr: false`, Nuxt's default prerender produces one `index.html` folder
per route (`login/index.html`, `clients/index.html`, ...). PocketBase's
static file server treats such a folder as a directory and 301-redirects to
the URL with a trailing slash, which breaks the PocketBase SDK's relative
request URL resolution (`api/...` resolves against the *current path*, not
the root — e.g. `/login/api/...`). Fixed two independent ways (see
[`runbooks/troubleshooting.md`](../runbooks/troubleshooting.md)):
`nitro.prerender` in `nuxt.config.ts` now prerenders only `/` (PocketBase
already serves `index.html` as a 200 SPA fallback for any unmatched path);
and the PocketBase client plugin uses `window.location.origin` in production
instead of relying on relative resolution at all (see "Data access" above).

## Related

- [`overview.md`](overview.md), [`aggregation.md`](aggregation.md)
- [`../specs/web-auth-and-shell.md`](../specs/web-auth-and-shell.md), [`../specs/web-dashboard.md`](../specs/web-dashboard.md), [`../specs/web-catalog-management.md`](../specs/web-catalog-management.md), [`../specs/web-tasks.md`](../specs/web-tasks.md), [`../specs/web-unassigned-queue.md`](../specs/web-unassigned-queue.md), [`../specs/web-entries-explorer.md`](../specs/web-entries-explorer.md), [`../specs/web-theming-and-i18n.md`](../specs/web-theming-and-i18n.md)
- [`../runbooks/local-development.md`](../runbooks/local-development.md)
