import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { comboboxTrigger, loginAs, pbOrigin, selectCombobox, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'

test.use({ hasTouch: true, isMobile: true })

test.beforeEach(async ({ page }) => {
  if (process.env.PW_BASE_URL !== 'http://127.0.0.1:3003' || pbOrigin() !== 'http://127.0.0.1:8093') throw new Error('Requires owned read-only stack')
  await page.route('**/api/**', route => {
    const request = route.request()
    if (request.method() === 'GET' || /auth-with-password|auth-refresh|\/kankaku\/totals/.test(request.url())) return route.continue()
    throw new Error(`Forbidden write: ${request.method()} ${request.url()}`)
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('kankaku-locale', 'en')
    localStorage.setItem('kankaku-color-mode', 'light')
  })
  await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
})

for (const theme of ['light', 'dark']) {
  test(`B actual grouped ledger ${theme}: reflow, same measurements and cached details`, async ({ page }, testInfo) => {
    await page.addInitScript(theme => localStorage.setItem('kankaku-color-mode', theme), theme)
    let nestedReads = 0
    let detailReads = 0
    page.on('request', request => {
      const url = new URL(request.url())
      if (/\/task_entries\/records\//.test(url.pathname)) detailReads++
      if (url.pathname.endsWith('/task_entries/records')) nestedReads++
    })
    await page.goto('/entries')
    const ledger = page.getByTestId('entries-mobile-ledger')
    const first = page.getByTestId('session-group-row').first()
    await expect(first).toBeVisible()
    await expect(page.locator('html')).toHaveClass(new RegExp(theme))
    const mobileWork = await first.getByTestId('mobile-work').textContent()
    const mobileCost = await first.getByTestId('mobile-cost').textContent()
    const telemetry: string[] = []
    page.on('request', request => { if (/\/records|\/kankaku\/totals/.test(request.url())) telemetry.push(request.url()) })
    await page.waitForLoadState('networkidle')
    telemetry.length = 0
    nestedReads = 0 // Exclude the login redirect's dashboard latest-entry read.
    detailReads = 0
    await page.setViewportSize({ width: 1440, height: 1000 })
    const desktop = page.getByTestId('session-group-row').first()
    await expect(desktop.locator('td')).toHaveCount(10)
    await expect(desktop.locator('td').nth(7)).toHaveText(mobileWork!)
    await expect(desktop.locator('td').nth(8)).toHaveText(mobileCost!)
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(first).toBeVisible()
    expect(telemetry).toHaveLength(0)
    const resizeReads = telemetry.length
    const measurements = []
    for (const width of [320, 390, 430, 667]) {
      await page.setViewportSize({ width, height: 844 })
      measurements.push(await ledger.evaluate((element, width) => ({
        width, documentOverflow: document.documentElement.scrollWidth - innerWidth,
        ledgerOverflow: element.scrollWidth - element.clientWidth,
        firstRecordY: element.querySelector('.ledger-record')!.getBoundingClientRect().y,
        controls: [...document.querySelectorAll('[data-testid="entries-filter-layout"] button, [data-testid="entries-filter-actions"] button, .ledger-record button')].filter(el => el.getClientRects().length).slice(0, 9).map(el => {
          const rect = el.getBoundingClientRect()
          return { label: el.textContent, width: rect.width, height: rect.height, segment: el.getAttribute('data-size') === 'segment', groupHeight: el.closest('.control-group')?.getBoundingClientRect().height }
        }),
        metrics: [...element.querySelectorAll('.metric')].slice(0, 2).map(el => ({ text: el.textContent, width: el.clientWidth, scrollWidth: el.scrollWidth })),
      }), width))
      expect(measurements.at(-1)!.documentOverflow).toBe(0)
      expect(measurements.at(-1)!.ledgerOverflow).toBe(0)
      for (const metric of measurements.at(-1)!.metrics) expect(metric.scrollWidth).toBeLessThanOrEqual(metric.width)
      for (const control of measurements.at(-1)!.controls) {
        if (control.segment) {
          expect(control.height).toBe(36)
          expect(control.groupHeight).toBe(44)
        }
        else expect(control.height).toBeGreaterThanOrEqual(44)
        expect(control.width).toBeGreaterThanOrEqual(44)
      }
      await page.screenshot({ path: testInfo.outputPath(`B-actual-${theme}-${width}.png`) })
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: testInfo.outputPath(`B-actual-${theme}-390.png`) })
    const expand = first.locator('button[aria-expanded]')
    if (theme === 'light') {
      await expand.focus()
      await expand.press('Enter')
    }
    else {
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
      await expand.tap()
    }
    const children = page.getByTestId('session-group-entries')
    const origin = children.locator('[data-entry-detail]').first()
    await expect(origin).toBeVisible()
    expect(nestedReads).toBe(1)
    await page.screenshot({ path: testInfo.outputPath(`B-actual-expanded-${theme}-390.png`) })
    await expand.click()
    await expand.click()
    await expect(origin).toBeVisible()
    expect(nestedReads).toBe(1)
    if (theme === 'light') await origin.press('Enter')
    else await origin.tap()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('h2')).toBeFocused()
    await expect(dialog.getByTestId('write-action')).toHaveCount(0)
    expect(detailReads).toBe(1)
    await page.keyboard.press('Escape')
    await expect(origin).toBeFocused()
    const ids = await page.locator('[id]').evaluateAll(elements => elements.map(el => el.id))
    expect(new Set(ids).size).toBe(ids.length)
    await writeFile(testInfo.outputPath('measurements.json'), JSON.stringify({ theme, themeBackground: await page.evaluate(() => getComputedStyle(document.body).backgroundColor), measurements, mobileWork, mobileCost, nestedReads, detailReads, resizeReads }, null, 2))
  })
}

test('flat sorting, mobile More and project relocation preserve focus and query state', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('kankaku-entries-group-by-session', '0'))
  await page.goto('/entries')
  const more = page.locator('#entries-more-filters')
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('#entries-filter-project')).toBeHidden()
  await more.tap()
  await expect(page.locator('#entries-filter-project')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('B-actual-filters-light-390.png') })
  const resizeReads: string[] = []
  page.on('request', request => { if (/\/records|\/kankaku\/totals/.test(request.url())) resizeReads.push(request.url()) })
  await page.waitForLoadState('networkidle')
  resizeReads.length = 0
  for (const id of ['model', 'quality', 'search', 'agent', 'status', 'machine']) {
    const control = page.locator(`#entries-filter-${id}`)
    await control.focus()
    for (const width of [768, 767]) {
      await page.setViewportSize({ width, height: 844 })
      await expect(control).toBeFocused()
    }
  }
  expect(resizeReads).toHaveLength(0)
  const project = page.locator('#entries-filter-project')
  await project.focus()
  await page.setViewportSize({ width: 768, height: 844 })
  await expect(project).toBeFocused()
  await more.click()
  await project.focus()
  await page.setViewportSize({ width: 767, height: 844 })
  await expect(project).toBeFocused()
  await expect(more).toHaveAttribute('aria-expanded', 'true')
  await more.click()
  const reads: string[] = []
  page.on('request', request => { if (request.url().includes('/task_entries/records?')) reads.push(new URL(request.url()).searchParams.get('sort') || '') })
  const ledger = page.getByTestId('entries-mobile-ledger')
  const sort = ledger.getByRole('button', { name: 'Token cost', exact: true })
  await sort.press('Enter')
  await expect(sort.locator('..')).toHaveAttribute('aria-sort', 'descending')
  await expect.poll(() => reads.at(-1)).toBe('-cost')
  await sort.press('Space')
  await expect(sort.locator('..')).toHaveAttribute('aria-sort', 'ascending')
  await expect.poll(() => reads.at(-1)).toBe('cost')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('B-actual-flat-light-390.png') })
  const origin = ledger.locator('[data-entry-detail]').first()
  await expect(origin).toBeVisible()
  await origin.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.setViewportSize({ width: 768, height: 844 })
  await page.keyboard.press('Escape')
  await expect(page.locator('#entries-date-range')).toBeFocused()
})

test('totals unavailable uses existing page groups with no lazy fetch', async ({ page }, testInfo) => {
  await page.route('**/api/kankaku/totals', route => route.fulfill({ status: 404, json: {} }))
  await page.goto('/entries')
  const row = page.getByTestId('session-group-row').first()
  await expect(row).toBeVisible()
  const work = await row.getByTestId('mobile-work').textContent()
  const cost = await row.getByTestId('mobile-cost').textContent()
  let reads = 0
  page.on('request', request => { if (request.url().includes('/task_entries/records')) reads++ })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(page.locator('table tbody tr').first()).toContainText(work!)
  await expect(page.locator('table tbody tr').first()).toContainText(cost!)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('B-actual-fallback-light-390.png') })
  await row.locator('button[aria-expanded]').click()
  await expect(page.getByTestId('session-group-entries').locator('[data-entry-detail]').first()).toBeVisible()
  expect(reads).toBe(0)
})

for (const locale of ['en', 'es', 'ja']) {
  test(`long ${locale} identity and large flat numbers remain readable at narrow widths`, async ({ page }, testInfo) => {
    await page.addInitScript(locale => {
      localStorage.setItem('kankaku-locale', locale)
      localStorage.setItem('kankaku-entries-group-by-session', '0')
    }, locale)
    const name = '非常に長いプロジェクト名 · contexto de medición muy largo · long measurement identity without losing context'
    await page.route(/\/api\/collections\/(clients|projects)\/records\?/, async route => {
      const response = await route.fetch()
      const body = await response.json()
      for (const item of body.items ?? []) item.name = name
      await route.fulfill({ response, json: body })
    })
    await page.route('**/api/collections/task_entries/records?*', async route => {
      const response = await route.fetch()
      const body = await response.json()
      for (const item of body.items ?? []) {
        item.session_name = name
        item.cost = 1234567890123.45
        item.work_ms = 1234567890123
      }
      await route.fulfill({ response, json: body })
    })
    await page.goto('/entries')
    const ledger = page.getByTestId('entries-mobile-ledger')
    await expect(ledger.locator('[data-entry-detail]').first()).toBeVisible()
    const measurements = []
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      const values = await ledger.evaluate((el, width) => ({
        width, documentOverflow: document.documentElement.scrollWidth - innerWidth,
        ledgerOverflow: el.scrollWidth - el.clientWidth,
        metrics: [...el.querySelectorAll('.metric')].slice(0, 2).map(metric => ({ text: metric.textContent, width: metric.clientWidth, scrollWidth: metric.scrollWidth, rect: metric.getBoundingClientRect().toJSON(), overflow: getComputedStyle(metric).overflow, textOverflow: getComputedStyle(metric).textOverflow })),
        context: el.querySelector('.identity')!.textContent,
      }), width)
      expect(values.documentOverflow).toBe(0)
      expect(values.ledgerOverflow).toBe(0)
      for (const metric of values.metrics) {
        expect(metric.scrollWidth).toBeLessThanOrEqual(metric.width)
        expect(metric.textOverflow).not.toBe('ellipsis')
        expect(metric.overflow).not.toBe('hidden')
        expect(metric.rect.x + metric.rect.width).toBeLessThanOrEqual(width)
      }
      expect(values.context).toContain(name)
      measurements.push(values)
    }
    await page.screenshot({ path: testInfo.outputPath(`B-large-${locale}-430.png`) })
    await writeFile(testInfo.outputPath('large-measurements.json'), JSON.stringify(measurements, null, 2))
  })
}

test('seven mobile secondary dimensions stay applied when closed and clear with deep-link context', async ({ page }) => {
  const reads: URL[] = []
  await page.route('**/api/collections/task_entries/records?*', route => {
    reads.push(new URL(route.request().url()))
    return route.fulfill({ json: { page: 1, totalItems: 0, totalPages: 0, items: [] } })
  })
  await page.goto('/entries?quality=costUnknown&agent=pi&session_id=external-session&task=external-task&keep=yes')
  const more = page.locator('#entries-more-filters')
  await expect(more).toHaveText('More filters · 2')
  await expect(page.getByRole('button', { name: 'Sessions', exact: true })).toBeDisabled()
  await more.click()
  const project = comboboxTrigger(page, 'Project')
  await project.click()
  await page.getByRole('listbox').getByRole('option').nth(1).click()
  await selectCombobox(comboboxTrigger(page, 'Status'), 'Completed')
  await page.getByLabel('Model', { exact: true }).fill('mobile-model')
  await page.getByLabel('Machine', { exact: true }).fill('mobile-machine')
  await page.getByLabel('Prompt search', { exact: true }).fill('mobile-search')
  await expect(more).toHaveText('More filters · 7')
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled()
  const filter = reads.at(-1)!.searchParams.get('filter')
  const before = reads.length
  await more.click()
  await page.waitForLoadState('networkidle')
  expect(reads.length).toBe(before)
  await page.setViewportSize({ width: 768, height: 844 })
  await expect(more).toHaveText('More filters · 6')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(more).toHaveText('More filters · 7')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('menuitem', { name: 'CSV', exact: true }).click()
  await download
  expect(reads.at(-1)!.searchParams.get('filter')).toBe(filter)
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(more).toHaveText('More filters · 0')
  expect(new URL(page.url()).search).toBe('?keep=yes')
  await expect(page.getByRole('button', { name: 'Entries', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Sessions', exact: true })).toBeEnabled()
})

test('expanded loading, real error, retry empty and session marker remain distinct from details', async ({ page }) => {
  await page.goto('/entries')
  const first = page.getByTestId('session-group-row').first()
  await expect(first).toBeVisible()
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  let reads = 0
  let detailReads = 0
  page.on('request', request => { if (/\/task_entries\/records\//.test(request.url())) detailReads++ })
  await page.route('**/api/collections/task_entries/records?*', async route => {
    reads++
    if (reads === 1) {
      await gate
      return route.fulfill({ status: 503, json: { message: 'Fixture failure' } })
    }
    return route.fulfill({ json: { page: 1, totalItems: 0, totalPages: 0, items: [] } })
  })
  try {
    await first.locator('button[aria-expanded]').tap()
    const expanded = page.getByTestId('session-group-entries')
    await expect(expanded.getByRole('status')).toHaveText('Loading entries…')
    release()
    await expect(expanded.getByRole('alert')).toBeVisible()
    await expanded.getByRole('button', { name: 'Retry', exact: true }).tap()
    await expect(expanded.getByText('No entries match these filters.')).toBeVisible()
    expect(reads).toBe(2)
    await first.locator('button[aria-expanded]').tap()
    await first.locator('button[aria-expanded]').tap()
    expect(reads).toBe(2)
    await expanded.getByRole('button', { name: /Filter to this session/ }).tap()
    await expect(page.getByRole('button', { name: 'Remove session filter' })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(detailReads).toBe(0)
  }
  finally { release() }
})
