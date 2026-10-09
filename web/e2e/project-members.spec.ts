import { expect, test } from '@playwright/test'
import { loginAs } from './helpers'

test('project detail shows owner-only all-time member cards from scoped history', async ({ page }) => {
  const memberRequests: Record<string, unknown>[] = []
  const mutations: string[] = []
  const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({ id: 'mockowner', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.mock-signature`
  const record = { id: 'mockowner', collectionId: '_pb_users_auth_', collectionName: 'users', email: 'owner@mock.local', name: 'Mock owner', role: 'owner', verified: true }
  const auth = { token, record }
  await page.addInitScript(() => localStorage.setItem('kankaku-locale', 'en'))
  await page.route('**/api/collections/users/auth-with-password', route => route.fulfill({ json: auth }))
  await page.route('**/api/collections/users/auth-refresh', route => route.fulfill({ json: auth }))
  await loginAs(page, 'owner@mock.local', 'mock-password')
  page.on('request', request => { if (/\/api\/collections\/[^/]+\/records/.test(request.url()) && request.method() !== 'GET') mutations.push(request.method()) })
  const records: Record<string, unknown[]> = {
    clients: [{ id: 'c1', name: 'Client', active: true }],
    projects: [{ id: 'p1', name: 'Project', client: 'c1', active: true }],
    tasks: [],
    departments: [{ id: 'd1', name: 'Design' }],
    team_members: [{ id: 'm1', name: 'Inactive history member', department: 'd1', active: false }],
    machines: [],
  }
  await page.route('**/api/collections/**/records**', async route => {
    const parts = new URL(route.request().url()).pathname.split('/')
    const collection = parts[3]!
    const id = parts[5]
    const items = records[collection] ?? []
    const found = items.find(item => (item as { id?: string }).id === id)
    if (id && found) return route.fulfill({ json: found })
    await route.fulfill({ json: { page: 1, perPage: 200, totalPages: 1, totalItems: items.length, items } })
  })
  const rawTotal = {
    entries: 1, wall_ms: 60_000, work_ms: 45_000, waiting_ms: 15_000, input: 3, output: 2, cache_read: 0, cache_write: 0,
    cost: 0, waiting_unavailable_entries: 0, cost_unknown_entries: 1, cost_estimated_entries: 0, cost_known_entries: 0,
    cost_known_sum: 0, unlinked_entries: 0, distinct_sessions: 1,
  }
  await page.route('**/api/kankaku/totals', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    if (body.group_by === 'member') memberRequests.push(body)
    const groups = body.group_by === 'member' ? [{ ...rawTotal, group_key: 'm1' }]
      : body.group_by === 'task' ? [] : body.group_by === 'day' ? [{ ...rawTotal, group_key: '0' }] : []
    await route.fulfill({ json: {
      groups, total: rawTotal, page: body.page ?? 1, per_page: body.per_page ?? 200,
      total_groups: groups.length, total_pages: groups.length ? 1 : 0,
    } })
  })

  await page.goto('/organizacion/clientes/c1/proyectos/p1')
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Inactive history member' })).toBeVisible()
  await expect(page.getByText('Inactive', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: "Open Inactive history member's project work history" })).toHaveAttribute('href', '/team/member-projects/m1/p1')
  expect(memberRequests).toHaveLength(1)
  expect(memberRequests[0]).toMatchObject({ group_by: 'member', filters: { client: 'c1', project: 'p1' }, page: 1, per_page: 200 })
  expect(memberRequests[0]).not.toHaveProperty('from')
  expect(memberRequests[0]).not.toHaveProperty('to')
  expect(mutations).toEqual([])
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('viewer cannot see the Members section or trigger member/catalog reads', async ({ page }) => {
  const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({ id: 'mockviewer', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.mock-signature`
  const auth = { token, record: { id: 'mockviewer', collectionId: '_pb_users_auth_', collectionName: 'users', email: 'viewer@mock.local', name: 'Mock viewer', role: 'viewer', verified: true } }
  const memberRequests: Record<string, unknown>[] = []
  const catalogRequests: string[] = []
  await page.addInitScript(() => localStorage.setItem('kankaku-locale', 'en'))
  await page.route('**/api/collections/users/auth-with-password', route => route.fulfill({ json: auth }))
  await page.route('**/api/collections/users/auth-refresh', route => route.fulfill({ json: auth }))
  await loginAs(page, 'viewer@mock.local', 'mock-password')
  const records: Record<string, unknown[]> = {
    clients: [{ id: 'c1', name: 'Client', active: true }],
    projects: [{ id: 'p1', name: 'Project', client: 'c1', active: true }],
    tasks: [], departments: [], team_members: [], machines: [],
  }
  await page.route('**/api/collections/**/records**', async route => {
    const parts = new URL(route.request().url()).pathname.split('/')
    const collection = parts[3]!
    if (['departments', 'team_members', 'machines'].includes(collection)) catalogRequests.push(collection)
    const items = records[collection] ?? []
    await route.fulfill({ json: { page: 1, perPage: 200, totalPages: 1, totalItems: items.length, items } })
  })
  await page.route('**/api/kankaku/totals', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    if (body.group_by === 'member') memberRequests.push(body)
    const total = { entries: 0, wall_ms: 0, work_ms: 0, waiting_ms: 0, input: 0, output: 0, cache_read: 0, cache_write: 0, cost: 0,
      waiting_unavailable_entries: 0, cost_unknown_entries: 0, cost_estimated_entries: 0, cost_known_entries: 0, cost_known_sum: 0, unlinked_entries: 0, distinct_sessions: 0 }
    await route.fulfill({ json: { groups: [], total, page: 1, per_page: 200, total_groups: 0, total_pages: 0 } })
  })
  await page.goto('/organizacion/clientes/c1/proyectos/p1')
  await expect(page.getByRole('heading', { name: 'Project' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Members' })).toHaveCount(0)
  await expect(page.getByText('Could not load project member totals.')).toHaveCount(0)
  expect(memberRequests).toEqual([])
  expect(catalogRequests).toEqual([])
})
