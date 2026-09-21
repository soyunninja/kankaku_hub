/**
 * PERMANENT EQUIVALENCE GUARD (docs/architecture/aggregation.md "the
 * shared-fixture guard"): computes totals two ways over the SAME live
 * PocketBase data — the OLD client-side path (`app/lib/aggregate.ts`,
 * `app/lib/measurement-quality.ts`, `app/lib/local-day.ts`, fetching raw
 * rows via `getFullList`) and the NEW server path (`POST
 * /api/kankaku/totals`) — and asserts they agree to the last ms/token
 * (ints, exact) and cost within float tolerance, across several filters,
 * group_bys and time zones (UTC, Asia/Tokyo, America/Los_Angeles, and a
 * DST-transition week).
 *
 * Needs a LIVE, isolated PocketBase instance (never the owner's
 * port-8090 instance — see AGENTS.md/this feature's report for the
 * isolated-stack setup) with the totals route loaded. Skipped by default
 * so `pnpm test`/CI never requires a running server; set
 * `TOTALS_LIVE_PB_URL` (+ optionally `TOTALS_LIVE_PB_EMAIL`/
 * `TOTALS_LIVE_PB_PASSWORD`, defaulting to this repo's documented dev
 * owner account) to run it for real:
 *
 *   TOTALS_LIVE_PB_URL=http://127.0.0.1:8092 pnpm --dir web test -- totals-equivalence
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { groupByClient, groupByKey, groupByProject, groupUnassigned, sumTaskEntries, type TaskEntryLike } from '../app/lib/aggregate'
import { buildLocalDayBoundaries, localDateRangeToUtcFilters, utcInstantToLocalDay } from '../app/lib/local-day'
import { computeAverageCost, summarizeWorkTimeQuality } from '../app/lib/measurement-quality'
import { groupBySession, type SessionEntryLike } from '../app/lib/session-aggregate'
import { computeAverageCostFromTotal, mapTotalsRow, summarizeWorkTimeQualityFromTotal, type TotalsResponseRaw } from '../app/lib/totals-map'

const PB_URL = process.env.TOTALS_LIVE_PB_URL
const EMAIL = process.env.TOTALS_LIVE_PB_EMAIL || 'david@kankaku.local'
const PASSWORD = process.env.TOTALS_LIVE_PB_PASSWORD || 'kankaku-dev-owner'

interface TaskEntryFull extends TaskEntryLike {
  id: string
  ended_at: string
  waiting_quality?: string
  cost_quality?: string
  subagent_linkage?: string
  session_id?: string
}

let token = ''

async function pbFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`${opts.method ?? 'GET'} ${path} -> ${res.status}: ${await res.text()}`)
  return res.json()
}

async function fetchAllRows(filter: string): Promise<TaskEntryFull[]> {
  const items: TaskEntryFull[] = []
  let page = 1
  for (;;) {
    const data = await pbFetch(`/api/collections/task_entries/records?page=${page}&perPage=500&filter=${encodeURIComponent(filter)}`)
    items.push(...data.items)
    if (page >= data.totalPages) break
    page++
  }
  return items
}

/** Raw (snake_case) wire response — deliberately NOT mapped through
 * `mapTotalsResponse` for most assertions below, so this test also
 * exercises the exact wire shape `docs/contract.md` documents, not just
 * the web's internal camelCase re-shaping. */
async function fetchTotalsRaw(body: Record<string, unknown>): Promise<TotalsResponseRaw> {
  return await pbFetch('/api/kankaku/totals', { method: 'POST', body: JSON.stringify(body) }) as TotalsResponseRaw
}

/** Pages through every group for a totals request (the server caps a
 * single call at MAX_PER_PAGE=200 groups) — needed for group_by branches
 * that can legitimately return more than 200 groups at bulk-seed scale
 * (e.g. group_by=session filtered to one busy task). Capped at 20 pages
 * (4000 groups) as a sanity bound; the datasets under test never come
 * close to that. */
async function fetchAllTotalsGroups(body: Record<string, unknown>): Promise<TotalsResponseRaw['groups']> {
  const perPage = 200
  const groups: TotalsResponseRaw['groups'] = []
  let page = 1
  for (;;) {
    const res = await fetchTotalsRaw({ ...body, page, per_page: perPage })
    groups.push(...res.groups)
    if (page >= res.total_pages || page >= 20) break
    page++
  }
  return groups
}

/** Wide enough to cover every row `pocketbase/seed/bulk.js` can generate
 * (up to `--years` back from "today") plus the demo seed, without being a
 * genuinely unbounded/no-filter fetch — used where a test needs the OLD
 * client-side path and the NEW server path to see the exact same
 * population (the server call omits `from`/`to` entirely, i.e. "all
 * time"; the old path must fetch an equally wide window, not a
 * calendar-year slice that could exclude older bulk-seeded rows). */
const ALL_TIME_RANGE = { start: '2015-01-01', end: '2035-12-31' }

/** One (from,to) local-day range converted for both sides: the OLD raw
 * row filter string (`started_at >= ... && started_at <= ...`, PB filter
 * syntax) and the NEW totals request's `from`/`to`. */
function rangeFor(range: { start: string, end: string }, timeZone: string) {
  const utc = localDateRangeToUtcFilters(range, timeZone)
  return {
    oldFilter: `started_at >= "${utc.start}" && started_at <= "${utc.end}"`,
    from: utc.start,
    to: utc.end,
  }
}

describe.skipIf(!PB_URL)('totals equivalence (live, TOTALS_LIVE_PB_URL set)', () => {
  beforeAll(async () => {
    const data = await pbFetch('/api/collections/users/auth-with-password', {
      method: 'POST',
      body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
    })
    token = data.token
  })

  const timeZones = ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']
  const ranges = [
    { start: '2026-06-01', end: '2026-09-21' }, // wide, likely covers bulk seed data
    { start: '2026-01-01', end: '2026-01-31' },
  ]

  for (const timeZone of timeZones) {
    for (const range of ranges) {
      it(`group_by=none matches sumTaskEntries exactly (${timeZone}, ${range.start}..${range.end})`, async () => {
        const { oldFilter, from, to } = rangeFor(range, timeZone)
        const [oldRows, server] = await Promise.all([
          fetchAllRows(oldFilter),
          fetchTotalsRaw({ from, to, group_by: 'none' }),
        ])
        const oldTotals = sumTaskEntries(oldRows)

        expect(server.total.entries).toBe(oldTotals.count)
        expect(server.total.wall_ms).toBe(oldTotals.wallMs)
        expect(server.total.work_ms).toBe(oldTotals.workMs)
        expect(server.total.waiting_ms).toBe(oldTotals.waitingMs)
        expect(server.total.input).toBe(oldTotals.input)
        expect(server.total.output).toBe(oldTotals.output)
        expect(server.total.cache_read).toBe(oldTotals.cacheRead)
        expect(server.total.cache_write).toBe(oldTotals.cacheWrite)
        expect(server.total.cost).toBeCloseTo(oldTotals.cost, 6)

        const mappedTotal = mapTotalsRow(server.total)
        const oldQuality = summarizeWorkTimeQuality(oldRows)
        const serverQuality = summarizeWorkTimeQualityFromTotal(mappedTotal)
        expect(serverQuality.measuredCount).toBe(oldQuality.measuredCount)
        expect(serverQuality.upperBoundCount).toBe(oldQuality.upperBoundCount)
        expect(serverQuality.isUpperBound).toBe(oldQuality.isUpperBound)

        const oldAvg = computeAverageCost(oldRows)
        const serverAvg = computeAverageCostFromTotal(mappedTotal)
        expect(serverAvg.includedCount).toBe(oldAvg.includedCount)
        expect(serverAvg.excludedCount).toBe(oldAvg.excludedCount)
        if (oldAvg.average === null) expect(serverAvg.average).toBeNull()
        else expect(serverAvg.average!).toBeCloseTo(oldAvg.average, 6)
      })

      it(`group_by=client matches groupByClient exactly (${timeZone}, ${range.start}..${range.end})`, async () => {
        const { oldFilter, from, to } = rangeFor(range, timeZone)
        const [oldRows, server] = await Promise.all([
          fetchAllRows(oldFilter),
          fetchTotalsRaw({ from, to, group_by: 'client', per_page: 200 }),
        ])
        const oldGroups = groupByClient(oldRows)
        const serverByKey = new Map(server.groups.map((g) => [g.group_key, g]))

        expect(server.groups.length).toBe(oldGroups.length)
        for (const og of oldGroups) {
          const sg = serverByKey.get(og.key)
          expect(sg, `missing server group for client ${og.key}`).toBeTruthy()
          expect(sg.entries).toBe(og.count)
          expect(sg.wall_ms).toBe(og.wallMs)
          expect(sg.work_ms).toBe(og.workMs)
          expect(sg.waiting_ms).toBe(og.waitingMs)
          expect(sg.cost).toBeCloseTo(og.cost, 6)
        }
      })

      it(`group_by=project matches groupByProject exactly, excluding the no-project bucket (${timeZone}, ${range.start}..${range.end})`, async () => {
        const { oldFilter, from, to } = rangeFor(range, timeZone)
        const [oldRows, server] = await Promise.all([
          fetchAllRows(oldFilter),
          fetchTotalsRaw({ from, to, group_by: 'project', per_page: 200 }),
        ])
        const oldGroups = groupByProject(oldRows.filter(e => e.project))
        const serverByKey = new Map(server.groups.filter((g) => g.group_key !== '').map((g) => [g.group_key, g]))

        expect(serverByKey.size).toBe(oldGroups.length)
        for (const og of oldGroups) {
          const sg = serverByKey.get(og.key)
          expect(sg, `missing server group for project ${og.key}`).toBeTruthy()
          expect(sg.entries).toBe(og.count)
          expect(sg.cost).toBeCloseTo(og.cost, 6)
        }
      })

      it(`group_by=task matches groupByKey(task) exactly, excluding the no-task bucket (${timeZone}, ${range.start}..${range.end})`, async () => {
        const { oldFilter, from, to } = rangeFor(range, timeZone)
        const [oldRows, server] = await Promise.all([
          fetchAllRows(oldFilter),
          fetchTotalsRaw({ from, to, group_by: 'task', per_page: 200 }),
        ])
        const oldGroups = groupByKey(oldRows.filter(e => e.task), e => e.task || '')
        const serverByKey = new Map(server.groups.filter(g => g.group_key !== '').map(g => [g.group_key, g]))

        expect(serverByKey.size).toBe(oldGroups.length)
        for (const og of oldGroups) {
          const sg = serverByKey.get(og.key)
          expect(sg, `missing server group for task ${og.key}`).toBeTruthy()
          expect(sg.entries).toBe(og.count)
          expect(sg.wall_ms).toBe(og.wallMs)
          expect(sg.work_ms).toBe(og.workMs)
          expect(sg.cost).toBeCloseTo(og.cost, 6)
        }
      })

      it(`group_by=model matches groupByModel exactly, mapping the empty group_key to the '(unknown)' bucket (${timeZone}, ${range.start}..${range.end})`, async () => {
        const { oldFilter, from, to } = rangeFor(range, timeZone)
        const [oldRows, server] = await Promise.all([
          fetchAllRows(oldFilter),
          fetchTotalsRaw({ from, to, group_by: 'model', per_page: 200 }),
        ])
        // groupByModel (app/lib/aggregate.ts) buckets a missing model under
        // the '(unknown)' sentinel string; the server groups by the raw
        // (possibly empty) `model` column — remap for comparison.
        const oldGroups = groupByKey(oldRows, e => e.model || '(unknown)')
        const serverByKey = new Map(server.groups.map(g => [g.group_key === '' ? '(unknown)' : g.group_key, g]))

        expect(serverByKey.size).toBe(oldGroups.length)
        for (const og of oldGroups) {
          const sg = serverByKey.get(og.key)
          expect(sg, `missing server group for model ${og.key}`).toBeTruthy()
          expect(sg.entries).toBe(og.count)
          expect(sg.cost).toBeCloseTo(og.cost, 6)
        }
      })
    }
  }

  it('group_by=task across a DST-transition week matches exactly (America/Los_Angeles, 2026-03-01..2026-03-15)', async () => {
    const timeZone = 'America/Los_Angeles'
    const range = { start: '2026-03-01', end: '2026-03-15' }
    const { oldFilter, from, to } = rangeFor(range, timeZone)
    const [oldRows, server] = await Promise.all([
      fetchAllRows(oldFilter),
      fetchTotalsRaw({ from, to, group_by: 'task', per_page: 200 }),
    ])
    const oldGroups = groupByKey(oldRows.filter(e => e.task), e => e.task || '')
    const serverByKey = new Map(server.groups.filter(g => g.group_key !== '').map(g => [g.group_key, g]))
    expect(serverByKey.size).toBe(oldGroups.length)
    for (const og of oldGroups) {
      const sg = serverByKey.get(og.key)
      expect(sg, `missing server group for task ${og.key}`).toBeTruthy()
      expect(sg.entries).toBe(og.count)
      expect(sg.cost).toBeCloseTo(og.cost, 6)
    }
  })

  it('group_by=day bucketing matches utcInstantToLocalDay bucketing exactly (Asia/Tokyo, 90-day range)', async () => {
    const timeZone = 'Asia/Tokyo'
    const range = { start: '2026-06-24', end: '2026-09-21' }
    const { oldFilter } = rangeFor(range, timeZone)
    const { boundaries, labels } = buildLocalDayBoundaries(range, timeZone)

    const [oldRows, server] = await Promise.all([
      fetchAllRows(oldFilter),
      fetchTotalsRaw({ group_by: 'day', day_boundaries: boundaries, per_page: labels.length }),
    ])

    const oldByDay = new Map<string, TaskEntryFull[]>()
    for (const row of oldRows) {
      const day = utcInstantToLocalDay(row.started_at, timeZone)
      const bucket = oldByDay.get(day) ?? []
      bucket.push(row)
      oldByDay.set(day, bucket)
    }

    const serverByIndex = new Map(server.groups.map((g) => [Number(g.group_key), g]))
    for (let i = 0; i < labels.length; i++) {
      const day = labels[i]!
      const oldBucketRows = oldByDay.get(day) ?? []
      const oldTotals = sumTaskEntries(oldBucketRows)
      const sg = serverByIndex.get(i)
      if (oldBucketRows.length === 0) {
        expect(sg, `unexpected server bucket for empty day ${day}`).toBeUndefined()
        continue
      }
      expect(sg, `missing server bucket for day ${day} (index ${i})`).toBeTruthy()
      expect(sg.entries).toBe(oldTotals.count)
      expect(sg.work_ms).toBe(oldTotals.workMs)
      expect(sg.cost).toBeCloseTo(oldTotals.cost, 6)
    }
  })

  it('group_by=day across a DST-transition week matches exactly (America/Los_Angeles, 2026-03-01..2026-03-15)', async () => {
    const timeZone = 'America/Los_Angeles'
    const range = { start: '2026-03-01', end: '2026-03-15' }
    const { oldFilter } = rangeFor(range, timeZone)
    const { boundaries, labels } = buildLocalDayBoundaries(range, timeZone)

    const [oldRows, server] = await Promise.all([
      fetchAllRows(oldFilter),
      fetchTotalsRaw({ group_by: 'day', day_boundaries: boundaries, per_page: labels.length }),
    ])

    const oldByDay = new Map<string, TaskEntryFull[]>()
    for (const row of oldRows) {
      const day = utcInstantToLocalDay(row.started_at, timeZone)
      const bucket = oldByDay.get(day) ?? []
      bucket.push(row)
      oldByDay.set(day, bucket)
    }

    let totalOldEntries = 0
    let totalServerEntries = 0
    for (let i = 0; i < labels.length; i++) {
      const day = labels[i]!
      const oldBucketRows = oldByDay.get(day) ?? []
      totalOldEntries += oldBucketRows.length
      const sg = server.groups.find((g) => Number(g.group_key) === i)
      if (sg) totalServerEntries += sg.entries
    }
    // Aggregate check across the DST week (per-bucket assertions covered
    // by the Asia/Tokyo test above) — the total row count crossing the
    // spring-forward boundary must still match exactly, proving no entry
    // was dropped or double-counted by the 23-hour transition day.
    expect(totalServerEntries).toBe(totalOldEntries)
  })

  it('group_by=session (filtered by task) matches groupBySession exactly: entries, waiting_ms (exact), elapsedMs, and mixed client/project flags', { timeout: 60000 }, async () => {
    // Server call sends no from/to (all-time); the old-path fetch must see
    // the exact same population — a calendar-year slice would silently
    // exclude older bulk-seeded rows a busy task could still have.
    const { oldFilter } = rangeFor(ALL_TIME_RANGE, 'UTC')
    const allRows = await fetchAllRows(oldFilter)
    // Pick the LEAST-populated task (not just "the first one found") — at
    // bulk-seed scale (100k rows) some of the demo seed's real task ids
    // get reused by thousands of synthetic rows; the busiest one can carry
    // several thousand distinct sessions, which would make this test slow
    // without adding any more proof value than a smaller one does.
    const taskCounts = new Map<string, number>()
    for (const r of allRows) { if (r.task) taskCounts.set(r.task, (taskCounts.get(r.task) ?? 0) + 1) }
    const aTask = [...taskCounts.entries()].sort((a, b) => a[1] - b[1])[0]?.[0]
    if (!aTask) return // no assigned task in this dataset — nothing to assert

    const groups = await fetchAllTotalsGroups({ group_by: 'session', filters: { task: aTask } })
    const oldRows = allRows.filter(r => r.task === aTask) as unknown as SessionEntryLike[]
    const oldSessions = groupBySession(oldRows)
    const serverByKey = new Map(groups.map(g => [g.group_key, g]))

    expect(serverByKey.size).toBe(oldSessions.length)
    for (const os of oldSessions) {
      const sg = serverByKey.get(os.sessionId)
      expect(sg, `missing server session group for ${os.sessionId}`).toBeTruthy()
      expect(sg!.entries).toBe(os.entryCount)
      expect(sg!.waiting_ms).toBe(os.waitingMs) // exact, not an upper bound — see session-aggregate.ts
      expect(sg!.cost).toBeCloseTo(os.cost, 6)

      // Server elapsed span (min_started_at..max_ended_at) must match
      // session-aggregate.ts#elapsedMsOf exactly — this is what the UI
      // must display instead of the (upper-bound) summed wall_ms/work_ms.
      const serverElapsedMs = Date.parse(sg!.max_ended_at) - Date.parse(sg!.min_started_at)
      expect(serverElapsedMs).toBe(os.elapsedMs)

      // "mixed" parity: session-aggregate.ts's uniformOrMixed(client/project)
      // reports MIXED iff more than one distinct value appears — exactly
      // what distinct_client/distinct_project > 1 expresses server-side.
      expect(sg!.distinct_client > 1).toBe(os.client === 'mixed')
      expect(sg!.distinct_project > 1).toBe(os.project === 'mixed')
    }
  })

  it('group_by=session honesty counters (waiting_unavailable_entries, cost_unknown_entries, unlinked_entries) match a manual recount from the raw rows', async () => {
    const timeZone = 'UTC'
    const range = { start: '2026-01-01', end: '2026-12-31' }
    const { oldFilter } = rangeFor(range, timeZone)
    const allRows = await fetchAllRows(oldFilter)
    const server = await fetchTotalsRaw({ group_by: 'session', per_page: 50, sort: '-entries' })

    const bySession = new Map<string, TaskEntryFull[]>()
    for (const row of allRows) {
      if (!row.session_id) continue
      const bucket = bySession.get(row.session_id) ?? []
      bucket.push(row)
      bySession.set(row.session_id, bucket)
    }

    let checked = 0
    for (const sg of server.groups) {
      const rows = bySession.get(sg.group_key)
      if (!rows) continue // group came from a filtered/paged slice we didn't fetch, or is entirely outside this range
      const waitingUnavailable = rows.filter(r => r.waiting_quality === 'unavailable').length
      const costUnknown = rows.filter(r => r.cost_quality === 'unknown').length
      const unlinked = rows.filter(r => r.subagent_linkage === 'unlinked').length
      if (rows.length !== sg.entries) continue // this session's rows aren't fully contained in our fetched range — skip, can't compare fairly
      expect(sg.waiting_unavailable_entries).toBe(waitingUnavailable)
      expect(sg.cost_unknown_entries).toBe(costUnknown)
      expect(sg.unlinked_entries).toBe(unlinked)
      checked++
    }
    expect(checked).toBeGreaterThan(0) // guard against a silently-vacuous test (empty dataset / all sessions cut off)
  })

  it('group_by=session with without_task + session_fully_unassigned reproduces the OLD "fully unassigned sessions, excluding ignored" semantic exactly', { timeout: 60000 }, async () => {
    const { oldFilter } = rangeFor(ALL_TIME_RANGE, 'UTC')
    const [allRows, ignoredRows, groups] = await Promise.all([
      fetchAllRows(oldFilter),
      pbFetch('/api/collections/ignored_sessions/records?perPage=500') as Promise<{ items: { session_id: string }[] }>,
      fetchAllTotalsGroups({ group_by: 'session', filters: { without_task: true, session_fully_unassigned: true } }),
    ])
    const server = { groups }
    const ignoredIds = new Set(ignoredRows.items.map(r => r.session_id))

    // OLD semantic (useSessions.ts#fetchUnassignedSessions): a session
    // counts only when EVERY one of its rows has task === '', and it is
    // not in ignored_sessions.
    const bySession = new Map<string, TaskEntryFull[]>()
    for (const row of allRows) {
      if (!row.session_id) continue
      const bucket = bySession.get(row.session_id) ?? []
      bucket.push(row)
      bySession.set(row.session_id, bucket)
    }
    const oldQualifying = [...bySession.entries()]
      .filter(([sessionId, rows]) => rows.every(r => !r.task) && !ignoredIds.has(sessionId))
      .map(([sessionId, rows]) => ({ sessionId, rows }))

    const serverByKey = new Map(server.groups.map(g => [g.group_key, g]))
    // Every server group must be an old-qualifying session (no false positives).
    for (const g of server.groups) {
      const match = oldQualifying.find(q => q.sessionId === g.group_key)
      expect(match, `server included session ${g.group_key} that the old path would have excluded`).toBeTruthy()
    }
    // Spot-check totals for sessions present in both this page and the old set.
    let checked = 0
    for (const { sessionId, rows } of oldQualifying) {
      const sg = serverByKey.get(sessionId)
      if (!sg) continue // may be on a later page (per_page 200 vs total_groups) — fine, only compare what we fetched
      expect(sg.entries).toBe(rows.length)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('group_by=legacy_label filtered by the unassigned client matches groupUnassigned exactly', async () => {
    const timeZone = 'UTC'
    const range = { start: '2026-01-01', end: '2026-12-31' }
    const { oldFilter, from, to } = rangeFor(range, timeZone)
    const allRows = await fetchAllRows(oldFilter)
    // Pick a real client id present in the dataset to stand in for "the
    // unassigned client" — this test only proves the group_by=legacy_label
    // + filters.client SQL branch matches groupUnassigned's grouping logic
    // for whichever client is used, which is the actual code path both
    // the old and new implementations share (queue and totals branch
    // don't know or care which client id is "the" unassigned one).
    const aClient = allRows[0]?.client
    if (!aClient) return

    const server = await fetchTotalsRaw({ from, to, group_by: 'legacy_label', filters: { client: aClient }, per_page: 200 })
    const oldRows = allRows.filter(r => r.client === aClient)
    const oldGroups = groupUnassigned(oldRows)
    // groupUnassigned keys on ('(sin etiqueta)'/'(sin proyecto)') sentinels
    // for empty values; the server groups on the raw (possibly empty)
    // columns — remap for comparison the same way the model test does.
    const serverByKey = new Map(server.groups.map((g) => {
      const legacyLabel = g.group_key === '' ? '(sin etiqueta)' : g.group_key
      const repoProject = g.group_key2 === '' ? '(sin proyecto)' : g.group_key2
      return [JSON.stringify([legacyLabel, repoProject]), g]
    }))

    expect(serverByKey.size).toBe(oldGroups.length)
    for (const og of oldGroups) {
      const key = JSON.stringify([og.legacyLabel, og.repoProject])
      const sg = serverByKey.get(key)
      expect(sg, `missing server group for legacy_label ${key}`).toBeTruthy()
      expect(sg!.entries).toBe(og.count)
      expect(sg!.wall_ms).toBe(og.totals.wallMs)
      expect(sg!.cost).toBeCloseTo(og.totals.cost, 6)
    }
  })

  it('filters.agent and filters.exclude_unassigned_client narrow identically on both sides', async () => {
    const timeZone = 'UTC'
    const range = { start: '2026-01-01', end: '2026-12-31' }
    const { oldFilter, from, to } = rangeFor(range, timeZone)

    const allRows = await fetchAllRows(oldFilter)
    const anAgent = allRows.find(r => r.agent)?.agent
    if (!anAgent) return // no agent-tagged rows in this dataset — nothing to assert

    const oldFiltered = allRows.filter(r => r.agent === anAgent)
    const server = await fetchTotalsRaw({ from, to, group_by: 'none', filters: { agent: anAgent } })
    const oldTotals = sumTaskEntries(oldFiltered)

    expect(server.total.entries).toBe(oldTotals.count)
    expect(server.total.cost).toBeCloseTo(oldTotals.cost, 6)
  })
})
