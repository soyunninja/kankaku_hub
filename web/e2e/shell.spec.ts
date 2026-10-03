import { expect, test } from '@playwright/test'
import { login } from './helpers'

for (const viewport of [{ width: 1280, height: 500 }, { width: 390, height: 700 }]) {
  test(`headerless content starts without a reserved topbar at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await login(page)
    await expect(page.locator('[data-testid="scroll-area"] > header')).toHaveCount(0)
    const main = await page.locator('main').boundingBox()
    expect(main!.y).toBe(0)
    if (viewport.width < 768) {
      await expect(page.getByTestId('mobile-menu-trigger')).toBeVisible()
      expect(await page.getByTestId('mobile-menu-trigger').evaluate(el => getComputedStyle(el).position)).toBe('static')
    }
    else {
      await expect(page.getByTestId('sidebar-footer')).toBeVisible()
      await expect(page.getByTestId('mobile-menu-trigger')).toHaveCount(0)
    }
  })
}

test('clickable controls show a pointer cursor, disabled ones do not', async ({ page }) => {
  await login(page)
  await expect(page.getByTestId('sidebar-footer').getByRole('button').first()).toBeVisible()
  const cursors = await page.evaluate(() => {
    const enabled = [...document.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')].filter(el => el.offsetParent !== null)
    return enabled.map(el => getComputedStyle(el).cursor)
  })
  expect(cursors.length).toBeGreaterThan(3)
  expect(cursors.every(c => c === 'pointer')).toBe(true)
})
