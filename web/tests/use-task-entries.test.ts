/**
 * Unit tests for `app/composables/useTaskEntries.ts`. No `@nuxt/test-utils`
 * runtime here (see `web/vitest.config.ts`'s plain `happy-dom`
 * environment) — the composable calls the bare `useNuxtApp` identifier
 * relying on Nuxt's auto-import at build time, so a plain-vitest test
 * stubs it as a global (`vi.stubGlobal`) before importing the module,
 * the same way it would be resolved via `globalThis` at runtime.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface MockListResult {
  items: unknown[]
  totalItems: number
  totalPages: number
  page: number
  perPage: number
}

function makeMockPb(opts: { getListResult: MockListResult }) {
  const getList = vi.fn(async (_page: number, _perPage: number, _query: Record<string, unknown>) => opts.getListResult)
  const collection = vi.fn(() => ({ getList }))
  return { $pb: { collection } as unknown as { collection: typeof collection }, getList, collection }
}

describe('useTaskEntries', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not truncate when totalItems is within the fallback cap', async () => {
    const items = Array.from({ length: 3 }, (_, i) => ({ id: `e${i}` }))
    const mock = makeMockPb({ getListResult: { items, totalItems: 3, totalPages: 1, page: 1, perPage: 2000 } })
    vi.stubGlobal('useNuxtApp', () => ({ $pb: mock.$pb }))

    const { useTaskEntries } = await import('../app/composables/useTaskEntries')
    const { fetchRange } = useTaskEntries()

    const result = await fetchRange({ start: '2026-01-01', end: '2026-01-31' })

    expect(result.entries).toBe(items)
    expect(result.truncated).toBe(false)
  })

  it('reports truncated: true and caps the request at FALLBACK_SCAN_CAP (2000) when more rows exist', async () => {
    const items = Array.from({ length: 2000 }, (_, i) => ({ id: `e${i}` }))
    const mock = makeMockPb({ getListResult: { items, totalItems: 5000, totalPages: 3, page: 1, perPage: 2000 } })
    vi.stubGlobal('useNuxtApp', () => ({ $pb: mock.$pb }))

    const { useTaskEntries } = await import('../app/composables/useTaskEntries')
    const { fetchRange } = useTaskEntries()

    const result = await fetchRange({ start: '2026-01-01', end: '2026-01-31' })

    expect(result.truncated).toBe(true)
    expect(result.entries).toHaveLength(2000)
    // Uses `getList(1, FALLBACK_SCAN_CAP, ...)`, NOT `getFullList` — the
    // PocketBase SDK's `getFullList` pages until exhausted regardless of
    // any `perPage` passed in its options (confirmed by reading the SDK's
    // `_getFullList` implementation), so it can never be used as a real
    // cap on total rows. `getList` with an explicit page size is the only
    // way to hard-stop at N.
    expect(mock.getList).toHaveBeenCalledWith(1, 2000, expect.objectContaining({
      sort: '-started_at',
    }))
  })

  it('keeps `prompt` in the fetched fields (projects/[id].vue\'s "top prompts" table reads e.prompt directly off fetchRange results)', async () => {
    const mock = makeMockPb({ getListResult: { items: [], totalItems: 0, totalPages: 0, page: 1, perPage: 2000 } })
    vi.stubGlobal('useNuxtApp', () => ({ $pb: mock.$pb }))

    const { useTaskEntries } = await import('../app/composables/useTaskEntries')
    const { fetchRange } = useTaskEntries()

    await fetchRange({ start: '2026-01-01', end: '2026-01-31' })

    const query = mock.getList.mock.calls[0]![2] as { fields: string }
    expect(query.fields.split(',')).toContain('prompt')
  })

  it('builds the started_at range filter (converted to UTC) plus optional project/client filters', async () => {
    const mock = makeMockPb({ getListResult: { items: [], totalItems: 0, totalPages: 0, page: 1, perPage: 2000 } })
    vi.stubGlobal('useNuxtApp', () => ({ $pb: mock.$pb }))

    const { useTaskEntries } = await import('../app/composables/useTaskEntries')
    const { fetchRange } = useTaskEntries()

    await fetchRange({ start: '2026-01-01', end: '2026-01-01' }, { project: 'proj-1', client: 'client-1' })

    const query = mock.getList.mock.calls[0]![2] as { filter: string }
    expect(query.filter).toContain('started_at >=')
    expect(query.filter).toContain('started_at <=')
    expect(query.filter).toContain('project = "proj-1"')
    expect(query.filter).toContain('client = "client-1"')
  })

  it('no longer exports fetchAll — app/pages/tasks/index.vue migrated its totals-fallback path onto fetchRange', async () => {
    const mock = makeMockPb({ getListResult: { items: [], totalItems: 0, totalPages: 0, page: 1, perPage: 2000 } })
    vi.stubGlobal('useNuxtApp', () => ({ $pb: mock.$pb }))

    const { useTaskEntries } = await import('../app/composables/useTaskEntries')
    const composable = useTaskEntries()

    expect('fetchAll' in composable).toBe(false)
  })
})
