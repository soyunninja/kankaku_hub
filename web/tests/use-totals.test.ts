import { afterEach, expect, it, vi } from 'vitest'
import { useTotals } from '../app/composables/useTotals'

afterEach(() => vi.unstubAllGlobals())

function rawResponse(ignored_sessions_included?: boolean) {
  const total = {
    entries: 0, wall_ms: 0, work_ms: 0, waiting_ms: 0, input: 0, output: 0,
    cache_read: 0, cache_write: 0, cost: 0, waiting_unavailable_entries: 0,
    cost_unknown_entries: 0, cost_estimated_entries: 0, cost_known_entries: 0,
    cost_known_sum: 0, unlinked_entries: 0, distinct_sessions: 0,
  }
  return {
    groups: [], total, page: 1, per_page: 200, total_groups: 0, total_pages: 0,
    ...(ignored_sessions_included === undefined ? {} : { ignored_sessions_included }),
  }
}

it('serializes the opt-in ignored-session flag and maps explicit server acknowledgement', async () => {
  const send = vi.fn(async () => rawResponse(true))
  vi.stubGlobal('useNuxtApp', () => ({ $pb: { send } }))

  const result = await useTotals().fetchTotals({
    filters: { member: 'member-1', project: 'project-1' },
    groupBy: 'session', includeIgnoredSessions: true, page: 1, perPage: 200,
  })

  expect(send).toHaveBeenCalledWith('/api/kankaku/totals', {
    method: 'POST',
    body: {
      filters: { member: 'member-1', project: 'project-1' },
      group_by: 'session', include_ignored_sessions: true, page: 1, per_page: 200,
    },
  })
  expect(result.ignoredSessionsIncluded).toBe(true)
})

it('leaves the new request and response capability absent for existing callers and older servers', async () => {
  const send = vi.fn(async () => rawResponse())
  vi.stubGlobal('useNuxtApp', () => ({ $pb: { send } }))

  const result = await useTotals().fetchTotals({ groupBy: 'session' })

  expect(send).toHaveBeenCalledWith('/api/kankaku/totals', { method: 'POST', body: { group_by: 'session' } })
  expect(result.ignoredSessionsIncluded).toBeUndefined()
})
