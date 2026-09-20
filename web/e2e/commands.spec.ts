import { expect, test } from '@playwright/test'
import { login, setTheme, shoot } from './helpers'

/**
 * Targeted checks for the /commands reference screen (kankaku commands
 * documented for the web app — see docs/specs/web-commands-reference.md).
 * Screenshots for docs/screenshots/ are produced separately: dark/light
 * desktop shots come from the shared routes loop in smoke.spec.ts;
 * commands-mobile-dark is captured here.
 */

test('reachable from the sidebar', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: /Comandos|Commands/ }).click()
  await page.waitForURL('/commands')
  await expect(page.locator('h1')).toContainText(/Comandos|Commands/)
})

test('filter narrows the command list', async ({ page }) => {
  await login(page)
  await page.goto('/commands')
  await page.waitForLoadState('networkidle')

  const codeBoxes = page.locator('code')
  const totalBefore = await codeBoxes.count()
  expect(totalBefore).toBeGreaterThan(5)

  await page.getByPlaceholder(/Filtrar comandos|Filter commands/).fill('backfill')
  await expect(page.locator('code', { hasText: 'backfill' })).toBeVisible()
  const totalAfter = await codeBoxes.count()
  expect(totalAfter).toBeLessThan(totalBefore)
})

test('filter shows an empty state for no matches', async ({ page }) => {
  await login(page)
  await page.goto('/commands')
  await page.getByPlaceholder(/Filtrar comandos|Filter commands/).fill('nonexistent-command-xyz')
  await expect(page.getByText(/Ningún comando coincide|No command matches/)).toBeVisible()
})

test('a "requires hub" badge is present', async ({ page }) => {
  await login(page)
  await page.goto('/commands')
  await expect(page.getByText(/Requiere hub|Requires hub/).first()).toBeVisible()
})

test('copy button copies the command syntax to the clipboard', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL })
  await login(page)
  await page.goto('/commands')
  await page.waitForLoadState('networkidle')

  const row = page.locator('code', { hasText: '/kankaku sync status' }).locator('..')
  await row.getByRole('button', { name: /Copiar|Copy/ }).click()

  await expect(row.getByText(/¡Copiado!|Copied!/)).toBeVisible()
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboardText).toBe('/kankaku sync status')
})

test('the backfill command links to the unassigned queue', async ({ page }) => {
  await login(page)
  await page.goto('/commands')
  await page.waitForLoadState('networkidle')

  const row = page.locator('code', { hasText: '/kankaku backfill' }).locator('..').locator('..')
  await row.getByRole('link', { name: /Sin determinar/ }).click()
  await page.waitForURL('/unassigned')
  await expect(page.locator('h1')).toContainText(/Sin determinar/)
})

test('no horizontal overflow at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.goto('/commands')
  await page.waitForLoadState('networkidle')

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test('captures a mobile dark screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await setTheme(page, 'dark')
  await page.goto('/commands')
  await page.waitForLoadState('networkidle')
  await shoot(page, 'commands-mobile-dark')
})
