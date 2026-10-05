import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Read-only catalog interactions; forms may be opened but never submitted.
test.beforeEach(async ({ page }) => {
  await login(page)
  await page.route('**/api/**', async route => {
    const request = route.request()
    const readPost = request.method() === 'POST' && ['/api/kankaku/totals', '/api/collections/users/auth-refresh'].includes(new URL(request.url()).pathname)
    if (!readPost && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      await route.abort()
      throw new Error(`Unexpected backend write: ${request.method()} ${request.url()}`)
    }
    await route.continue()
  })
})

for (const width of [1440, 390]) {
  test(`keyboard tabs retain filters, focus and canonical title at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/organizacion')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Organización')
    await expect(page).toHaveTitle(/Organización/)
    const tabs = page.getByRole('tab')
    await expect(tabs).toHaveCount(3)
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true')
    // Unvisited catalogs have not mounted; visited filters stay mounted when hidden.
    await expect(page.locator('#project-search')).toHaveCount(0)
    await expect(page.locator('[data-testid="tasks-toolbar"]')).toHaveCount(0)
    const search = page.locator('#client-search')
    await search.fill('canonical-no-matching-client')
    await expect(page.locator('[data-testid="client-card"]')).toHaveCount(0)
    await tabs.nth(0).focus()
    await page.keyboard.press('ArrowRight')
    await expect(tabs.nth(1)).toBeFocused()
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/tab=projects/)
    await expect(page.locator('#project-search')).toHaveValue('')
    await page.locator('#project-search').fill('canonical-no-matching-project')
    await expect(page.locator('[data-testid="project-card"]')).toHaveCount(0)
    await tabs.nth(1).focus()
    await page.keyboard.press('End')
    await expect(tabs.nth(2)).toBeFocused()
    await expect(page).toHaveURL(/tab=tasks/)
    await page.locator('[data-testid="tasks-toolbar"] button[aria-pressed]').nth(2).click()
    await page.locator('#history-search').fill('canonical-no-matching-task')
    await tabs.nth(2).focus()
    await page.keyboard.press('Home')
    await expect(tabs.nth(0)).toBeFocused()
    await expect(search).toHaveValue('canonical-no-matching-client')
    await expect(page.getByRole('tabpanel')).toHaveCount(1)
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('#project-search')).toHaveValue('canonical-no-matching-project')
    await page.keyboard.press('End')
    await expect(page.locator('#history-search')).toHaveValue('canonical-no-matching-task')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}

test('deep links, reload and invalid tabs preserve unrelated queries', async ({ page }) => {
  await page.goto('/organizacion?tab=tasks&comparison=one')
  await expect(page.getByRole('tab').nth(2)).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab').nth(1).click()
  await expect(page).toHaveURL(/tab=projects/)
  await expect(page).toHaveURL(/comparison=one/)
  await page.reload()
  await expect(page.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true')
  for (const query of ['tab=invalid', 'tab=clients&tab=tasks']) {
    await page.goto(`/organizacion?${query}&comparison=one`)
    await expect(page.getByRole('tab').nth(0)).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab').nth(2).click()
    await expect(page).toHaveURL(/comparison=one/)
    await expect(page).toHaveURL(/tab=tasks/)
  }
})

test('sidebar and palette expose only canonical Organization and standalone pages', async ({ page }) => {
  await page.goto('/organizacion')
  await expect(page.locator('nav a[href="/organizacion"]')).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('nav p').filter({ hasText: /^Organización$/ })).toHaveCount(0)
  await expect(page.locator('nav a[href="/prueba"]')).toHaveCount(0)
  await expect(page.getByText('Experimento', { exact: true })).toHaveCount(0)
  for (const route of ['clients', 'projects', 'tasks']) {
    await expect(page.locator(`nav a[href="/${route}"]`)).toHaveCount(0)
  }
  await page.keyboard.press('ControlOrMeta+k')
  const search = page.getByRole('combobox')
  await search.fill('Prueba')
  await expect(page.getByRole('option')).toHaveCount(0)
  await search.fill('Organización')
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.getByRole('option', { name: 'Organización', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page).toHaveURL(/\/organizacion$/)
})

for (const width of [1440, 390]) {
  test(`sidebar retains only the linked active Organization at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/organizacion')
    if (width === 390) await page.getByTestId('mobile-menu-trigger').click()
    const nav = width === 390 ? page.getByRole('dialog').locator('nav') : page.locator('aside nav')
    await expect(nav.locator('a[href="/organizacion"]')).toBeVisible()
    await expect(nav.locator('a[href="/organizacion"]')).toHaveAttribute('aria-current', 'page')
    await expect(nav.locator('p').filter({ hasText: /^Organización$/ })).toHaveCount(0)
    for (const route of ['clients', 'projects', 'tasks']) await expect(nav.locator(`a[href="/${route}"]`)).toHaveCount(0)
    if (width === 390) await page.keyboard.press('Escape')
    await page.keyboard.press('ControlOrMeta+k')
    for (const label of ['Clientes', 'Proyectos', 'Tareas']) {
      await page.getByRole('combobox').fill(label)
      await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible()
    }
    await page.keyboard.press('Escape')
  })
}

test('independent filters and existing forms remain available without writes', async ({ page }) => {
  await page.goto('/organizacion')
  for (const index of [0, 1, 2]) {
    const tab = page.getByRole('tab').nth(index)
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    const panel = page.getByRole('tabpanel', { name: (await tab.innerText()).trim(), exact: true })
    await expect(panel).toBeVisible()
    await panel.locator('[data-testid="write-action"]').first().click()
    await expect(page.getByRole('dialog').locator('form')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  }
})

for (const [route, heading] of [['clients', 'Clientes'], ['projects', 'Proyectos'], ['tasks', 'Tareas']]) {
  test(`standalone /${route} retains its heading and document title`, async ({ page }) => {
    await page.goto(`/${route}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading!)
    await expect(page).toHaveTitle(new RegExp(heading!))
    await expect(page.getByRole('tablist')).toHaveCount(0)
  })
}

test('removed prototype route renders a Nuxt not-found view', async ({ page }) => {
  await page.goto('/prueba')
  await expect(page.getByRole('tablist')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Prueba')
  await expect(page.getByText('404', { exact: true })).toBeVisible()
})
