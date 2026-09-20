import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.describe('command palette keyboard navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    // The shortcut listener mounts with the app shell; retry until it is live.
    await expect(async () => {
      if (!(await page.getByRole('dialog').isVisible())) await page.keyboard.press('ControlOrMeta+k')
      await expect(page.getByRole('dialog').getByRole('combobox')).toBeFocused({ timeout: 1000 })
    }).toPass({ timeout: 10000 })
  })

  const selected = (page: import('@playwright/test').Page) => page.getByRole('dialog').locator('[role="option"][aria-selected="true"]')

  test('arrow keys move the active option and wrap around', async ({ page }) => {
    const options = page.getByRole('dialog').getByRole('option')
    const count = await options.count()
    expect(count).toBeGreaterThan(2)

    await expect(selected(page)).toHaveCount(1)
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true')

    await page.keyboard.press('ArrowDown')
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect(options.nth(count - 1)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowDown')
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('End')
    await expect(options.nth(count - 1)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Home')
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true')

    // Focus stays in the input the whole time, so typing keeps working.
    await expect(page.getByRole('dialog').getByRole('combobox')).toBeFocused()
  })

  test('the combobox points at the active option for assistive tech', async ({ page }) => {
    await page.keyboard.press('ArrowDown')
    const activeId = await page.getByRole('dialog').getByRole('combobox').getAttribute('aria-activedescendant')
    expect(activeId).toBeTruthy()
    await expect(page.locator(`#${activeId}`)).toHaveAttribute('aria-selected', 'true')
  })

  test('typing resets to the first result and Enter opens the active one', async ({ page }) => {
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.getByRole('dialog').getByRole('combobox').fill('Cajamar')
    await expect(page.getByRole('dialog').getByRole('option').nth(0)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog').getByRole('combobox')).toHaveCount(0)
    await expect(page).toHaveURL(/\/clients\?highlight=/)
  })

  test('arrow + Enter navigates to a page', async ({ page }) => {
    const second = await page.getByRole('dialog').getByRole('option').nth(1).innerText()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/clients$/)
    expect(second.trim().length).toBeGreaterThan(0)
  })

  test('a long result list scrolls the active option into view', async ({ page }) => {
    await page.getByRole('dialog').getByRole('combobox').fill('a')
    const count = await page.getByRole('dialog').getByRole('option').count()
    expect(count).toBeGreaterThan(8)
    await page.keyboard.press('End')
    const last = page.getByRole('dialog').getByRole('option').nth(count - 1)
    await expect(last).toHaveAttribute('aria-selected', 'true')
    await expect(last).toBeInViewport()
  })
})

test('the palette input has no background of its own', async ({ page }) => {
  await login(page)
  await expect(async () => {
    if (!(await page.getByRole('dialog').isVisible())) await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByRole('dialog').getByRole('combobox')).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10000 })
  const bg = await page.getByRole('dialog').getByRole('combobox').evaluate(el => getComputedStyle(el).backgroundColor)
  expect(bg).toBe('rgba(0, 0, 0, 0)')
})

test('modal overlays blur the page behind them', async ({ page }) => {
  await login(page)
  await expect(async () => {
    if (!(await page.getByRole('dialog').isVisible())) await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10000 })
  const overlay = await page.evaluate(() => {
    const el = [...document.querySelectorAll<HTMLElement>('.fixed.inset-0')].find(e => getComputedStyle(e).backdropFilter !== 'none')
    return el ? { filter: getComputedStyle(el).backdropFilter, bg: getComputedStyle(el).backgroundColor } : null
  })
  expect(overlay?.filter).toContain('blur')
})
