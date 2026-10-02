import { expect, test } from '@playwright/test'
import { loginAs, pbOrigin, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'

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
    const controls = page.getByTestId('entries-filter-controls')
    const actions = page.getByTestId('entries-filter-actions')
    const exportButton = actions.getByRole('button', { name: 'Export', exact: true })
    await expect(exportButton).toBeEnabled()
    const range = controls.getByRole('button', { name: 'Date range: All time', exact: true })
    await expect(range).toHaveCount(1)
    await expect(controls.locator('label[for="entries-date-range"]')).toHaveText('Date range')
    await expect(page.getByLabel('Start', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('End', { exact: true })).toHaveCount(0)
    await range.click()
    await expect(page.getByLabel('Start', { exact: true })).toBeVisible()
    await expect(page.getByLabel('End', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(range).toBeFocused()
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
    await page.getByRole('switch', { name: 'Group by session' }).click()
    await expect(page.getByRole('switch', { name: 'Group by session' })).toBeChecked()
    for (const [id, text] of [['entries-filter-model', 'Model'], ['entries-filter-search', 'Prompt search']]) {
      await expect(controls.locator(`label[for="${id}"]`)).toBeVisible()
      await expect(page.getByRole('textbox', { name: text, exact: true })).toBeDisabled()
    }
    await expect(page.getByLabel('Machine', { exact: true })).toBeEnabled()
    expect(await layout.evaluate(el => el.lastElementChild?.getAttribute('data-testid'))).toBe('entries-filter-actions')
    const filterBox = (await controls.boundingBox())!
    const actionBox = (await actions.boundingBox())!
    const exportBox = (await exportButton.boundingBox())!
    expect(exportBox.x + exportBox.width).toBeCloseTo(actionBox.x + actionBox.width, 0)
    if (width === 1440) {
      expect(actionBox.x - (filterBox.x + filterBox.width)).toBeGreaterThanOrEqual(12)
      expect(await actions.evaluate(el => parseFloat(getComputedStyle(el).borderLeftWidth))).toBeGreaterThan(0)
    }
    else {
      expect(actionBox.y - (filterBox.y + filterBox.height)).toBeGreaterThanOrEqual(12)
      expect(await actions.evaluate(el => parseFloat(getComputedStyle(el).borderTopWidth))).toBeGreaterThan(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await layout.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      for (const box of [filterBox, actionBox, exportBox]) {
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
      }
    }
  })
}
