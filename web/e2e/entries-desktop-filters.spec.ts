import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { comboboxTrigger, loginAs, pbOrigin, selectCombobox, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'

test.beforeEach(async ({ page }) => {
  if (process.env.PW_BASE_URL !== 'http://127.0.0.1:3003' || pbOrigin() !== 'http://127.0.0.1:8093') throw new Error('Requires the owned read-only :3003/:8093 stack')
  await page.route('**/api/collections/*/records**', async route => {
    expect(route.request().method()).toBe('GET')
    await route.continue()
  })
})

test('disclosure preserves active filters, export snapshot, focus, and mode guards', async ({ page }) => {
  const reads: URL[] = []
  await page.route('**/api/collections/task_entries/records?*', async route => {
    expect(route.request().method()).toBe('GET')
    const url = new URL(route.request().url())
    reads.push(url)
    await route.fulfill({ json: { page: 1, perPage: Number(url.searchParams.get('perPage')), totalItems: 0, totalPages: 1, items: [] } })
  })
  await page.addInitScript(() => localStorage.setItem('kankaku-locale', 'en'))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
  await page.goto('/entries?quality=waitingUnavailable&agent=pi&session_id=deep-link-session')
  const sessions = page.getByRole('button', { name: 'Sessions', exact: true })
  const disclosure = page.getByRole('button', { name: /More filters/ })
  await expect(sessions).toBeDisabled()
  await expect(sessions).toHaveAttribute('aria-pressed', 'false')
  await expect(disclosure).toHaveText('More filters · 2')
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  await expect(disclosure).toHaveAttribute('aria-controls', 'entries-advanced-filters')
  await expect(page.locator('#entries-advanced-filters')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Remove session filter' })).toBeVisible()
  await expect(page.locator('#entries-grouping-notice')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled()
  const before = reads.length
  await disclosure.focus()
  await disclosure.press('Enter')
  await expect(disclosure).toBeFocused()
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  await page.waitForLoadState('networkidle')
  expect(reads.length).toBe(before)
  await page.getByLabel('Model', { exact: true }).fill('desktop-model')
  await page.getByLabel('Prompt search', { exact: true }).fill(' ')
  await selectCombobox(comboboxTrigger(page, 'Status'), 'Completed')
  await page.getByLabel('Machine', { exact: true }).fill('desktop-machine')
  await expect(disclosure).toHaveText('More filters · 6')
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled()
  const applied = reads.at(-1)!.searchParams.get('filter')
  expect(applied).toContain('desktop-model')
  expect(applied).toContain('desktop-machine')
  expect(applied).toContain('deep-link-session')
  const count = reads.length
  await disclosure.click()
  await expect(disclosure).toBeFocused()
  await expect(page.locator('#entries-advanced-filters')).toBeHidden()
  await page.waitForLoadState('networkidle')
  expect(reads.length).toBe(count)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('menuitem', { name: 'CSV', exact: true }).click()
  await download
  expect(reads.at(-1)!.searchParams.get('filter')).toBe(applied)
  await disclosure.click()
  await page.getByLabel('Model', { exact: true }).fill('')
  await expect(disclosure).toHaveText('More filters · 5')
  await selectCombobox(comboboxTrigger(page, 'Measurement quality'), 'All')
  await expect(disclosure).toHaveText('More filters · 4')
  await page.getByLabel('Prompt search', { exact: true }).fill('')
  await expect(disclosure).toHaveText('More filters · 3')
  await selectCombobox(comboboxTrigger(page, 'Agent'), 'All')
  await expect(disclosure).toHaveText('More filters · 2')
  await selectCombobox(comboboxTrigger(page, 'Status'), 'All')
  await expect(disclosure).toHaveText('More filters · 1')
  await page.getByLabel('Machine', { exact: true }).fill('')
  await expect(disclosure).toHaveText('More filters · 0')
  await expect(sessions).toBeEnabled()
  await sessions.click()
  await expect(sessions).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Model', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('Measurement quality', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('Prompt search', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('Machine', { exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Entries', exact: true }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('kankaku-entries-group-by-session'))).toBe('0')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Entries', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
})

test('breakpoint relocation restores only valid filter focus and preserves values', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('kankaku-locale', 'en'))
  await page.setViewportSize({ width: 767, height: 1000 })
  await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
  await page.goto('/entries')
  await page.getByRole('button', { name: 'More filters · 0', exact: true }).click()
  const machine = page.getByLabel('Machine', { exact: true })
  const date = page.locator('#entries-date-range')
  await machine.fill('focus-machine')
  await page.waitForLoadState('networkidle')
  const reads: string[] = []
  page.on('request', request => {
    if (request.url().includes('/records') || request.url().includes('/kankaku/totals')) reads.push(request.url())
  })
  await machine.focus()
  await page.setViewportSize({ width: 768, height: 1000 })
  await expect(machine).toBeFocused()
  await expect(page.locator('#entries-advanced-filters')).toBeVisible()
  await expect(machine).toHaveValue('focus-machine')
  await page.setViewportSize({ width: 767, height: 1000 })
  await expect(machine).toBeFocused()
  await expect(machine).toHaveValue('focus-machine')
  await page.waitForLoadState('networkidle')
  expect(reads).toHaveLength(0)
  await date.click()
  await page.getByRole('button', { name: '7 days', exact: true }).click()
  await page.keyboard.press('Escape')
  const dateValue = await date.textContent()
  for (const width of [768, 767]) {
    await date.focus()
    await page.setViewportSize({ width, height: 1000 })
    await expect(date).toBeFocused()
    await expect(date).toHaveText(dateValue!)
    await expect(machine).toHaveValue('focus-machine')
  }
  await page.screenshot({ path: testInfo.outputPath('focus-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 768, height: 1000 })
  await expect(date).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('focus-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: 'Sessions', exact: true }).focus()
  await page.setViewportSize({ width: 767, height: 1000 })
  await expect(page.getByRole('button', { name: 'Sessions', exact: true })).toBeFocused()
  await page.setViewportSize({ width: 768, height: 1000 })
  await expect(page.locator('#entries-more-filters')).toBeVisible()
  await page.locator('#entries-more-filters').focus()
  await expect(page.locator('#entries-more-filters')).toBeFocused()
  await page.setViewportSize({ width: 767, height: 1000 })
  await expect(page.locator('#entries-more-filters')).toBeFocused()
  const outside = page.getByRole('button', { name: 'Theme', exact: true })
  await outside.focus()
  await page.setViewportSize({ width: 768, height: 1000 })
  await expect(outside).toBeFocused()
  await outside.evaluate(el => (el as HTMLElement).blur())
  await page.setViewportSize({ width: 767, height: 1000 })
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
})

for (const [locale, theme, width, rich = false] of [
  ['es', 'light', 1440], ['es', 'dark', 1440], ['es', 'light', 1280], ['es', 'dark', 1280],
  ['en', 'light', 1280], ['ja', 'dark', 1280], ['en', 'light', 390],
  ['es', 'light', 1440, true], ['es', 'dark', 1440, true],
  ['es', 'light', 1280, true], ['es', 'dark', 1280, true],
] as const) {
  test(`real ledger ${locale} ${theme} ${width}${rich ? ' rich' : ''}`, async ({ page }, testInfo) => {
    if (rich) {
      // Read-only response projection creates wide catalog cells, not records.
      await page.route(/\/api\/collections\/(projects|tasks)\/records/, async route => {
        expect(route.request().method()).toBe('GET')
        const response = await route.fetch()
        const body = await response.json()
        for (const item of body.items ?? []) {
          if (item.name) item.name += ' — extended measurement project context for overflow'
          if (item.title) item.title += ' — detailed measurement task context for overflow'
        }
        await route.fulfill({ response, json: body })
      })
    }
    await page.setViewportSize({ width, height: 1000 })
    await page.addInitScript(({ locale, theme }) => {
      localStorage.setItem('kankaku-locale', locale)
      localStorage.setItem('kankaku-color-mode', theme)
      localStorage.removeItem('kankaku-entries-group-by-session')
    }, { locale, theme })
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
    await page.goto('/entries')
    const layout = page.getByTestId('entries-filter-layout')
    await expect(layout).toBeVisible()
    await expect(page.locator('html')).toHaveClass(new RegExp(theme))
    await expect(page.getByTestId('session-group-row').first()).toBeVisible()
    const more = page.locator('button[aria-controls="entries-advanced-filters"]')
    if (width >= 768) {
      await expect(page.getByRole('switch')).toHaveCount(0)
      await expect(layout.getByRole('group').getByRole('button').first()).toHaveAttribute('aria-pressed', 'true')
      await expect(more).toHaveAttribute('aria-expanded', 'false')
      await expect(page.locator('#entries-advanced-filters')).toBeHidden()
      const names = await layout.getByTestId('entries-filter-controls').getByRole('button').all()
      expect(await names[0]!.getAttribute('id')).toBe('entries-date-range')
      await page.screenshot({ path: testInfo.outputPath('collapsed.png'), fullPage: true })
      await more.click()
      await expect(page.locator('#entries-advanced-filters')).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath('expanded.png'), fullPage: true })
    }
    else {
      const mobileOrder = await layout.getByTestId('entries-filter-controls').locator('button[id], input[id]').evaluateAll(elements => elements.map(el => el.id))
      expect(mobileOrder).toEqual(['entries-date-range', 'entries-filter-client', 'entries-more-filters'])
      await expect(more).toBeVisible()
      await expect(page.getByRole('switch')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Sessions', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await more.click()
      await expect(page.locator('#entries-date-range')).toBeVisible()
      for (const id of ['client', 'project', 'status', 'agent', 'quality', 'model', 'machine', 'search']) {
        await expect(page.locator(`#entries-filter-${id}`)).toBeVisible()
        await expect(page.locator(`label[for="entries-filter-${id}"]`)).toBeVisible()
      }
      await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true })
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await layout.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    if (width < 768) {
      await expect(page.locator('table')).toHaveCount(0)
      expect(await page.getByTestId('entries-mobile-ledger').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      return
    }
    const table = page.locator('table').first()
    expect(await table.evaluate(el => {
      let parent = el.parentElement
      while (parent && getComputedStyle(parent).overflowX !== 'auto') parent = parent.parentElement
      return !!parent && parent.scrollWidth >= parent.clientWidth
    })).toBe(true)
    await expect(page.locator('#entries-date-range')).toHaveCount(1)
    const expanders = table.locator('button[aria-controls^="session-group-entries-"]')
    expect(await expanders.count()).toBe(await table.locator('tbody > tr').count())
    if (width >= 768) {
      const geometry = await table.evaluate(el => {
        let parent = el.parentElement
        while (parent && getComputedStyle(parent).overflowX !== 'auto') parent = parent.parentElement
        const container = parent!.getBoundingClientRect()
        const cells = [...el.querySelectorAll('thead .entries-expander, tbody > tr[data-testid="session-group-row"] > .entries-expander')]
        return {
          scrollLeft: parent!.scrollLeft,
          columns: el.querySelectorAll('thead > tr > th').length,
          container: { left: container.left, right: container.right },
          cells: cells.map(cell => {
            const rect = (cell.querySelector('button') ?? cell).getBoundingClientRect()
            return { left: rect.left, right: rect.right, background: getComputedStyle(cell).backgroundColor, sticky: getComputedStyle(cell).position }
          }),
        }
      })
      expect(geometry.scrollLeft).toBe(0)
      expect(geometry.columns).toBe(10)
      expect(geometry.cells.length).toBe(await expanders.count() + 1)
      for (const cell of geometry.cells) {
        expect(cell.left).toBeGreaterThanOrEqual(geometry.container.left)
        expect(cell.right).toBeLessThanOrEqual(geometry.container.right)
        expect(cell.sticky).toBe('sticky')
        expect(cell.background).not.toBe('rgba(0, 0, 0, 0)')
        expect(cell.background).not.toContain(' / ')
      }
      const geometryPath = testInfo.outputPath('default-visible-geometry.json')
      await writeFile(geometryPath, JSON.stringify(geometry, null, 2))
      await testInfo.attach('default-visible-geometry', { path: geometryPath, contentType: 'application/json' })
    }
  })
}
