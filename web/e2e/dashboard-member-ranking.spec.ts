import { expect, test } from '@playwright/test'
import { loginAs } from './helpers'

async function mockLogin(page: import('@playwright/test').Page, role: 'owner' | 'viewer') {
  const id = `mock${role}`
  const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({ id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.mock-signature`
  const auth = { token, record: { id, collectionId: '_pb_users_auth_', collectionName: 'users', email: `${role}@mock.local`, name: `Mock ${role}`, role, verified: true } }
  await page.addInitScript(() => localStorage.setItem('kankaku-locale', 'en'))
  await page.route('**/api/collections/users/auth-with-password', route => route.fulfill({ json: auth }))
  await page.route('**/api/collections/users/auth-refresh', route => route.fulfill({ json: auth }))
  await loginAs(page, `${role}@mock.local`, 'mock-password')
}

function total() {
  return { entries: 1, wall_ms: 1000, work_ms: 900, waiting_ms: 100, input: 1, output: 1, cache_read: 0, cache_write: 0, cost: 12,
    waiting_unavailable_entries: 0, cost_unknown_entries: 0, cost_estimated_entries: 0, cost_known_entries: 1, cost_known_sum: 12, unlinked_entries: 0, distinct_sessions: 1 }
}

test('owner sees scoped historical member ranking with inactive identity and resolved profile links', async ({ page }) => {
  const memberRequests: Record<string, unknown>[] = []
  const catalogReads: string[] = []
  await mockLogin(page, 'owner')
  await page.route('**/api/collections/**/records**', async route => {
    const parts = new URL(route.request().url()).pathname.split('/')
    const collection = parts[3]!
    if (collection === 'team_members') catalogReads.push(collection)
    const records: Record<string, unknown[]> = {
      clients: [], projects: [], team_members: [{ id: 'inactive1', name: 'Historical member', active: false }],
    }
    const items = records[collection] ?? []
    await route.fulfill({ json: { page: 1, perPage: 200, totalPages: 1, totalItems: items.length, items } })
  })
  await page.route('**/api/kankaku/totals', async route => {
    const body = route.request().postDataJSON() as Record<string, any>
    if (body.group_by === 'member') memberRequests.push(body)
    const groups = body.group_by === 'member' ? [{ ...total(), group_key: 'inactive1' }] : []
    await route.fulfill({ json: { groups, total: total(), page: body.page ?? 1, per_page: body.per_page ?? 200, total_groups: groups.length, total_pages: groups.length ? 1 : 0 } })
  })
  await page.route('**/api/collections/task_entries/records**', route => route.fulfill({ json: { page: 1, perPage: 10, totalPages: 0, totalItems: 0, items: [] } }))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Team members by cost' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Historical member' })).toHaveAttribute('href', '/team/inactive1')
  expect(memberRequests).toHaveLength(1)
  expect(memberRequests[0]).toMatchObject({ group_by: 'member', sort: '-cost', page: 1, per_page: 200 })
  expect(memberRequests[0]).toHaveProperty('from')
  expect(memberRequests[0]).toHaveProperty('to')
  expect(catalogReads).toEqual(['team_members'])
})

test('viewer sees no member panel and triggers no member totals or catalog reads', async ({ page }) => {
  const memberRequests: unknown[] = []
  const catalogReads: string[] = []
  await mockLogin(page, 'viewer')
  await page.route('**/api/collections/**/records**', async route => {
    const collection = new URL(route.request().url()).pathname.split('/')[3]!
    if (collection === 'team_members') catalogReads.push(collection)
    await route.fulfill({ json: { page: 1, perPage: 200, totalPages: 0, totalItems: 0, items: [] } })
  })
  await page.route('**/api/kankaku/totals', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    if (body.group_by === 'member') memberRequests.push(body)
    await route.fulfill({ json: { groups: [], total: total(), page: 1, per_page: 200, total_groups: 0, total_pages: 0 } })
  })
  await page.route('**/api/collections/task_entries/records**', route => route.fulfill({ json: { page: 1, perPage: 10, totalPages: 0, totalItems: 0, items: [] } }))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Hello, Mock viewer' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Team members by cost' })).toHaveCount(0)
  expect(memberRequests).toEqual([])
  expect(catalogReads).toEqual([])
})
