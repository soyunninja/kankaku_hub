import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('member project and session cards open minimal pages and return with the selected dates', async ({ page }) => {
  const totals: { group_by: string, pagePath: string, filters?: Record<string, unknown>, from?: string, to?: string, day_boundaries?: string[] }[] = []
  const recordMutations: string[] = []
  const resultList = (items: unknown[]) => ({ page: 1, perPage: 200, totalPages: 1, totalItems: items.length, items })
  const row = (group_key: string) => ({
    group_key, group_key2: '', session_name: 'Navigation session', min_started_at: '2020-01-02 00:00:00.000Z', max_ended_at: '2020-01-02 00:30:00.000Z',
    entries: 1, wall_ms: 1200, work_ms: 1200, waiting_ms: 0, input: 0, output: 0, cache_read: 0, cache_write: 0,
    cost: 0, waiting_unavailable_entries: 0, cost_unknown_entries: 0, cost_estimated_entries: 0,
    cost_known_entries: 1, cost_known_sum: 0, unlinked_entries: 0, distinct_sessions: 1,
    distinct_client: 1, sample_client: 'clientnav001', distinct_project: 1, sample_project: group_key,
    distinct_task: 1, sample_task: 'task', machine: '', distinct_agent: 1, sample_agent: 'pi', ignored_session: 0,
  })

  await page.addInitScript(() => localStorage.setItem('kankaku-locale', 'en'))
  await login(page)
  page.on('request', (request) => {
    if (/\/api\/collections\/[^/]+\/records/.test(request.url()) && request.method() !== 'GET') recordMutations.push(request.method())
  })
  await page.route('**/api/collections/**/records**', async (route) => {
    const collection = new URL(route.request().url()).pathname.split('/')[3]
    const records: Record<string, unknown[]> = {
      departments: [],
      team_members: [{ id: 'membernav001', name: 'Navigation member', department: '', active: true }],
      machines: [],
      clients: [{ id: 'clientnav001', name: 'Navigation client', unassigned: false, active: true }],
      projects: [{ id: 'projectnav001', name: 'Navigation project', client: 'clientnav001', active: true }],
    }
    const parts = new URL(route.request().url()).pathname.split('/')
    const recordId = parts[5]
    const collectionRecords = records[collection!] ?? []
    if (recordId) {
      const record = collectionRecords.find(value => (value as { id?: string }).id === recordId)
      if (record) return route.fulfill({ json: record })
    }
    await route.fulfill({ json: resultList(collectionRecords) })
  })
  await page.route('**/api/kankaku/totals', async (route) => {
    const body = route.request().postDataJSON()
    const referer = route.request().headers().referer ?? page.url()
    totals.push({ group_by: body.group_by, pagePath: new URL(referer).pathname, filters: body.filters, from: body.from, to: body.to, day_boundaries: body.day_boundaries })
    const groups = body.group_by === 'project' ? [row('projectnav001')]
      : body.group_by === 'session' ? [row('opaque ?# session')]
        : body.group_by === 'task' ? [row('tasknav001')]
          : body.group_by === 'day' ? [row('0')]
            : []
    await route.fulfill({ json: {
      groups, total: row(''), total_groups: groups.length,
      page: body.page ?? 1, per_page: body.per_page ?? 200, total_pages: groups.length ? 1 : 0,
      ...(body.group_by === 'session' ? { ignored_sessions_included: body.include_ignored_sessions === true } : {}),
    } })
  })

  const dates = 'dateStart=2024-01-01&dateEnd=2024-01-31'
  await page.goto(`/team/membernav001?${dates}`)
  await page.waitForLoadState('networkidle')
  const projectLink = page.getByRole('link', { name: 'Open project' })
  await expect(projectLink).toHaveAttribute('href', `/team/member-projects/membernav001/projectnav001?${dates}`)
  await projectLink.click()
  await expect(page).toHaveURL(`/team/member-projects/membernav001/projectnav001?${dates}`)
  await expect(page.getByRole('heading', { name: 'Navigation project', exact: true })).toBeVisible()
  await expect(page.getByText('Navigation client · Navigation member')).toBeVisible()
  await expect(page.getByText('First recorded')).toBeVisible()
  await expect(page.getByText('Jan 2, 2020', { exact: false }).first()).toBeVisible()
  await expect(page.getByTestId('member-project-history-chart')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back' })).toBeVisible()
  const projectRequests = totals.filter(request => request.filters?.project === 'projectnav001')
  expect(projectRequests.length).toBeGreaterThan(0)
  expect(projectRequests.every(request => request.filters?.member === 'membernav001' && request.filters?.project === 'projectnav001')).toBe(true)
  expect(projectRequests.every(request => request.from === undefined && request.to === undefined)).toBe(true)
  expect(projectRequests.some(request => request.group_by === 'none')).toBe(true)
  expect(projectRequests.some(request => request.group_by === 'session')).toBe(true)
  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page).toHaveURL(`/team/membernav001?${dates}`)

  await page.getByRole('button', { name: 'Sessions', exact: true }).click()
  await page.waitForLoadState('networkidle')
  const sessionLink = page.getByRole('link', { name: 'Open session' })
  await expect(sessionLink).toHaveAttribute('href', /\/team\/member-sessions\/membernav001\?session_id=opaque\+/)
  await sessionLink.click()
  await expect.poll(() => new URL(page.url()).searchParams.get('session_id')).toBe('opaque ?# session')
  await expect.poll(() => new URL(page.url()).searchParams.get('dateStart')).toBe('2024-01-01')
  await expect.poll(() => new URL(page.url()).searchParams.get('dateEnd')).toBe('2024-01-31')
  await expect(page.getByRole('heading', { name: 'Session', exact: true })).toBeVisible()
  await expect(page.getByText('opaque ?# session', { exact: true })).toBeVisible()
  expect(totals.filter(request => request.pagePath.startsWith('/team/member-sessions/') && request.filters?.member === 'membernav001')).toEqual([])
  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page).toHaveURL(`/team/membernav001?${dates}`)
  expect(recordMutations).toEqual([])
})
