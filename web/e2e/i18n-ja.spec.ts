import { expect, test } from '@playwright/test'
import { login } from './helpers'

/**
 * Japanese locale support: switching via the header dropdown, `<html
 * lang>` following the active locale, Japanese-language nav and KPI
 * duration units, persistence across reload, and no horizontal overflow
 * at mobile width on the screens most likely to break with longer/taller
 * Japanese labels. Mirrors the existing Spanish-language assertion in
 * e2e/polish.spec.ts ("unassigned queue is translated in Spanish") and
 * the 390px overflow checks scattered across the other specs, but for
 * the new third locale specifically.
 */

async function openLocaleSwitcher(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /language|idioma|言語/i }).click()
}

test.describe('Japanese locale', () => {
  test('switching from the header updates nav, <html lang>, and persists across reload', async ({ page }) => {
    await login(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Starts in Spanish (default, no browser auto-detection). The sidebar
    // nav (inside <aside>) is scoped explicitly — the header breadcrumb is
    // also a <nav>, and both are present in the desktop-width DOM.
    const sidebar = page.locator('aside nav')
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(sidebar).toContainText('Panel')

    await openLocaleSwitcher(page)
    await page.getByRole('menuitemradio', { name: '日本語' }).click()

    await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
    await expect(page.getByRole('link', { name: 'ダッシュボード' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'クライアント' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'コマンド' })).toBeVisible()

    // KPI durations render with Japanese units (時間/分), not h/m.
    const kpiValues = page.locator('[data-testid="kpi-value"]')
    await expect(kpiValues.first()).toBeVisible()
    const allValues = await kpiValues.allTextContents()
    const someJapaneseUnit = allValues.some(v => /[時間分秒]/.test(v))
    expect(someJapaneseUnit, `expected at least one KPI value with a Japanese duration unit, got: ${allValues.join(', ')}`).toBe(true)
    const noLatinDurationUnit = allValues.every(v => !/\d[hms]\b/.test(v))
    expect(noLatinDurationUnit, `no KPI value should keep Latin h/m/s units once in Japanese, got: ${allValues.join(', ')}`).toBe(true)

    // Persists across reload.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
    await expect(page.getByRole('link', { name: 'ダッシュボード' })).toBeVisible()

    // Switching back to Español works.
    await openLocaleSwitcher(page)
    await page.getByRole('menuitemradio', { name: 'Español' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(page.getByRole('link', { name: 'Panel' })).toBeVisible()
  })

  test('the header dropdown lists all three languages with the active one checked', async ({ page }) => {
    await login(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await openLocaleSwitcher(page)
    const items = page.getByRole('menuitemradio')
    await expect(items).toHaveCount(3)
    await expect(page.getByRole('menuitemradio', { name: 'Español' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByRole('menuitemradio', { name: '日本語' })).toHaveAttribute('aria-checked', 'false')
  })

  test('the settings page language card also offers 日本語 and switches into it', async ({ page }) => {
    await login(page)
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '日本語' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
    await expect(page.getByText('言語')).toBeVisible()
  })
})

test.describe('Japanese locale (390px): no horizontal page overflow', () => {
  const screens = [
    { path: '/', label: 'dashboard' },
    { path: '/clients', label: 'clients' },
    { path: '/entries', label: 'entries' },
    { path: '/commands', label: 'commands' },
  ]

  for (const { path, label } of screens) {
    test(`${label} at 390px in Japanese`, async ({ page }) => {
      await login(page)
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      await openLocaleSwitcher(page)
      await page.getByRole('menuitemradio', { name: '日本語' }).click()
      await expect(page.locator('html')).toHaveAttribute('lang', 'ja')

      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(200)

      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }))
      expect(scrollWidth, `${label} (ja, 390px) must not overflow the viewport`).toBeLessThanOrEqual(innerWidth)
    })
  }
})
