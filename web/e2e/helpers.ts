import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export const screenshotsDir = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', 'docs', 'screenshots')

export const OWNER_EMAIL = 'david@kankaku.local'
export const OWNER_PASSWORD = 'kankaku-dev-owner'

export async function login(page: Page) {
  await page.goto('/login')
  await page.fill('#email', OWNER_EMAIL)
  await page.fill('#password', OWNER_PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL('/')
}

export async function setTheme(page: Page, theme: 'dark' | 'light' | 'system') {
  await page.evaluate((t) => {
    localStorage.setItem('kankaku-color-mode', t)
  }, theme)
  await page.reload()
  await page.waitForLoadState('networkidle')
  if (theme !== 'system') {
    await expect(page.locator('html')).toHaveClass(theme)
  }
}

/**
 * Screenshots the current page for docs/screenshots/. The app shell now
 * scrolls internally (sticky, full-height sidebar next to a scrolling
 * content area — see app/layouts/default.vue), which fixes the real bug
 * where a fixed-position sidebar stopped at one viewport height on long
 * pages. That same fix means Playwright's `fullPage: true` (which
 * measures the *document's* scroll height, not an inner scroll
 * container's) would now only capture one viewport of content. So
 * instead: measure the content area's actual scrollHeight and grow the
 * viewport to fit it before shooting, then restore the viewport. At the
 * grown viewport height the `h-dvh` sidebar naturally stretches to match,
 * so it still renders full-height in the screenshot.
 */
export async function shoot(page: Page, name: string) {
  await page.waitForTimeout(300)
  const original = page.viewportSize()
  const contentHeight = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="scroll-area"]')
    return el ? el.scrollHeight : document.body.scrollHeight
  })
  if (original && contentHeight > original.height) {
    await page.setViewportSize({ width: original.width, height: Math.min(contentHeight + 20, 10_000) })
    await page.waitForTimeout(200)
  }
  await page.screenshot({ path: path.join(screenshotsDir, `${name}.png`) })
  if (original) {
    await page.setViewportSize(original)
  }
}
