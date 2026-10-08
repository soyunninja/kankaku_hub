import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { useTotals } from '../app/composables/useTotals'

afterEach(() => vi.unstubAllGlobals())

it('sends historical team dimensions and empty unassigned filters unchanged', async () => {
  const send = vi.fn(async () => ({ groups: [], total: {}, page: 1, per_page: 50, total_groups: 0, total_pages: 0 }))
  vi.stubGlobal('useNuxtApp', () => ({ $pb: { send } }))
  await useTotals().fetchTotals({ groupBy: 'department', filters: { member: '', department: 'dept-id' } })
  expect(send).toHaveBeenCalledWith('/api/kankaku/totals', {
    method: 'POST', body: { group_by: 'department', filters: { member: '', department: 'dept-id' } },
  })
})

it('keeps activity owner-gated, paginated and separate from raw details', () => {
  const source = readFileSync('app/components/team/TeamActivity.vue', 'utf8')
  expect(source).toContain('if (!isOwner.value)')
  expect(source).toContain('perPage: 25')
  expect(source).toContain('fetchRangeTotals')
  expect(source).toContain('identity(entry.member, members)')
  expect(source).toContain('identity(entry.department, departments)')
  expect(source).toContain('<option value="">')
  expect(source).not.toContain('work_records')
})
