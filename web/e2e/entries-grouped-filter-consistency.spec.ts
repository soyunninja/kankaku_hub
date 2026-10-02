import { expect, test } from '@playwright/test'
import { comboboxTrigger, loginAs, pbOrigin, selectCombobox, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'

// Viewer login only; all Entries responses are synthetic and no records are written.
test('unsupported filters keep flat browse and export consistent until cleared', async ({ page }) => {
  const isolated = (process.env.PW_BASE_URL === 'http://127.0.0.1:3002' && pbOrigin() === 'http://127.0.0.1:8092')
    || (process.env.PW_BASE_URL === 'http://127.0.0.1:3003' && pbOrigin() === 'http://127.0.0.1:8093')
  if (!isolated) throw new Error('Use an isolated seeded :3002/:8092 or :3003/:8093 stack')
  const browse: URL[] = []
  const exports: URL[] = []
  let groupedRequests = 0
  await page.route('**/api/kankaku/totals', async (route) => {
    const body = route.request().postDataJSON()
    if (body.group_by !== 'session') return route.continue()
    // The app shell also requests session totals for its queue badge, not Entries browse.
    const queueCount = body.per_page === 1
      && body.filters?.without_task === true
      && body.filters?.session_fully_unassigned === true
    if (!queueCount) groupedRequests++
    await route.fulfill({ json: { groups: [], total: {}, total_groups: 0, total_pages: 1, page: 1, per_page: 25 } })
  })
  await page.route('**/api/collections/task_entries/records?*', async (route) => {
    expect(route.request().method()).toBe('GET')
    const url = new URL(route.request().url())
    const perPage = Number(url.searchParams.get('perPage'))
    if (perPage === 25) browse.push(url)
    if (perPage === 500) exports.push(url)
    await route.fulfill({ json: { page: 1, perPage, totalItems: 0, totalPages: 1, items: [] } })
  })
  await page.addInitScript(() => {
    localStorage.setItem('kankaku-locale', 'en')
    localStorage.setItem('kankaku-entries-group-by-session', '1')
  })
  await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
  await page.goto('/entries?quality=waitingUnavailable&dateStart=2026-01-01&dateEnd=2026-01-31&agent=pi')
  const toggle = page.getByRole('button', { name: 'Sessions', exact: true })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'More filters · 2', exact: true }).click()
  await expect(toggle).toBeDisabled()
  await expect(page.locator('#entries-grouping-notice')).toContainText('Flat view is required')
  const csv = page.getByRole('button', { name: 'Export', exact: true })
  await expect(csv).toBeEnabled()
  expect(groupedRequests).toBe(0)
  expect(browse.at(-1)!.searchParams.get('filter')).toContain('waiting_quality = "unavailable"')

  await page.getByPlaceholder('Model', { exact: true }).fill('consistency-model')
  await page.getByPlaceholder('Search in prompt…', { exact: true }).fill('consistency-search')
  await expect.poll(() => browse.at(-1)?.searchParams.get('filter')).toContain('consistency-search')
  await expect(csv).toBeEnabled()
  const filter = browse.at(-1)!.searchParams.get('filter')
  expect(filter).toContain('model = "consistency-model"')
  expect(filter).toContain('agent = "pi"')
  expect(filter).toContain('started_at >=')
  expect(filter).toContain('started_at <=')
  const download = page.waitForEvent('download')
  await csv.click()
  await page.getByRole('menuitem', { name: 'CSV', exact: true }).click()
  await download
  expect(exports.at(-1)!.searchParams.get('filter')).toBe(filter)
  await expect(toggle).toBeDisabled()
  expect(groupedRequests).toBe(0)
  await expect(page.getByPlaceholder('Model', { exact: true })).toHaveValue('consistency-model')
  await expect(page.getByPlaceholder('Search in prompt…', { exact: true })).toHaveValue('consistency-search')

  await selectCombobox(comboboxTrigger(page, 'Measurement quality'), 'All')
  await page.getByPlaceholder('Model', { exact: true }).fill('')
  await expect(toggle).toBeDisabled() // Search alone still blocks grouping.
  expect(groupedRequests).toBe(0)
  await page.getByPlaceholder('Search in prompt…', { exact: true }).fill('')
  await expect(toggle).toBeEnabled()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('#entries-grouping-notice')).toHaveCount(0)
  await expect.poll(() => browse.at(-1)?.searchParams.get('filter')).not.toContain('consistency-search')
  const supported = browse.at(-1)!.searchParams.get('filter')
  expect(supported).toContain('agent = "pi"')
  expect(supported).toContain('started_at >=')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => groupedRequests).toBe(1)
  await page.getByRole('button', { name: 'Entries', exact: true }).click()
  await expect(csv).toBeEnabled()
  await expect.poll(() => browse.at(-1)?.searchParams.get('filter')).toBe(supported)
})
