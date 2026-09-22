/**
 * Unit tests for `app/lib/entries-session-filters.ts` — the pure mapping
 * between the Entries screen's filter state and what
 * `POST /api/kankaku/totals` can honor (`pocketbase/pb_hooks/lib/totals-query.js`'s
 * `FILTER_KEYS` whitelist).
 */
import { describe, expect, it } from 'vitest'
import { entriesDateRangeToTotalsRange, splitEntriesFiltersForTotals } from '../app/lib/entries-session-filters'
import { LEGACY_AGENT } from '../app/lib/measurement-quality'
import type { EntriesExplorerFilters } from '../app/composables/useEntriesExplorer'

describe('splitEntriesFiltersForTotals', () => {
  it('returns an empty groupable object and no unsupported keys when no filter is set', () => {
    const result = splitEntriesFiltersForTotals({})
    expect(result.groupable).toEqual({})
    expect(result.unsupported).toEqual([])
  })

  it('carries client/project/task/status/machine/session_id straight through', () => {
    const filters: EntriesExplorerFilters = {
      client: 'client-a',
      project: 'project-a',
      task: 'task-a',
      status: 'completed',
      machine: 'mac-mini',
      session_id: 'sess-1',
    }
    const result = splitEntriesFiltersForTotals(filters)
    expect(result.groupable).toEqual({
      client: 'client-a',
      project: 'project-a',
      task: 'task-a',
      status: 'completed',
      machine: 'mac-mini',
      session_id: 'sess-1',
    })
    expect(result.unsupported).toEqual([])
  })

  it('maps the LEGACY_AGENT sentinel to an empty-string agent filter, same as buildFilter', () => {
    const result = splitEntriesFiltersForTotals({ agent: LEGACY_AGENT })
    expect(result.groupable).toEqual({ agent: '' })
  })

  it('passes a real agent slug through unchanged', () => {
    const result = splitEntriesFiltersForTotals({ agent: 'pi' })
    expect(result.groupable).toEqual({ agent: 'pi' })
  })

  it('flags model, quality and search as unsupported and excludes them from groupable', () => {
    const filters: EntriesExplorerFilters = {
      model: 'gpt-6',
      quality: 'waitingUnavailable',
      search: 'refactor',
    }
    const result = splitEntriesFiltersForTotals(filters)
    expect(result.groupable).toEqual({})
    expect(result.unsupported.sort()).toEqual(['model', 'quality', 'search'])
  })

  it('never includes dateStart/dateEnd in either groupable or unsupported (handled separately as from/to)', () => {
    const result = splitEntriesFiltersForTotals({ dateStart: '2026-01-01', dateEnd: '2026-01-31' })
    expect(result.groupable).toEqual({})
    expect(result.unsupported).toEqual([])
  })
})

describe('entriesDateRangeToTotalsRange', () => {
  it('returns {} when neither dateStart nor dateEnd is set', () => {
    expect(entriesDateRangeToTotalsRange({})).toEqual({})
  })

  it('converts dateStart alone to a UTC "from" instant at local midnight', () => {
    const result = entriesDateRangeToTotalsRange({ dateStart: '2026-01-15' })
    expect(result.to).toBeUndefined()
    expect(typeof result.from).toBe('string')
    // Same shape toPbDateFilter always produces: space separator, Z suffix.
    expect(result.from).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('converts dateEnd alone to a UTC "to" instant at the local end of day', () => {
    const result = entriesDateRangeToTotalsRange({ dateEnd: '2026-01-15' })
    expect(result.from).toBeUndefined()
    expect(typeof result.to).toBe('string')
    expect(result.to).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('converts both bounds when both are set', () => {
    const result = entriesDateRangeToTotalsRange({ dateStart: '2026-01-01', dateEnd: '2026-01-31' })
    expect(result.from).toBeDefined()
    expect(result.to).toBeDefined()
    expect(result.from! < result.to!).toBe(true)
  })
})
