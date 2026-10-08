import type { Page, Route } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { login, loginAs } from './helpers'

async function installSingleSessionFixtures(page: Page, projectId: string) {
  const total = {
    entries: 1, wall_ms: 60_000, work_ms: 45_000, waiting_ms: 15_000, input: 3, output: 2,
    cache_read: 0, cache_write: 0, cost: 0.1, waiting_unavailable_entries: 0,
    cost_unknown_entries: 0, cost_estimated_entries: 0, cost_known_entries: 1,
    cost_known_sum: 0.1, unlinked_entries: 0, distinct_sessions: 1,
  }
  const row = (group_key: string, overrides: Record<string, string | number> = {}) => ({
    ...total, group_key, group_key2: '', session_name: 'Race session',
    min_started_at: '2020-01-02 00:00:00.000Z', max_ended_at: '2020-01-02 00:45:00.000Z',
    distinct_client: 1, sample_client: 'raceclient', distinct_project: 1, sample_project: projectId,
    distinct_task: 1, sample_task: 'racetask', machine: '', distinct_agent: 1, sample_agent: 'pi',
    ignored_session: 0, ...overrides,
  })
  const deferredTasks: { route: Route, resolve: () => void }[] = []
  const lists: Record<string, unknown[]> = {
    team_members: [{ id: 'racemember', name: 'Race member', department: '', active: true }],
    projects: [{ id: projectId, name: 'Race project', client: 'raceclient', active: true }],
    clients: [{ id: 'raceclient', name: 'Race client', unassigned: false, active: true }],
    tasks: [{ id: 'racetask', title: 'Race task', project: projectId, status: 'doing' }],
  }
  await page.route('**/api/collections/**/records**', async (route) => {
    const url = new URL(route.request().url())
    const parts = url.pathname.split('/')
    const collection = parts[3]!
    const id = parts[5]
    const records = lists[collection] ?? []
    const record = records.find(item => (item as { id?: string }).id === id)
    if (id && record) return route.fulfill({ json: record })
    await route.fulfill({ json: { page: 1, perPage: 200, totalPages: 1, totalItems: records.length, items: records } })
  })
  await page.route('**/api/kankaku/totals', async (route) => {
    const body = route.request().postDataJSON() as { group_by?: string, filters?: Record<string, string>, page?: number, per_page?: number }
    if (body.group_by === 'task' && body.filters?.session_id) {
      await new Promise<void>((resolve) => deferredTasks.push({ route, resolve }))
      return
    }
    const groups = body.group_by === 'session' ? [row('racesession')]
      : body.group_by === 'task' ? [row('racetask')]
        : body.group_by === 'day' ? [row('0')]
          : []
    await route.fulfill({ json: {
      groups, total, page: body.page ?? 1, per_page: body.per_page ?? 200,
      total_groups: groups.length, total_pages: groups.length ? 1 : 0,
      ...(body.group_by === 'session' ? { ignored_sessions_included: true } : {}),
    } })
  })
  return { deferredTasks, total, taskRow: row('racetask') }
}

test('member project history is full-range, scoped, expandable and responsive', async ({ page }) => {
  const totalsRequests: { body: Record<string, unknown>, path: string }[] = []
  const mutations: string[] = []
  const pageResult = (items: unknown[]) => ({ page: 1, perPage: 200, totalPages: 1, totalItems: items.length, items })
  const rawTotal = (overrides: Record<string, number> = {}) => ({
    entries: 2, wall_ms: 120_000, work_ms: 90_000, waiting_ms: 30_000, input: 20, output: 10,
    cache_read: 0, cache_write: 0, cost: 0.2, waiting_unavailable_entries: 0,
    cost_unknown_entries: 1, cost_estimated_entries: 1, cost_known_entries: 1, cost_known_sum: 0.2,
    unlinked_entries: 0, distinct_sessions: 2, ignored_session: 0, ...overrides,
  })
  const rawGroup = (group_key: string, overrides: Record<string, string | number> = {}) => ({
    ...rawTotal(), group_key, group_key2: '', session_name: '', min_started_at: '', max_ended_at: '',
    distinct_client: 1, sample_client: 'clienthist001', distinct_project: 1, sample_project: 'projecthist001',
    distinct_task: 1, sample_task: 'taskhist001', machine: '', distinct_agent: 1, sample_agent: 'pi', ...overrides,
  })
  const oldMetrics = {
    entries: 1, wall_ms: 60_000, work_ms: 45_000, waiting_ms: 15_000, input: 10, output: 5,
    cost: 0, cost_unknown_entries: 1, cost_estimated_entries: 0, cost_known_entries: 0, cost_known_sum: 0, distinct_sessions: 1,
  }
  const latestMetrics = {
    entries: 1, wall_ms: 60_000, work_ms: 45_000, waiting_ms: 15_000, input: 10, output: 5,
    cost: 0.2, cost_unknown_entries: 0, cost_estimated_entries: 1, cost_known_entries: 1, cost_known_sum: 0.2, distinct_sessions: 1,
  }
  const oldSession = rawGroup('session-old', {
    ...oldMetrics, session_name: 'History session old', min_started_at: '2019-01-02 10:00:00.000Z', max_ended_at: '2019-01-02 10:20:00.000Z', ignored_session: 1,
  })
  const latestSession = rawGroup('session-latest', {
    ...latestMetrics, session_name: 'History session latest', min_started_at: '2024-03-05 12:00:00.000Z', max_ended_at: '2024-03-05 12:45:00.000Z', ignored_session: 1,
  })
  const zeroTotal = () => rawTotal({ entries: 0, wall_ms: 0, work_ms: 0, waiting_ms: 0, input: 0, output: 0, cost: 0,
    cost_unknown_entries: 0, cost_estimated_entries: 0, cost_known_entries: 0, cost_known_sum: 0, distinct_sessions: 0 })
  const sumGroups = (groups: Record<string, unknown>[]) => {
    const sum = zeroTotal()
    for (const group of groups) {
      for (const field of Object.keys(sum)) {
        if (field === 'distinct_sessions') continue
        sum[field as keyof typeof sum] += (group[field] as number) ?? 0
      }
      sum.distinct_sessions += (group.distinct_sessions as number) ?? 0
    }
    return sum
  }

  await page.addInitScript(() => localStorage.setItem('kankaku-locale', 'en'))
  await login(page)
  page.on('request', (request) => {
    if (/\/api\/collections\/[^/]+\/records/.test(request.url()) && request.method() !== 'GET') mutations.push(request.method())
  })
  await page.route('**/api/collections/**/records**', async (route) => {
    const collection = new URL(route.request().url()).pathname.split('/')[3]
    const records: Record<string, unknown[]> = {
      departments: [],
      team_members: [{ id: 'memberhist001', name: 'History member', department: '', active: true }],
      machines: [],
      clients: [{ id: 'clienthist001', name: 'History client', unassigned: false, active: true }],
      projects: [
        { id: 'projecthist001', name: 'Full-history project', client: 'clienthist001', active: false },
        { id: 'projectold001', name: 'Old-hook project', client: 'clienthist001', active: true },
        { id: 'projectrev001', name: 'Reversed-date project', client: 'clienthist001', active: true },
      ],
      tasks: [
        { id: 'taskhist001', title: 'Historical task', project: 'projecthist001', status: 'done' },
        { id: 'taskhist002', title: 'Second historical task', project: 'projecthist001', status: 'doing' },
      ],
    }
    const parts = new URL(route.request().url()).pathname.split('/')
    const recordId = parts[5]
    const collectionRecords = records[collection!] ?? []
    if (recordId) {
      const record = collectionRecords.find(value => (value as { id?: string }).id === recordId)
      if (record) return route.fulfill({ json: record })
    }
    await route.fulfill({ json: pageResult(collectionRecords) })
  })
  await page.route('**/api/kankaku/totals', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    const referer = route.request().headers().referer ?? page.url()
    totalsRequests.push({ body, path: new URL(referer).pathname })
    const filters = body.filters as Record<string, string> | undefined
    if (filters?.project === 'projectold001' && body.group_by === 'session') {
      return route.fulfill({ status: 400, json: { message: 'include_ignored_sessions is unsupported' } })
    }
    let groups: Record<string, unknown>[] = []
    if (body.group_by === 'task') {
      if (filters?.session_id === 'session-old') groups = [rawGroup('taskhist001', oldMetrics)]
      else if (!filters?.session_id) groups = [rawGroup('taskhist001', oldMetrics), rawGroup('taskhist002', latestMetrics)]
    }
    else if (body.group_by === 'session') groups = filters?.project === 'projectrev001'
      ? [rawGroup('reverse-session', { session_name: 'Reversed session', min_started_at: '2024-03-05 00:00:00.000Z', max_ended_at: '2023-03-05 00:00:00.000Z', ignored_session: 1 })]
      : [oldSession, latestSession]
    else if (body.group_by === 'day') {
      const boundaries = body.day_boundaries as string[]
      groups = ['2019-01-02', '2024-03-05'].flatMap((day) => {
        const timestamp = Date.parse(day.startsWith('2019') ? '2019-01-02T10:00:00.000Z' : '2024-03-05T12:00:00.000Z')
        const index = boundaries.findIndex((boundary, i) => i < boundaries.length - 1
          && timestamp >= Date.parse(boundary.replace(' ', 'T'))
          && timestamp < Date.parse(boundaries[i + 1]!.replace(' ', 'T')))
        const metrics = day.startsWith('2019') ? oldMetrics : latestMetrics
        return index < 0 || index >= boundaries.length - 1 ? [] : [rawGroup(String(index), {
          ...metrics, min_started_at: `${day} 00:00:00.000Z`, max_ended_at: `${day} 23:59:59.999Z`,
        })]
      })
    }
    const total = body.group_by === 'day' ? sumGroups(groups)
      : body.group_by === 'task' && filters?.session_id === 'session-old' ? rawTotal(oldMetrics)
        : rawTotal()
    await route.fulfill({ json: {
      groups, total, total_groups: groups.length,
      page: body.page ?? 1, per_page: body.per_page ?? 200, total_pages: groups.length ? 1 : 0,
      ...(body.group_by === 'session' && filters?.project !== 'projectold001' ? { ignored_sessions_included: body.include_ignored_sessions === true } : {}),
    } })
  })

  await page.goto('/team/member-projects/memberhist001/projecthist001?dateStart=2024-02-01&dateEnd=2024-02-29')
  await expect(page.getByRole('heading', { name: 'Full-history project' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/team/memberhist001?dateStart=2024-02-01&dateEnd=2024-02-29')
  await expect(page.getByText('History client · History member')).toBeVisible()
  await expect(page.getByText('First recorded')).toBeVisible()
  await expect(page.getByText(/Jan 2, 2019/).first()).toBeVisible()
  await expect(page.getByText(/Mar 5, 2024/).first()).toBeVisible()
  await expect(page.getByText('Known / estimated subtotal').first()).toBeVisible()
  await expect(page.getByText('1 unknown').first()).toBeVisible()
  await expect(page.getByText('Ignored session', { exact: true })).toHaveCount(2)
  const historyKpis = page.getByRole('region', { name: 'Member work' })
  await expect(historyKpis.getByRole('heading', { name: 'Tokens', exact: true })).toHaveCount(0)
  await expect(historyKpis.getByText('2 task entries', { exact: true })).toHaveCount(0)
  await expect(historyKpis.getByRole('heading', { name: 'Sessions', exact: true })).toBeVisible()
  await expect(page.getByTestId('member-project-history-chart')).toBeVisible()
  await page.getByRole('button', { name: 'Token cost', exact: true }).click()
  await expect(page.getByText(/unknown cost and are excluded from the chart/)).toBeVisible()

  const projectRequests = totalsRequests.filter(({ body }) => {
    const filters = body.filters as Record<string, string> | undefined
    return filters?.member === 'memberhist001' || filters?.project === 'projecthist001'
  })
  expect(projectRequests.length).toBeGreaterThan(0)
  for (const { body } of projectRequests) {
    expect(body.filters).toEqual(expect.objectContaining({ member: 'memberhist001', project: 'projecthist001' }))
    expect(body).not.toHaveProperty('from')
    expect(body).not.toHaveProperty('to')
  }
  expect(projectRequests.some(({ body }) => body.group_by === 'none')).toBe(true)
  expect(projectRequests.some(({ body }) => body.group_by === 'session')).toBe(true)
  expect(projectRequests.some(({ body }) => body.group_by === 'day' && (body.day_boundaries as string[]).length <= 401)).toBe(true)

  await page.getByRole('button', { name: 'Tasks', exact: true }).first().click()
  await expect(page.getByText('Historical task', { exact: true })).toBeVisible()
  expect(totalsRequests.some(({ body }) => body.group_by === 'task'
    && JSON.stringify(body.filters) === JSON.stringify({ member: 'memberhist001', project: 'projecthist001', session_id: 'session-old' }))).toBe(true)

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.setViewportSize({ width: 1440, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.goto('/team/member-projects/memberhist001/projectold001?dateStart=2024-02-01&dateEnd=2024-02-29')
  await expect(page.getByRole('alert').filter({ hasText: 'Historical project totals are unavailable' })).toBeVisible()
  await expect(page.getByText('First recorded')).toHaveCount(0)
  await page.goto('/team/member-projects/memberhist001/projectrev001?dateStart=2024-02-01&dateEnd=2024-02-29')
  await expect(page.getByRole('alert').filter({ hasText: "Could not load this project's attributed history" })).toBeVisible()
  await expect(page.getByText('First recorded')).toHaveCount(0)
  await expect(page.getByTestId('member-project-history-chart')).toHaveCount(0)

  expect(mutations).toEqual([])
})

test('viewer cannot read project history identifiers or issue scoped history requests', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kankaku-locale', 'en'))
  const payload = Buffer.from(JSON.stringify({ id: 'mockviewer', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
  const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.mock-signature`
  const record = {
    id: 'mockviewer', collectionId: '_pb_users_auth_', collectionName: 'users',
    email: 'viewer@mock.local', name: 'Mock viewer', role: 'viewer', verified: true,
  }
  const authResponse = { token, record }
  await page.route('**/api/collections/users/auth-with-password', route => route.fulfill({ json: authResponse }))
  await page.route('**/api/collections/users/auth-refresh', route => route.fulfill({ json: authResponse }))
  await loginAs(page, 'viewer@mock.local', 'mock-password')
  const totals: Record<string, unknown>[] = []
  await page.route('**/api/kankaku/totals', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    totals.push(body)
    await route.fulfill({ json: { groups: [], total: { entries: 0, wall_ms: 0, work_ms: 0, waiting_ms: 0, input: 0, output: 0, cache_read: 0, cache_write: 0, cost: 0, waiting_unavailable_entries: 0, cost_unknown_entries: 0, cost_estimated_entries: 0, cost_known_entries: 0, cost_known_sum: 0, unlinked_entries: 0, distinct_sessions: 0 }, page: 1, per_page: 50, total_groups: 0, total_pages: 0 } })
  })
  await page.goto('/team/member-projects/secret-member/secret-project')
  await expect(page.getByText(/Only the owner can view and manage the team catalog/)).toBeVisible()
  expect(totals.some(body => JSON.stringify(body.filters).includes('secret-member') || JSON.stringify(body.filters).includes('secret-project'))).toBe(false)
})

test('collapsing and reopening a session ignores the older task request response', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kankaku-locale', 'en'))
  await login(page)
  const { deferredTasks, total, taskRow } = await installSingleSessionFixtures(page, 'raceproject')
  await page.goto('/team/member-projects/racemember/raceproject')
  await expect(page.getByRole('heading', { name: 'Race project' })).toBeVisible()
  const tasksButton = page.getByRole('button', { name: 'Tasks', exact: true })
  await tasksButton.click()
  await expect.poll(() => deferredTasks.length).toBe(1)
  await tasksButton.click()
  await tasksButton.click()
  await expect.poll(() => deferredTasks.length).toBe(2)

  const latest = deferredTasks[1]!
  await latest.route.fulfill({ json: { groups: [taskRow], total, page: 1, per_page: 200, total_groups: 1, total_pages: 1 } })
  latest.resolve()
  await expect(page.getByText('Race task', { exact: true })).toBeVisible()

  const stale = deferredTasks[0]!
  await stale.route.fulfill({ status: 503, json: { message: 'stale request failed' } })
  stale.resolve()
  await page.waitForTimeout(100)
  await expect(page.getByText('Race task', { exact: true })).toBeVisible()
  await expect(page.getByText('Could not load tasks for this session.')).toHaveCount(0)
})
