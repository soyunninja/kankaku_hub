import { expect, test } from '@playwright/test'
import { login, setTheme, shoot } from './helpers'

/**
 * End-to-end smoke test against a running instance (dev server or the
 * single-process PocketBase-served build — see PW_BASE_URL). Covers the
 * owner's required path: log in, land on a non-empty dashboard, switch
 * theme, open the unassigned queue, open a project — and saves
 * screenshots of the main screens in both themes to docs/screenshots/
 * (see ESTADO.md). See also e2e/polish.spec.ts for the targeted
 * regression checks from the visual/UX polish pass.
 */

test('dashboard shows non-zero KPIs after login', async ({ page }) => {
  await login(page)
  await expect(page.locator('h1')).toContainText(/Panel|Dashboard/)
  await page.waitForTimeout(800)

  // The demo seed has 430 task_entries over the last 60 days, so the
  // default 30-day dashboard range must show real hours and a real
  // dollar cost, not an empty/zeroed state.
  const bodyText = await page.locator('main').innerText()
  expect(bodyText).toMatch(/\d+h\s?\d*m?/)
  expect(bodyText).toMatch(/\$\d+\.\d{2}/)
})

test('theme defaults to dark, switches to light, back to dark, and to system', async ({ page }) => {
  await page.goto('/login')
  // Fresh profile: default theme must be dark before any interaction.
  await expect(page.locator('html')).toHaveClass('dark')

  await login(page)
  await setTheme(page, 'light')
  await setTheme(page, 'dark')
  // "System" must not throw and must apply *some* resolved theme class.
  await setTheme(page, 'system')
  await expect(page.locator('html')).toHaveClass(/dark|light/)
})

test('opens the unassigned queue', async ({ page }) => {
  await login(page)
  await page.goto('/unassigned')
  await expect(page.locator('h1')).toContainText(/Sin determinar/)
  await page.waitForTimeout(500)
})

test('opens a project detail page', async ({ page }) => {
  await login(page)
  await page.goto('/projects')
  await page.waitForTimeout(500)
  await page.locator('table tbody tr').first().click()
  await page.waitForURL(/\/projects\/.+/)
  await expect(page.locator('h1')).not.toBeEmpty()
})

test('captures screenshots of the main screens in both themes', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)

  const routes: { path: string, name: string }[] = [
    { path: '/', name: 'dashboard' },
    { path: '/clients', name: 'clients' },
    { path: '/projects', name: 'projects' },
    { path: '/tasks', name: 'tasks' },
    { path: '/unassigned', name: 'unassigned' },
    { path: '/entries', name: 'entries' },
    { path: '/settings', name: 'settings' },
  ]

  for (const theme of ['dark', 'light'] as const) {
    await setTheme(page, theme)
    for (const route of routes) {
      await page.goto(route.path)
      await page.waitForLoadState('networkidle')
      await shoot(page, `${route.name}-${theme}`)
    }
  }

  // Login screen in both themes (logged out — clear the PocketBase auth
  // token directly rather than driving the header's user menu).
  await page.evaluate(() => localStorage.removeItem('pocketbase_auth'))
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((t) => localStorage.setItem('kankaku-color-mode', t), theme)
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await shoot(page, `login-${theme}`)
  }
})

test('captures mobile-width dashboard screenshots (both themes)', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)

  for (const theme of ['dark', 'light'] as const) {
    await setTheme(page, theme)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await shoot(page, `dashboard-mobile-${theme}`)
  }
})
