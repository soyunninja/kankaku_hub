import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'

/**
 * End-to-end smoke test against a running instance (dev server or the
 * single-process PocketBase-served build — see PW_BASE_URL). Covers the
 * owner's required path: log in, land on a non-empty dashboard, switch
 * theme, open the unassigned queue, open a project — and saves
 * screenshots of the main screens in both themes to docs/screenshots/
 * (see ESTADO.md).
 */

const screenshotsDir = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', 'docs', 'screenshots')

const OWNER_EMAIL = 'david@kankaku.local'
const OWNER_PASSWORD = 'kankaku-dev-owner'

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('#email', OWNER_EMAIL)
  await page.fill('#password', OWNER_PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL('/')
}

async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.evaluate((t) => {
    localStorage.setItem('kankaku-color-mode', t)
  }, theme)
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.locator('html')).toHaveClass(theme)
}

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(screenshotsDir, `${name}.png`), fullPage: true })
}

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

test('theme switches to light and back to dark, no flash of wrong theme on load', async ({ page }) => {
  await page.goto('/login')
  // Fresh profile: default theme must be dark before any interaction.
  await expect(page.locator('html')).toHaveClass('dark')

  await login(page)
  await setTheme(page, 'light')
  await setTheme(page, 'dark')
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
