import { expect, test } from '@playwright/test'
import { login, pbOrigin } from './helpers'

// Read-only: never use fixture write helpers or the owner's default stack.
test.beforeEach(() => {
  const pair = `${process.env.PW_BASE_URL}|${pbOrigin()}`
  expect(['http://127.0.0.1:3002|http://127.0.0.1:8092', 'http://127.0.0.1:3003|http://127.0.0.1:8093']).toContain(pair)
})

test('project defaults use bounded metric ranking and conserve overall day totals', async ({ page }) => {
  const requests: { group_by?: string, per_page?: number, sort?: string, from?: string, filters?: { project?: string }, day_boundaries?: string[] }[] = []
  const row = (group_key: string, hours: number, cost: number) => ({ group_key, work_ms: hours * 3600000, cost, entries: 1 })
  const projects = [row('Atlas', 6, 1), row('Birch', 5, 2), row('Cedar', 4, 3), row('Delta', 3, 4), row('Ember', 2, 5), row('Fjord', 1, 6), row('', 7, 7)]
  await page.route('**/api/kankaku/totals', async (route) => {
    const body = route.request().postDataJSON()
    requests.push(body)
    let groups = []
    if (body.group_by === 'project') {
      const field = body.sort === '-cost' ? 'cost' : 'work_ms'
      groups = [...projects].sort((a, b) => b[field] - a[field]).slice(0, body.per_page)
    }
    if (body.group_by === 'day') {
      const project = projects.find(project => project.group_key === body.filters?.project)
      groups = [project ? { ...project, group_key: '0' } : row('0', 28, 28)]
    }
    await route.fulfill({ json: { groups, total: row('', 28, 28), total_groups: groups.length, page: 1, per_page: body.per_page ?? 1, total_pages: 1 } })
  })
  await page.addInitScript(() => localStorage.setItem('kankaku-locale', 'en'))
  await login(page)
  await expect(page.getByText('Others', { exact: true })).toBeVisible()
  const chart = page.getByTestId('dashboard-time-series')
  await expect(chart).toContainText('Work time')
  await expect(chart).toContainText('Project')
  const assertCycle = async (sort: string, names: string[], values: number[], unit: 'h' | '$') => {
    const expected = names.map((name, i) => `${name}: ${unit === 'h' ? `${values[i]}h` : `$${values[i]!.toFixed(2)}`}`).join(', ')
    const point = chart.getByRole('img', { name: /^\d{4}-\d{2}-\d{2}:/ }).first()
    await expect(point).toHaveAttribute('aria-label', new RegExp(`: ${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
    const label = await point.getAttribute('aria-label')
    const rendered = label!.split(': ').slice(1).join(': ').split(', ').map(series => Number(series.split(': ')[1]!.replace(/[$h]/g, '')))
    expect(rendered.reduce((sum, value) => sum + value, 0)).toBe(28)
    const rank = requests.find(body => body.group_by === 'project' && body.per_page === 6)!
    expect(rank.sort).toBe(sort)
    expect(rank.filters?.project).toBeUndefined()
    const days = requests.filter(body => body.group_by === 'day')
    expect(days).toHaveLength(6)
    expect(days.filter(body => body.filters?.project).map(body => body.filters!.project)).toEqual(names.slice(0, 5))
    const overall = days.find(body => !body.filters?.project)!
    expect(overall.filters).toEqual(rank.filters)
    expect(overall.day_boundaries?.[0]).toBe(rank.from)
    for (const day of days) {
      const { project: _project, ...base } = day.filters ?? {}
      expect(base).toEqual(rank.filters ?? {})
      expect(day.day_boundaries).toEqual(overall.day_boundaries)
    }
    expect(days.length + requests.filter(body => body.group_by === 'project' && body.per_page === 6).length).toBeLessThanOrEqual(7)
  }
  await assertCycle('-work_ms', ['Atlas', 'Birch', 'Cedar', 'Delta', 'Ember', 'Others'], [6, 5, 4, 3, 2, 8], 'h')
  requests.length = 0
  await chart.getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'Cost', exact: true }).click()
  await expect.poll(() => requests.filter(body => body.per_page === 6).at(-1)?.sort).toBe('-cost')
  await assertCycle('-cost', ['Fjord', 'Ember', 'Delta', 'Cedar', 'Birch', 'Others'], [6, 5, 4, 3, 2, 8], '$')
})

for (const change of ['metric', 'range'] as const) {
  test(`late project response cannot replace a newer ${change} selection`, async ({ page }) => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    let rankCount = 0
    const row = (group_key: string) => ({ group_key, entries: 1, work_ms: 3600000, cost: 1 })
    await page.route('**/api/kankaku/totals', async (route) => {
      const body = route.request().postDataJSON()
      let groups = []
      if (body.group_by === 'project' && body.per_page === 6) {
        const first = ++rankCount === 1
        if (first) await gate
        groups = [row(first ? 'staleproject001' : 'freshproject001')]
      }
      if (body.group_by === 'day') groups = [row('0')]
      await route.fulfill({ json: { groups, total: row(''), total_groups: groups.length, page: 1, per_page: body.per_page ?? 1, total_pages: 1 } })
    })
    await page.addInitScript(() => localStorage.setItem('kankaku-locale', 'en'))
    try {
      await login(page)
      await expect.poll(() => rankCount).toBe(1)
      const chart = page.getByTestId('dashboard-time-series')
      if (change === 'metric') {
        await chart.getByRole('combobox').first().click()
        await page.getByRole('option', { name: 'Cost', exact: true }).click()
      }
      else {
        await page.getByRole('button', { name: /\d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}/ }).click()
        await page.getByRole('button', { name: 'Today', exact: true }).click()
      }
      await expect(chart).toContainText('freshproject001')
      release()
      await page.waitForLoadState('networkidle')
      await expect.poll(() => rankCount).toBe(2)
      await expect(chart).not.toContainText('staleproject001')
    }
    finally {
      release()
    }
  })
}
