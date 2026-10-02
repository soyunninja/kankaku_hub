import { expect, test } from '@playwright/test'
import { login, pbOrigin } from './helpers'

// Read-only mocks; never run against the owner's default stack.
test.beforeEach(async ({ page }) => {
  expect(['http://127.0.0.1:3002|http://127.0.0.1:8092', 'http://127.0.0.1:3003|http://127.0.0.1:8093']).toContain(`${process.env.PW_BASE_URL}|${pbOrigin()}`)
  await page.addInitScript(() => {
    localStorage.setItem('kankaku-locale', 'en')
    const errors: string[] = []
    Object.assign(window, { recoveryRejections: errors })
    window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)))
  })
})

for (const failure of [503, 404]) {
  test(`chart ${failure} recovery preserves summary and export`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let summaryCalls = 0
    let chartCalls = 0
    let fallbackCalls = 0
    let recover = false
    const chartBodies: Record<string, unknown>[] = []
    const row = (group_key: string) => ({ group_key, entries: 2, work_ms: 3600000, cost: 42 })
    await page.route('**/api/kankaku/totals', async (route) => {
      const body = route.request().postDataJSON()
      // Sidebar calls have no period; don't count them as dashboard loads.
      const chart = body.per_page === 6 || body.group_by === 'day'
      if (chart) {
        chartCalls++
        chartBodies.push(body)
        if (!recover) {
          await route.fulfill({ status: failure, json: { message: 'Unavailable' } })
          return
        }
      }
      else if (body.from) summaryCalls++
      const groups = body.group_by === 'project' ? [row('project00000001')] : body.group_by === 'day' ? [row('0')] : []
      await route.fulfill({ json: { total: row(''), groups, total_groups: groups.length, page: 1, total_pages: 1 } })
    })
    await page.route('**/api/collections/task_entries/records?**', async (route) => {
      const url = new URL(route.request().url())
      const fallback = url.searchParams.get('perPage') === '2000'
      if (fallback) fallbackCalls++
      if (fallback && !recover) {
        await route.fulfill({ status: 503, json: { message: 'Unavailable' } })
        return
      }
      await route.fulfill({ json: { page: 1, perPage: 2000, totalItems: 1, totalPages: 1, items: fallback ? [{ id: 'entry0000000001', project: 'project00000001', client: '', started_at: new Date().toISOString(), work_ms: 3600000, cost: 1 }] : [] } })
    })
    await login(page)
    const chart = page.locator('[data-slot="card"]').filter({ has: page.getByText('Time series', { exact: true }) })
    const alert = chart.getByRole('alert')
    await expect(alert).toContainText('Could not load time series.')
    await expect(chart.getByRole('img')).toHaveCount(0)
    await expect(chart.getByText('No data in this period')).toHaveCount(0)
    const exportButton = page.getByRole('button', { name: 'Export', exact: true })
    await expect(exportButton).toBeEnabled()
    const kpi = page.locator('[data-slot="card"]').filter({ has: page.getByText('Cost (USD)', { exact: true }) }).getByTestId('kpi-value')
    const value = await kpi.innerText()
    const calls = summaryCalls
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(alert).toBeVisible()
    await expect.poll(() => failure === 404 ? fallbackCalls : chartCalls).toBeGreaterThan(1)
    recover = true
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(chart.getByRole('img').first()).toBeVisible()
    await expect(alert).toHaveCount(0)
    await expect(kpi).toHaveText(value)
    await expect(exportButton).toBeEnabled()
    expect(summaryCalls).toBe(calls)
    if (failure === 503) expect(chartBodies[1]).toEqual(chartBodies[0])
    else expect(chartCalls).toBe(1)
    const download = page.waitForEvent('download')
    await exportButton.click()
    await page.getByRole('menuitem', { name: 'CSV', exact: true }).click()
    const stream = await (await download).createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks).toString()).toContain('totals_endpoint')
    expect(errors).toEqual([])
    expect(await page.evaluate(() => (window as unknown as { recoveryRejections: string[] }).recoveryRejections)).toEqual([])
  })
}

test('delayed stale failure cannot overwrite a newer metric and stack', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let release = () => {}
  const gate = new Promise<void>((resolve) => { release = resolve })
  let ranks = 0
  await page.route('**/api/kankaku/totals', async (route) => {
    const body = route.request().postDataJSON()
    if (body.per_page === 6 && ++ranks === 1) {
      await gate
      await route.fulfill({ status: 503, json: { message: 'Stale failure' } })
      return
    }
    const row = { group_key: body.group_by === 'day' ? '0' : 'freshproject001', entries: 1, cost: 3, work_ms: 3600000 }
    const groups = ['project', 'day', 'client'].includes(body.group_by) ? [row] : []
    await route.fulfill({ json: { total: row, groups, total_groups: groups.length, page: 1, total_pages: 1 } })
  })
  try {
    await login(page)
    await expect.poll(() => ranks).toBe(1)
    const chart = page.locator('[data-slot="card"]').filter({ has: page.getByText('Time series', { exact: true }) })
    await expect(chart.getByRole('img')).toHaveCount(0)
    await chart.getByRole('combobox').first().click()
    await page.getByRole('option', { name: 'Cost', exact: true }).click()
    await expect(chart.getByRole('img').first()).toBeVisible()
    await chart.getByRole('combobox').last().click()
    await page.getByRole('option', { name: 'No grouping', exact: true }).click()
    await expect(chart.getByRole('img').first()).toBeVisible()
    release()
    await page.waitForLoadState('networkidle')
    await expect(chart.getByRole('alert')).toHaveCount(0)
    await expect(chart.getByRole('img').first()).toBeVisible()
    expect(errors).toEqual([])
    expect(await page.evaluate(() => (window as unknown as { recoveryRejections: string[] }).recoveryRejections)).toEqual([])
  }
  finally { release() }
})

test('summary failure is distinct and sticky fallback refetches a new range', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let failSummary = false
  let missing = false
  let totalsCalls = 0
  const filters: string[] = []
  await page.route('**/api/kankaku/totals', async (route) => {
    const body = route.request().postDataJSON()
    totalsCalls++
    if (missing || (failSummary && body.group_by === 'none' && body.from)) {
      await route.fulfill({ status: missing ? 404 : 503, json: { message: 'Unavailable' } })
      return
    }
    const row = { group_key: body.group_by === 'day' ? '0' : 'project00000001', entries: 1, work_ms: 3600000, cost: 42 }
    const groups = ['project', 'day'].includes(body.group_by) ? [row] : []
    await route.fulfill({ json: { total: row, groups, total_groups: groups.length, page: 1, total_pages: 1 } })
  })
  await page.route('**/api/collections/task_entries/records?**', async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('perPage') === '2000') filters.push(url.searchParams.get('filter')!)
    await route.fulfill({ json: { page: 1, totalItems: 0, totalPages: 1, items: [] } })
  })
  await login(page)
  const chart = page.locator('[data-slot="card"]').filter({ has: page.getByText('Time series', { exact: true }) })
  await expect(chart.getByRole('img').first()).toBeVisible()
  failSummary = true
  await page.getByRole('button', { name: /\d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}/ }).click()
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  const summaryAlert = page.getByRole('alert').filter({ hasText: 'Could not refresh dashboard summary.' })
  await expect(summaryAlert).toBeVisible()
  await expect(chart.getByRole('alert')).toHaveCount(0)
  await expect(chart.getByRole('img')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled()
  missing = true
  await summaryAlert.getByRole('button', { name: 'Retry' }).click()
  await expect(summaryAlert).toHaveCount(0)
  await expect.poll(() => filters.length).toBe(2)
  const before = totalsCalls
  const oldFilters = [...filters]
  await page.getByRole('button', { name: /\d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}/ }).click()
  await page.getByRole('button', { name: '30 days', exact: true }).click()
  await expect.poll(() => filters.length).toBe(4)
  expect(filters[2]).not.toBe(oldFilters[0])
  expect(totalsCalls).toBe(before)
  expect(errors).toEqual([])
  expect(await page.evaluate(() => (window as unknown as { recoveryRejections: string[] }).recoveryRejections)).toEqual([])
})
