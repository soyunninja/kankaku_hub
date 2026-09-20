import { expect, test } from '@playwright/test'
import { login } from './helpers'

// The header lives in a flex column: without `shrink-0` the browser collapses
// it to its content height (33px) regardless of its height class.
for (const viewport of [{ width: 1280, height: 500 }, { width: 390, height: 700 }]) {
  test(`app header keeps its full height at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await login(page)
    const height = await page.locator('header').first().evaluate(el => el.getBoundingClientRect().height)
    expect(height).toBeGreaterThanOrEqual(56)
  })
}

test('clickable controls show a pointer cursor, disabled ones do not', async ({ page }) => {
  await login(page)
  await expect(page.locator('header button:visible').first()).toBeVisible()
  const cursors = await page.evaluate(() => {
    const enabled = [...document.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')].filter(el => el.offsetParent !== null)
    return enabled.map(el => getComputedStyle(el).cursor)
  })
  expect(cursors.length).toBeGreaterThan(3)
  expect(cursors.every(c => c === 'pointer')).toBe(true)
})
