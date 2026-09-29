import { expect, test } from '@playwright/test'
import { apiLogin, comboboxTrigger, login, pbOrigin, pbUrl, selectCombobox } from './helpers'

interface Project { id: string, name: string, client: string, active: boolean }
interface Client { id: string, name: string }
interface TotalsGroup { group_key: string, work_ms: number, cost: number }
type Key = 'name' | 'client' | 'status' | 'time' | 'cost'

test('project columns sort loaded rows, preserve the client filter and expose keyboard sort state', async ({ page, request }) => {
  test.setTimeout(60_000)
  const isolatedStack = (process.env.PW_BASE_URL === 'http://127.0.0.1:3002' && pbOrigin() === 'http://127.0.0.1:8092')
    || (process.env.PW_BASE_URL === 'http://127.0.0.1:3003' && pbOrigin() === 'http://127.0.0.1:8093')
  if (!isolatedStack) {
    throw new Error('Run this read-only spec only against a fresh isolated :3002/:8092 or :3003/:8093 stack')
  }
  const token = await apiLogin(request)
  const headers = { Authorization: token }
  const [projectsResponse, clientsResponse] = await Promise.all([
    request.get(pbUrl('/api/collections/projects/records?perPage=200'), { headers }),
    request.get(pbUrl('/api/collections/clients/records?perPage=200'), { headers }),
  ])
  expect(projectsResponse.ok()).toBeTruthy()
  expect(clientsResponse.ok()).toBeTruthy()
  const projects = (await projectsResponse.json()).items as Project[]
  const clients = (await clientsResponse.json()).items as Client[]
  expect(projects.length, 'Seed needs at least three projects').toBeGreaterThanOrEqual(3)
  expect(new Set(projects.map(p => p.name)).size, 'Seed project names must be unique for row assertions').toBe(projects.length)

  await page.addInitScript(() => window.localStorage.setItem('kankaku-locale', 'en'))
  await login(page)
  const totalsResponse = page.waitForResponse(response => response.url().includes('/api/kankaku/totals')
    && response.request().method() === 'POST'
    && response.request().postDataJSON()?.group_by === 'project')
  await page.goto('/projects')
  const totals = (await totalsResponse).json() as Promise<{ groups: TotalsGroup[] }>
  const byId = new Map((await totals).groups.map(g => [g.group_key, g]))
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
  const clientName = (id: string) => clients.find(c => c.id === id)?.name ?? id
  const compare = (key: Key, a: Project, b: Project) => {
    switch (key) {
      case 'name': return collator.compare(a.name, b.name)
      case 'client': return collator.compare(clientName(a.client), clientName(b.client))
      case 'status': return Number(a.active) - Number(b.active)
      case 'time': return (byId.get(a.id)?.work_ms ?? 0) - (byId.get(b.id)?.work_ms ?? 0)
      case 'cost': return (byId.get(a.id)?.cost ?? 0) - (byId.get(b.id)?.cost ?? 0)
    }
  }
  const expected = (key: Key, direction: 'asc' | 'desc', rows = projects) => rows.toSorted((a, b) =>
    (direction === 'asc' ? 1 : -1) * compare(key, a, b)
    || collator.compare(a.name, b.name) || collator.compare(a.id, b.id) || a.id.localeCompare(b.id)).map(p => p.name)
  const table = page.getByRole('table')
  const rows = table.locator('tbody tr')
  const names = () => rows.locator('td:first-child').allTextContents().then(values => values.map(v => v.trim()))
  await expect.poll(names).toEqual(expected('name', 'asc'))
  const headersByPosition = table.locator('thead th')
  await expect(headersByPosition.nth(0)).toHaveAttribute('aria-sort', 'ascending')
  expect(await headersByPosition.nth(5).getByRole('button').count()).toBe(0)
  await expect(headersByPosition.nth(3).locator('[title]')).toHaveAttribute('title', /./)

  const labels: Record<Key, string> = { name: 'Name', client: 'Client', status: 'Status', time: 'Time', cost: 'Cost' }
  for (const [index, key] of (['client', 'status', 'time', 'cost', 'name'] as const).entries()) {
    const first = key === 'client' || key === 'name' ? 'asc' : 'desc'
    const header = headersByPosition.nth(index === 4 ? 0 : index + 1)
    const button = header.getByRole('button')
    await expect(button).toHaveAttribute('aria-label', new RegExp(`Sort ${labels[key]} ${first === 'asc' ? 'ascending' : 'descending'}`))
    await button.focus()
    await page.keyboard.press('Enter')
    await expect(header).toHaveAttribute('aria-sort', first === 'asc' ? 'ascending' : 'descending')
    await expect.poll(names).toEqual(expected(key, first))
    await expect(header).toContainText(first === 'asc' ? '↑' : '↓')
    await expect(button).toHaveAttribute('aria-label', new RegExp(`Sort ${labels[key]} ${first === 'asc' ? 'descending' : 'ascending'}`))
    await page.keyboard.press('Space')
    const reverse = first === 'asc' ? 'desc' : 'asc'
    await expect(header).toHaveAttribute('aria-sort', reverse === 'asc' ? 'ascending' : 'descending')
    await expect.poll(names).toEqual(expected(key, reverse))
  }

  const owner = clients.find(c => projects.filter(p => p.client === c.id).length >= 2)
  expect(owner, 'Seed needs two projects for one client').toBeDefined()
  await selectCombobox(comboboxTrigger(page, 'Filter by client'), owner!.name)
  await expect.poll(names).toEqual(expected('name', 'desc', projects.filter(p => p.client === owner!.id)))
  await headersByPosition.nth(4).getByRole('button').click()
  await expect.poll(names).toEqual(expected('cost', 'desc', projects.filter(p => p.client === owner!.id)))
})
