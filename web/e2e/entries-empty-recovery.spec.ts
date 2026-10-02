import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { comboboxList, comboboxTrigger, loginAs, pbOrigin, selectCombobox, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'

const entry = {
  id: 'aaaaaaaaaaaaaaa', session_name: 'Recovered entry', session_id: 'recovered-session',
  started_at: '2026-01-01 10:00:00.000Z', status: 'completed', client: '', project: '', task: '',
  work_ms: 1000, wall_ms: 1000, waiting_ms: 0, cost: 0, input: 0, output: 0,
  cache_read: 0, cache_write: 0, segments: [], agent: 'pi',
}

test.beforeEach(async ({ page }) => {
  if (process.env.PW_BASE_URL !== 'http://127.0.0.1:3003' || pbOrigin() !== 'http://127.0.0.1:8093') throw new Error('Requires owned :3003/:8093 stack')
  await page.route('**/api/collections/*/records**', async route => {
    expect(route.request().method()).toBe('GET')
    await route.continue()
  })
})

for (const grouped of [false, true]) {
  test(`${grouped ? 'Sessions' : 'Entries'} zero results have honest pagination and contextual recovery`, async ({ page }, testInfo) => {
    await page.addInitScript(grouped => {
      localStorage.setItem('kankaku-locale', 'en')
      localStorage.setItem('kankaku-entries-group-by-session', grouped ? '1' : '0')
    }, grouped)
    const reads: URL[] = []
    await page.route('**/api/collections/task_entries/records?**', async route => {
      expect(route.request().method()).toBe('GET')
      const url = new URL(route.request().url())
      // Leave the shell's perPage=1 queue probe untouched.
      if (url.searchParams.get('perPage') === '1') return route.continue()
      reads.push(url)
      await route.fulfill({ json: { page: 1, perPage: 25, totalItems: 0, totalPages: 0, items: [] } })
    })
    await page.route('**/api/kankaku/totals', async route => {
      if (route.request().method() !== 'POST') return route.continue()
      const body = route.request().postDataJSON()
      if (body.group_by !== 'session' || body.per_page !== 25) return route.continue()
      await route.fulfill({ json: { total: {}, groups: [], total_groups: 0, page: 1, total_pages: 0 } })
    })
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
    await page.goto('/entries')
    await expect(page.getByTestId('entries-pagination-count')).toHaveText('0')
    await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled()
    await page.goto('/entries?agent=pi&session_id=empty-session&dateStart=2026-01-01&dateEnd=2026-01-02&client=bookmark-client&task=bookmark-task&keep=yes#ledger')
    await expect(page.getByTestId('entries-pagination-count')).toHaveText('0')
    const clear = page.getByRole('button', { name: 'Clear filters', exact: true })
    await expect(clear).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('empty-before.png') })
    await clear.focus()
    await clear.press('Enter')
    await expect(page.locator('#entries-date-range')).toBeFocused()
    await expect(page.getByTestId('entries-pagination-count')).toHaveText('0')
    await expect(clear).toHaveCount(0)
    expect(new URL(page.url()).search).toBe('?keep=yes')
    expect(new URL(page.url()).hash).toBe('#ledger')
    await expect(page.getByRole('button', { name: grouped ? 'Sessions' : 'Entries', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Remove session filter' })).toHaveCount(0)
    if (!grouped) expect(reads.at(-1)?.searchParams.get('filter') || '').toBe('')
    await page.screenshot({ path: testInfo.outputPath('empty-after.png') })
    await writeFile(testInfo.outputPath('reset-context.json'), JSON.stringify({ url: page.url(), query: Object.fromEntries(new URL(page.url()).searchParams), lastBrowse: reads.at(-1)?.href }, null, 2))
  })
}

test('advanced filters clear together without changing sort or disclosure', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kankaku-locale', 'en')
    localStorage.setItem('kankaku-entries-group-by-session', '0')
  })
  const reads: URL[] = []
  await page.route('**/api/collections/task_entries/records?**', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('perPage') === '1') return route.continue()
    reads.push(url)
    await route.fulfill({ json: { page: 1, totalItems: 0, totalPages: 0, items: [] } })
  })
  await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
  await page.goto('/entries?quality=costUnknown&agent=pi&dateStart=2026-01-01&dateEnd=2026-01-02&session_id=empty&client=bookmark-client&project=bookmark-project&task=bookmark-task&status=completed&model=bookmark-model&machine=bookmark-machine&search=bookmark-search&keep=yes#ledger')
  for (const name of ['Client', 'Project']) {
    await comboboxTrigger(page, name).click()
    await comboboxList(page, name).getByRole('option').nth(1).click()
  }
  await page.getByRole('button', { name: /More filters/ }).click()
  await page.getByLabel('Model', { exact: true }).fill('no-model')
  await page.getByLabel('Machine', { exact: true }).fill('no-machine')
  await page.getByLabel('Prompt search', { exact: true }).fill('no-prompt')
  await selectCombobox(comboboxTrigger(page, 'Status'), 'Completed')
  await expect(page.getByRole('button', { name: /More filters/ })).toHaveText('More filters · 6')
  await page.getByRole('columnheader').filter({ hasText: 'Cost' }).getByRole('button').click()
  await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(page.getByRole('button', { name: /More filters/ })).toHaveText('More filters · 0')
  await expect(page.getByRole('button', { name: /More filters/ })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: 'Sessions', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Entries', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('entries-pagination-count')).toHaveText('0')
  expect(reads.at(-1)?.searchParams.get('filter') || '').toBe('')
  expect(reads.at(-1)?.searchParams.get('sort')).toBe('-cost')
  expect(new URL(page.url()).search).toBe('?keep=yes')
  expect(new URL(page.url()).hash).toBe('#ledger')
  for (const name of ['Client', 'Project', 'Status', 'Agent', 'Measurement quality']) await expect(comboboxTrigger(page, name)).toHaveText('All')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('menuitem', { name: 'CSV', exact: true }).click()
  const stream = await (await download).createReadStream()
  if (!stream) throw new Error('Missing CSV download stream')
  let csv = ''
  for await (const chunk of stream) csv += chunk.toString()
  for (const key of ['client', 'project', 'task', 'status', 'agent', 'quality', 'model', 'machine', 'dateStart', 'dateEnd', 'search', 'session_id']) {
    expect(csv).toContain(`"metadata","${key}","",`)
  }
  expect(csv).toContain('"metadata","sort","\'-cost",')
  expect(reads.at(-1)?.searchParams.get('filter') || '').toBe('')
  expect(reads.at(-1)?.searchParams.get('sort')).toBe('-cost')
})

for (const [locale, label] of [['en', 'Clear filters'], ['es', 'Borrar filtros'], ['ja', 'フィルターをクリア']]) {
  test(`${locale} empty action at 390 does not overflow or confuse loading and failure`, async ({ page }) => {
    await page.addInitScript(locale => {
      localStorage.setItem('kankaku-locale', locale)
      localStorage.setItem('kankaku-entries-group-by-session', '0')
    }, locale)
    await page.setViewportSize({ width: 390, height: 844 })
    let fail = false
    await page.route('**/api/collections/task_entries/records?**', async route => {
      if (new URL(route.request().url()).searchParams.get('perPage') === '1') return route.continue()
      await route.fulfill(fail ? { status: 503, json: { message: 'Unavailable' } } : { json: { page: 1, totalItems: 0, totalPages: 0, items: [] } })
    })
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
    await page.goto('/entries?quality=costUnknown')
    const clear = page.getByRole('button', { name: label, exact: true })
    await expect(clear).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await clear.click()
    await expect(page.getByTestId('entries-pagination-count')).toHaveText('0')
    await expect(page.locator('#entries-date-range')).toBeFocused()
    fail = true
    await page.goto('/entries?quality=costUnknown')
    await expect(page.getByTestId('entries-pagination-count')).toHaveCount(0)
    await expect(clear).toHaveCount(0)
  })
}

test('late pre-clear response cannot overwrite clean results or steal subsequent focus', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kankaku-locale', 'en')
    localStorage.setItem('kankaku-entries-group-by-session', '0')
  })
  let release = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  let pending = false
  await page.route('**/api/collections/task_entries/records?**', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('perPage') === '1') return route.continue()
    const filter = url.searchParams.get('filter') || ''
    if (filter.includes('old-machine')) { pending = true; await gate }
    const items = filter ? [] : [entry]
    await route.fulfill({ json: { page: 1, perPage: 25, totalItems: items.length, totalPages: items.length, items } })
  })
  try {
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
    await page.goto('/entries?quality=costUnknown')
    await page.getByRole('button', { name: /More filters/ }).click()
    await page.getByLabel('Machine', { exact: true }).fill('old-machine')
    await expect.poll(() => pending).toBe(true)
    await page.getByLabel('Machine', { exact: true }).fill('new-machine')
    const clear = page.getByRole('button', { name: 'Clear filters', exact: true })
    await expect(clear).toBeVisible()
    await clear.click()
    await expect(page.getByRole('button', { name: /View entry details: Recovered entry/ })).toBeVisible()
    await page.getByLabel('Machine', { exact: true }).focus()
    release()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('entries-pagination-count')).toHaveText('1 · 1/1')
    await expect(page.getByLabel('Machine', { exact: true })).toBeFocused()
    expect(new URL(page.url()).search).toBe('')
  }
  finally { release() }
})
