import { expect, test } from '@playwright/test'
import { resolvePreset } from '../app/lib/period'
import { loginAs, pbOrigin, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const allowed = request.method() === 'GET' || (request.method() === 'POST' && (/\/auth-(with-password|refresh)$/.test(path) || path === '/api/kankaku/totals' || path === '/api/realtime'))
    if (!allowed) { await route.abort(); throw new Error(`Forbidden mutation: ${request.method()} ${path}`) }
    await route.continue()
  })
})

// Read-only: authenticate the seeded viewer; never create or update PB records.
for (const width of [1440, 390]) {
  test(`Entries filter labels and separate export region at ${width}px`, async ({ page }) => {
    const isolated = (process.env.PW_BASE_URL === 'http://127.0.0.1:3002' && pbOrigin() === 'http://127.0.0.1:8092')
      || (process.env.PW_BASE_URL === 'http://127.0.0.1:3003' && pbOrigin() === 'http://127.0.0.1:8093')
    if (!isolated) throw new Error('Run this read-only spec only against an isolated seeded :3002/:8092 or :3003/:8093 stack')
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('kankaku-locale', 'en')
      localStorage.setItem('kankaku-entries-group-by-session', '0')
    })
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
    await page.goto('/entries')
    const layout = page.getByTestId('entries-filter-layout')
    const controls = layout
    const actions = page.getByTestId('entries-filter-actions')
    const exportButton = actions.getByRole('button', { name: 'Export', exact: true })
    await expect(exportButton).toBeEnabled()
    const period = resolvePreset('30d')
    const range = controls.getByRole('button', { name: `Date range: ${period.start} → ${period.end}`, exact: true })
    await expect(range).toHaveCount(1)
    await expect(controls.locator('label[for="entries-date-range"]')).toHaveText('Date range')
    await expect(page.getByLabel('Start', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('End', { exact: true })).toHaveCount(0)
    await range.click()
    await expect(page.getByLabel('Start', { exact: true })).toBeVisible()
    await expect(page.getByLabel('End', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(range).toBeFocused()
    await page.getByRole('button', { name: 'More filters · 0', exact: true }).click()
    for (const [id, text] of [['entries-filter-model', 'Model'], ['entries-filter-machine', 'Machine'], ['entries-filter-search', 'Prompt search']]) {
      const label = controls.locator(`label[for="${id}"]`)
      await expect(label).toHaveText(text!)
      await expect(label).toBeVisible()
      const input = page.getByRole('textbox', { name: text, exact: true })
      await expect(input).toHaveAttribute('id', id!)
      const labelBox = await label.boundingBox()
      const inputBox = await input.boundingBox()
      expect(labelBox!.height).toBeGreaterThan(8)
      expect(labelBox!.y + labelBox!.height).toBeLessThanOrEqual(inputBox!.y)
    }
    await expect(page.getByLabel('Model', { exact: true })).toHaveAttribute('placeholder', 'Model')
    await expect(page.getByLabel('Machine', { exact: true })).toHaveAttribute('placeholder', 'Machine')
    await expect(page.getByLabel('Prompt search', { exact: true })).toHaveAttribute('placeholder', 'Search in prompt…')
    await page.getByRole('button', { name: 'Sessions', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Sessions', exact: true })).toHaveAttribute('aria-pressed', 'true')
    for (const [id, text] of [['entries-filter-model', 'Model'], ['entries-filter-search', 'Prompt search']]) {
      await expect(controls.locator(`label[for="${id}"]`)).toBeVisible()
      await expect(page.getByRole('textbox', { name: text, exact: true })).toBeDisabled()
    }
    await expect(page.getByLabel('Machine', { exact: true })).toBeEnabled()
    const filterBox = (await page.getByTestId('entries-filter-controls').boundingBox())!
    const actionBox = (await actions.boundingBox())!
    const exportBox = (await exportButton.boundingBox())!
    expect(exportBox.x + exportBox.width).toBeCloseTo(actionBox.x + actionBox.width, 0)
    if (width === 1440) {
      expect(actionBox.x - (filterBox.x + filterBox.width)).toBeGreaterThanOrEqual(12)
      expect(await actions.evaluate(el => parseFloat(getComputedStyle(el).borderLeftWidth))).toBe(0)
    }
    else {
      expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(filterBox.y)
      expect(exportBox.height).toBeGreaterThanOrEqual(44)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await layout.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      for (const box of [filterBox, actionBox, exportBox]) {
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
      }
    }
  })
}
