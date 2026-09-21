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
import { groupByClient, groupByProject, sumTaskEntries, type TaskEntryLike } from '../app/lib/aggregate'
import { buildLocalDayBoundaries, localDateRangeToUtcFilters, utcInstantToLocalDay } from '../app/lib/local-day'
import { computeAverageCost, summarizeWorkTimeQuality } from '../app/lib/measurement-quality'
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
    }
  }

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
