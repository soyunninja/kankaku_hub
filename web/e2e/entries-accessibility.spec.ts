import { expect, test } from '@playwright/test'
import { loginAs, pbOrigin, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'

const entries = ['aaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbb'].map((id, index) => ({
  id, session_name: `Accessible entry ${index + 1}`, session_id: `accessible-session-${index}`,
  started_at: '2026-09-20 10:00:00.000Z', status: 'completed', client: '', project: '', task: '',
  work_ms: 1000, wall_ms: 1000, waiting_ms: 0, cost: 0, input: 0, output: 0, cache_read: 0,
  cache_write: 0, segments: [], agent: 'pi',
}))

test.beforeEach(async ({ page }) => {
  if (process.env.PW_BASE_URL !== 'http://127.0.0.1:3003' || pbOrigin() !== 'http://127.0.0.1:8093') throw new Error('Requires owned read-only stack')
  await page.route('**/api/collections/*/records**', async route => {
    expect(route.request().method()).toBe('GET')
    await route.continue()
  })
  await page.route('**/api/collections/task_entries/records?*', route => route.fulfill({ json: { page: 1, perPage: 25, totalItems: 2, totalPages: 1, items: entries } }))
  await page.route('**/api/collections/work_records/records?*', route => route.fulfill({ json: { page: 1, perPage: 200, totalItems: 0, totalPages: 1, items: [] } }))
  await page.addInitScript(() => {
    localStorage.setItem('kankaku-locale', 'en')
    localStorage.setItem('kankaku-entries-group-by-session', '0')
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
})

test('keyboard sorting and detail focus retain dense columns and viewer permissions', async ({ page }, testInfo) => {
  const sorts: string[] = []
  let detailReads = 0
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname.endsWith('/task_entries/records')) sorts.push(url.searchParams.get('sort') || '')
  })
  await page.route('**/api/collections/task_entries/records/*', route => {
    detailReads++
    return route.fulfill({ json: entries.find(entry => route.request().url().includes(entry.id)) })
  })
  await page.goto('/entries')
  await expect(page.locator('thead th')).toHaveCount(8)
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(page.locator('thead th')).toHaveCount(8)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`desktop-flat-${width}.png`) })
  }
  for (const [label, field] of [['Started', 'started_at'], ['Time', 'work_ms'], ['Cost', 'cost']]) {
    const button = page.locator('thead').getByRole('button', { name: label, exact: true })
    await button.focus()
    await button.press('Enter')
    await expect(button.locator('..')).toHaveAttribute('aria-sort', field === 'started_at' ? 'ascending' : 'descending')
    await expect.poll(() => sorts.at(-1)).toBe(field === 'started_at' ? field : `-${field}`)
    await button.press('Space')
    await expect(button.locator('..')).toHaveAttribute('aria-sort', field === 'started_at' ? 'descending' : 'ascending')
  }
  const origin = page.getByRole('button', { name: /View entry details: Accessible entry 1/ })
  await origin.focus()
  await origin.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Accessible entry 1' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('h2')).toBeFocused()
  expect(await dialog.evaluate(element => [element.getAttribute('aria-labelledby'), element.getAttribute('aria-describedby')].every(ids => ids?.split(' ').every(id => !!document.getElementById(id))))).toBe(true)
  await expect(dialog.getByTestId('write-action')).toHaveCount(0)
  expect(detailReads).toBe(1)
  await page.keyboard.press('Escape')
  await expect(origin).toBeFocused()
  await expect(page.getByRole('button', { name: 'Remove session filter' })).toHaveCount(0)
})

test('pending close, stale response, loading name and retry remain safe', async ({ page }, testInfo) => {
  let release: (() => void) | undefined
  let fail = true
  await page.route('**/api/collections/task_entries/records/*', async route => {
    if (route.request().url().includes(entries[0]!.id)) {
      await new Promise<void>(resolve => { release = resolve })
      await route.fulfill({ json: entries[0] })
    }
    else if (fail) await route.fulfill({ status: 500, json: { message: 'Fixture failure' } })
    else await route.fulfill({ json: entries[1] })
  })
  await page.goto('/entries')
  const first = page.getByRole('button', { name: /View entry details: Accessible entry 1/ })
  await first.focus()
  await first.press('Space')
  const loading = page.getByRole('dialog', { name: 'Entry details' })
  await expect(loading.getByRole('status')).toHaveText('Loading entry details…')
  await expect(loading.locator('h2')).toBeFocused()
  expect(await loading.evaluate(element => [element.getAttribute('aria-labelledby'), element.getAttribute('aria-describedby')].every(ids => ids?.split(' ').every(id => !!document.getElementById(id))))).toBe(true)
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await loading.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)))
  await page.screenshot({ path: `${testInfo.outputDir}/loading-light.png` })
  await page.keyboard.press('Escape')
  await expect(first).toBeFocused()
  await page.getByRole('button', { name: /View entry details: Accessible entry 2/ }).press('Enter')
  await expect(loading.getByRole('alert')).toBeVisible()
  fail = false
  await loading.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Accessible entry 2' })).toBeVisible()
  release?.()
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('dialog', { name: 'Accessible entry 2' })).toBeVisible()
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.screenshot({ path: `${testInfo.outputDir}/detail-dark.png` })
})

test('nested keyboard details preserve session filtering and column shapes', async ({ page }, testInfo) => {
  let reads = 0
  await page.route('**/api/collections/task_entries/records/*', route => {
    reads++
    return route.fulfill({ json: entries[0] })
  })
  await page.goto('/entries')
  await page.getByRole('button', { name: 'Sessions', exact: true }).press('Enter')
  const row = page.getByTestId('session-group-row').first()
  await expect(row.locator('td')).toHaveCount(10)
  const toggle = row.getByRole('button', { name: 'Session entries' })
  await toggle.focus()
  await toggle.press('Enter')
  const nested = page.getByTestId('session-group-entries').first()
  await expect(nested.locator('thead th')).toHaveCount(4)
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(page.locator('table').first().locator(':scope > thead > tr > th')).toHaveCount(10)
    await expect(nested.locator('thead th')).toHaveCount(4)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`desktop-expanded-${width}.png`) })
  }
  const origin = nested.getByRole('button', { name: /View entry details: Accessible entry 1/ })
  await origin.focus()
  await origin.press('Space')
  await expect(page.getByRole('dialog', { name: 'Accessible entry 1' }).locator('h2')).toBeFocused()
  expect(reads).toBe(1)
  await page.keyboard.press('Escape')
  await expect(origin).toBeFocused()
  await expect(page.getByRole('button', { name: 'Remove session filter' })).toHaveCount(0)
  await row.getByRole('button').first().press('Enter')
  await expect(page.getByRole('button', { name: 'Remove session filter' })).toBeVisible()
  expect(reads).toBe(1)
})

test('late raw records cannot replace a reopened entry or steal interacting focus', async ({ page }) => {
  let release: (() => void) | undefined
  await page.route('**/api/collections/task_entries/records/*', route => route.fulfill({ json: entries.find(entry => route.request().url().includes(entry.id)) }))
  await page.route('**/api/collections/work_records/records?*', async route => {
    const filter = new URL(route.request().url()).searchParams.get('filter') || ''
    if (filter.includes(entries[0]!.id)) await new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ json: { page: 1, perPage: 200, totalItems: 1, totalPages: 1, items: [{ id: filter.includes(entries[0]!.id) ? 'raw-a' : 'raw-b', model: filter.includes(entries[0]!.id) ? 'STALE RAW A' : 'CURRENT RAW B', status: 'completed', role: 'orchestrator', work_ms: 1000 }] } })
  })
  await page.goto('/entries')
  await page.getByRole('button', { name: /View entry details: Accessible entry 1/ }).press('Enter')
  await expect.poll(() => !!release).toBe(true)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /View entry details: Accessible entry 2/ }).press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Accessible entry 2' })
  await expect(dialog.getByText('CURRENT RAW B')).toBeVisible()
  const technical = dialog.getByRole('button', { name: 'Technical details' })
  await technical.focus()
  release?.()
  await page.waitForLoadState('networkidle')
  await expect(technical).toBeFocused()
  await expect(dialog.getByText('STALE RAW A')).toHaveCount(0)
  await expect(dialog.getByText('CURRENT RAW B')).toBeVisible()
})
