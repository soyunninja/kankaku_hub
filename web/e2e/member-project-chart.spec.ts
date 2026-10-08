import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('member detail shows member-scoped daily project totals independently of the list view', async ({ page }) => {
  const requests: { group_by?: string, filters?: { member?: string, project?: string }, day_boundaries?: string[] }[] = []
  const projectIds = ['knownproject001', 'unknownproject01', '']
  const workByProject: Record<string, number> = { knownproject001: 3_600_000, unknownproject01: 3_600_000, '': 3_600_000 }
  const row = (group_key: string, work_ms: number) => ({
    group_key, group_key2: '', session_name: '', min_started_at: '', max_ended_at: '',
    entries: 1, wall_ms: work_ms, work_ms, waiting_ms: 0, input: 0, output: 0, cache_read: 0, cache_write: 0,
    cost: 0, waiting_unavailable_entries: 0, cost_unknown_entries: 0, cost_estimated_entries: 0,
    cost_known_entries: 1, cost_known_sum: 0, unlinked_entries: 0, distinct_sessions: 1,
    distinct_client: 1, sample_client: 'clientchart001', distinct_project: 1, sample_project: group_key,
    distinct_task: 1, sample_task: 'task', machine: '', distinct_agent: 1, sample_agent: 'pi',
  })
  const resultList = (items: unknown[]) => ({ page: 1, perPage: 200, totalPages: 1, totalItems: items.length, items })

  await page.addInitScript(() => localStorage.setItem('kankaku-locale', 'en'))
  await login(page)
  await page.route('**/api/collections/**/records**', async (route) => {
    const collection = new URL(route.request().url()).pathname.split('/')[3]
    const records: Record<string, unknown[]> = {
      departments: [],
      team_members: [{ id: 'memberchart001', name: 'Chart member', department: '', active: true }],
      machines: [],
      clients: [{ id: 'clientchart001', name: 'Chart client', unassigned: false, active: true }],
      projects: [{ id: 'knownproject001', name: 'Known project', client: 'clientchart001', active: true }],
    }
    await route.fulfill({ json: resultList(records[collection!] ?? []) })
  })
  await page.route('**/api/kankaku/totals', async (route) => {
    const body = route.request().postDataJSON()
    requests.push(body)
    let groups = []
    if (body.group_by === 'project') {
      groups = projectIds.map(project => row(project, workByProject[project]!))
    }
    else if (body.group_by === 'day') {
      const project = body.filters?.project
      groups = [row('0', project ? workByProject[project] ?? 0 : 3 * 3_600_000)]
    }
    await route.fulfill({ json: {
      groups, total: row('', 3 * 3_600_000), total_groups: groups.length,
      page: body.page ?? 1, per_page: body.per_page ?? 200, total_pages: groups.length ? 1 : 0,
    } })
  })

  await page.goto('/team/memberchart001?dateStart=2024-01-01&dateEnd=2024-01-01')
  const chart = page.getByTestId('member-project-work-chart')
  await expect(chart.getByRole('img', { name: /^2024-01-01:/ })).toHaveAttribute('aria-label', /Known project: 1h, Unknown project \(unknownproject01\): 1h, Others: 1h$/)
  const requestsForMember = requests.filter(request => request.group_by === 'day')
  expect(requestsForMember.length).toBeGreaterThan(0)
  expect(requestsForMember.every(request => request.filters?.member === 'memberchart001')).toBe(true)
  expect(requestsForMember.every(request => request.day_boundaries?.length === 2)).toBe(true)

  const initialChartLabel = await chart.getByRole('img', { name: /^2024-01-01:/ }).getAttribute('aria-label')
  const initialDailyRequestCount = requests.filter(request => request.group_by === 'day').length
  const initialProjectRequestCount = requests.filter(request => request.group_by === 'project').length
  await page.getByRole('button', { name: 'Sessions', exact: true }).click()
  await expect(chart.getByRole('img', { name: /^2024-01-01:/ })).toHaveAttribute('aria-label', initialChartLabel!)
  expect(requests.filter(request => request.group_by === 'day')).toHaveLength(initialDailyRequestCount)
  expect(requests.filter(request => request.group_by === 'project')).toHaveLength(initialProjectRequestCount)
})
