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

**`ensureLoaded()` must await a shared in-flight `refresh()`, never just
check-and-skip.** `useClients`, `useProjects`, `useTasks`,
`useUnassignedQueueCount`, `useSessionsQueueCount` all cache a list behind
`loaded`/`loading` `useState` flags. The naive guard — `if (!loaded.value
&& !loading.value) await refresh()` — has a real race: two callers mounted
by the same navigation (e.g. the sidebar's unassigned-queue badge and the
`/unassigned` page itself) can both call `ensureLoaded()` in the same
tick; the first sets `loading.value = true` synchronously before its own
first `await`, so the second sees `loading.value === true`, correctly
skips calling `refresh()` again, but then returns immediately WITHOUT
waiting for the first caller's in-flight request — reading the list while
it is still empty. Found by an independent review on 2026-09-21 (it
produced exactly this: the sidebar badge showed the correct count while
the page rendered its empty state) and fixed in all five composables with
a module-scoped in-flight promise that every concurrent caller awaits.
Any NEW composable following this cache pattern must do the same.

## The D6 guard

`app/lib/aggregate.ts` carries a header comment declaring it the only module
in the web allowed to sum `task_entries` fields (`sumTaskEntries`,
`groupByKey` and its `groupByClient`/`groupByProject`/`groupByModel`
specializations, `avgCostPerTask`, `groupUnassigned`). It never imports or
sums `work_records`. See [`aggregation.md`](aggregation.md#the-shared-fixture-guard)
and [ADR 0007](../adr/0007-web-is-a-view-layer.md).

### Session-level totals are not a plain D6 sum

`app/lib/session-aggregate.ts#groupBySession` sums `task_entries` fields
across a SESSION's rows too, but this is narrower than the D6 guarantee
above: D6 says a single task's `wall_ms`/`work_ms` is already
union-consolidated and safe to sum ACROSS TASKS for a project/client
total (`docs/architecture/aggregation.md`: "`SUM(wall_ms) GROUP BY
project` is correct"). A SESSION's rows are a different grouping — several
orchestrator runs whose intervals can genuinely overlap each other (a
background subagent from task N can still be running when task N+1
starts), which the web has no raw intervals left to re-union (ADR 0006).
So `SessionSummary.wallMs`/`workMs` (sums) are upper bounds, not exact
figures, and must never be displayed as-is: `elapsedMs` (`min(started_at)`
to `max(ended_at)`, exact and honestly labelled "elapsed") is what
`TaskDetailSheet.vue` and `sessions-without-task/index.vue` display
instead of the old `wallMs`. `waitingMs` (summed) IS exact — verified
against kankaku's own `buildSessions` (`src/domain/task-view.ts`), which
also sums per-task `waitingMs` rather than unioning it, because distinct
orchestrator turns don't overlap the way a lingering subagent can. See
the full derivation in the `session-aggregate.ts` header comment.

## Local day boundaries

Every date-ranged fetch (`useTaskEntries.fetchRange`,
`useEntriesExplorer`'s `dateStart`/`dateEnd`) and every day-bucketed chart
(`pages/index.vue`'s `chartPoints`, `pages/projects/[id].vue`'s
`trendPoints`) goes through `app/lib/local-day.ts`: local `YYYY-MM-DD`
range boundaries (from `app/lib/period.ts`, computed from the viewer's
local calendar) are converted to UTC instants before filtering
`started_at`, and a stored UTC instant is converted back to the viewer's
local day before it becomes a chart bucket key — never a raw string slice
of either. See [ADR 0026](../adr/0026-day-boundaries-are-local.md) and
`docs/contract.md` "Day boundaries are local, not UTC".

## Totals: the server sums, the browser displays

`app/composables/useTotals.ts` (`fetchTotals`/`fetchRangeTotals`) and the
pure response mapper `app/lib/totals-map.ts` are the web's client for
`POST /api/kankaku/totals` (`docs/contract.md`,
[ADR 0027](../adr/0027-totals-computed-server-side.md)) — every screen
that used to `getFullList()` a whole row set and sum it client-side
should call this instead. `totals-map.ts` carries the same D6 guard
comment as `aggregate.ts`: it only reshapes numbers the server already
summed, it never sums anything itself.

**Migrated to the totals endpoint** (with a fallback — see below):

- `pages/index.vue` (the dashboard) — KPIs and the previous-period
  comparison (`group_by: "none"`, two calls), the breakdown-by-client/
  breakdown-by-project tables (`group_by: "client"`/`"project"`), the
  agent filter's option list (`group_by: "agent"`), and the local-day
  chart (`group_by: "day"`, via `local-day.ts#buildLocalDayBoundaries`).
  "Most expensive entries" stays a lean `getList(1, 10, { sort: '-cost',
  fields: 'id,client,project,cost,work_ms,model' })` — a total was never
  the right tool for a top-10 row list. The stacked-by-client/
  stacked-by-project chart view fans out to at most 5 extra
  `group_by: "day"` calls (one per top-5 series, filtered to that one
  client/project) rather than adding a two-dimensional `group_by` to the
  server — see ADR 0027 "Alternatives considered".
- `pages/tasks/index.vue` (the tasks board) — the all-time per-task
  totals and per-task session-count chip, previously `useTaskEntries
  .fetchAll()` (no date filter — the worst offender this feature fixes)
  followed by `groupByKey`, now one `group_by: "task"` call reading
  `distinct_sessions` directly off each group.

**Left on the pre-totals path** (each already bounded or small relative
to the two screens above, or genuinely out of this change's time budget
— see this feature's final report for the per-screen reasoning, not
repeated here so this doc doesn't go stale independently of that report):
`pages/projects/[id].vue`'s KPIs/trend, `useSessions.fetchUnassignedSessions`
(the sessions-without-task queue) and `fetchSessionsForTask` (the task
detail sheet), `useUnassignedQueue.fetchUnassigned`, and
`useEntriesExplorer.listAgents`. All four still work exactly as before;
migrating them is a mechanical repeat of the `useTotals()` pattern above,
not a new design.

**Fallback (route not loaded yet)**: `useTotals.fetchTotals` throws
`TotalsRouteUnavailableError` on a `404` specifically (the owner hasn't
restarted PocketBase since this feature shipped — the hook/migration
only take effect after a restart). Every migrated call site catches that
exact error type and falls back to the previous client-side
`getFullList`+`aggregate.ts` path — silently, no error toast, same
numbers, just slower until the restart happens.

## Unassigned queue

`app/composables/useUnassignedQueue.ts`: fetches every `task_entries` row
whose `client` is the "Sin determinar" id; `app/lib/aggregate.ts#groupUnassigned`
groups them by `(legacy_client_label, repo_project)` — keyed by a JSON tuple
rather than string concatenation, since both fields routinely contain spaces
and would corrupt a naive delimiter join. Bulk reassignment
(`bulkAssign`) uses PocketBase's batch API (`$pb.createBatch()`), chunked at
50 rows (server caps a single `/api/batch` call at 100 sub-requests), with
per-chunk progress reporting. **Correction** (verified against a real
running PocketBase 0.40.4 instance while building the totals endpoint
below — see `pocketbase/seed/bulk.js`'s header comment): `/api/batch`
runs as a single DB transaction per call — one failing sub-request rolls
back the WHOLE chunk and the endpoint returns one top-level `400`, never
a `200` with independent per-item statuses. `bulkAssign`'s `catch` branch
already handles this correctly (marks the whole chunk failed); a
previous version of this doc and these composables' own comments
incorrectly described the batch endpoint as returning independent
per-request results.
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

The detail drawer's body is `app/components/entries/EntryDetailSheet.vue` —
a presentational component (`entries/index.vue` keeps the `Sheet`/
`SheetContent` wrapper, open state, and the `updateAssignment` call; the
sheet component only emits `save` and v-models `client`/`project`) built on
`app/lib/entry-detail.ts`, a pure field-to-view mapping module (no Vue, no
i18n, importable from plain Vitest — same rule as `app/lib/format.ts`):
title derivation (`session_name` → prompt → short-id fallback), status
badge tone/icon, `segments` normalisation (tolerates `null`/`{}`/an
array/a JSON string — anything that isn't a recognisable tag→ms map
becomes `[]`, which hides the section), the work/wait proportional-bar
ratio, relation resolution (empty vs. deleted vs. resolved, since an id
with no matching `expand` entry means the target was deleted, not unset),
middle-path truncation, and `safeDisplayValue` — the one place allowed to
render an arbitrary PocketBase field as text, which is also the fix for a
bug the redesign found: the old drawer rendered every field with
`String(v)`, which stringifies an object (e.g. the `segments` JSON field)
to the literal text `[object Object]`; `safeDisplayValue` pretty-prints
JSON instead. Everything not covered by a dedicated section (raw id,
`task_id`, `session_id`, `machine`, `schema`, timestamps) lives in a
collapsed-by-default "technical details" disclosure — PocketBase-internal
fields (`collectionId`/`collectionName`/`expand`) are never rendered
anywhere.

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
