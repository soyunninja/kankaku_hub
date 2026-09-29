import { expect, test } from '@playwright/test'
import { apiLogin, comboboxList, comboboxTrigger, login, pbOrigin, pbUrl } from './helpers'

function assertIsolatedStack() {
  const web = process.env.PW_BASE_URL
  const pocketbase = pbOrigin()
  if (!((web === 'http://127.0.0.1:3003' && pocketbase === 'http://127.0.0.1:8093')
    || (web === 'http://127.0.0.1:3002' && pocketbase === 'http://127.0.0.1:8092'))) {
    throw new Error('Run this read-only spec only against the isolated :3003/:8093 or :3002/:8092 stack')
  }
}

test('entries combobox searches labels, selects and clears All, and returns focus on Escape', async ({ page, request }) => {
  assertIsolatedStack()
  const token = await apiLogin(request)
  const response = await request.get(pbUrl('/api/collections/clients/records?perPage=200'), { headers: { Authorization: token } })
  expect(response.ok()).toBeTruthy()
  const clients = (await response.json()).items as { id: string, name: string, active: boolean, unassigned: boolean }[]
  const client = clients.find(item => item.active && !item.unassigned)
  expect(client, 'isolated seed needs an active client').toBeDefined()

  await login(page)
  await page.goto('/entries')
  const trigger = page.locator('[data-slot="combobox-trigger"]').first()
  await expect(trigger).toHaveAttribute('role', 'combobox')
  await expect(trigger).toContainText(/All|Todos|すべて/)
  await trigger.click()
  const search = page.locator('[data-slot="combobox-list"] [data-slot="command-input"]')
  await search.fill(client!.name)
  const choice = page.locator('[data-slot="combobox-item"]').filter({ hasText: client!.name })
  await expect(choice).toBeVisible()
  await choice.click()
  await expect(trigger).toContainText(client!.name)

  await trigger.click()
  await search.fill('')
  await search.press('Escape')
  await expect(trigger).toBeFocused()
  await trigger.click()
  await search.fill('')
  await page.getByRole('option', { name: /^(All|Todos|すべて)$/ }).click()
  await expect(trigger).toContainText(/All|Todos|すべて/)

  await trigger.click()
  await search.fill(client!.name)
  await search.press('ArrowDown')
  await search.press('Enter')
  await expect(trigger).toContainText(client!.name)
})

test('mobile dashboard metric combobox stays in the viewport and supports localized search and keyboard selection', async ({ page }) => {
  assertIsolatedStack()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => window.localStorage.setItem('kankaku-locale', 'es'))
  await login(page)
  await page.goto('/')

  const metric = comboboxTrigger(page, 'Métrica')
  await expect(comboboxTrigger(page, 'Agrupar por')).toBeVisible()
  await metric.click()
  const list = comboboxList(page, 'Métrica')
  await expect(list).toBeVisible()
  const box = await list.boundingBox()
  expect(box, 'metric popup must have a visible bounding box').not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)

  const search = list.locator('[data-slot="command-input"]')
  await expect(search).toBeFocused()
  await search.fill('impossible-metric-search')
  await expect(list.getByText('No se encontraron resultados.', { exact: true })).toBeVisible()
  await search.fill('')
  await search.fill('Coste')
  await expect(list.getByRole('option', { name: 'Coste', exact: true })).toBeVisible()
  await search.press('ArrowDown')
  await search.press('Enter')
  await expect(metric).toContainText('Coste')
  await expect(list).toBeHidden()

  await metric.click()
  await expect(search).toBeFocused()
  await search.press('Escape')
  await expect(list).toBeHidden()
  await expect(metric).toBeFocused()
})

test('new task dialog status combobox supports keyboard selection without saving', async ({ page }) => {
  assertIsolatedStack()
  await page.addInitScript(() => window.localStorage.setItem('kankaku-locale', 'es'))
  await login(page)
  await page.goto('/tasks')
  await page.getByRole('button', { name: 'Nueva tarea' }).click()

  const dialog = page.getByRole('dialog', { name: 'Nueva tarea' })
  await expect(dialog).toBeVisible()
  const status = comboboxTrigger(page, 'Estado').and(dialog.locator('[data-slot="combobox-trigger"]'))
  await expect(status).toContainText('Abierta')
  await status.click()
  const list = comboboxList(page, 'Estado')
  const search = list.locator('[data-slot="command-input"]')
  await expect(search).toBeFocused()
  await search.fill('En curso')
  await expect(list.getByRole('option', { name: 'En curso', exact: true })).toBeVisible()
  await search.press('ArrowDown')
  await search.press('Enter')
  await expect(status).toContainText('En curso')
  await expect(list).toBeHidden()

  await status.click()
  await expect(search).toBeFocused()
  await search.press('Escape')
  await expect(status).toBeFocused()
  await dialog.locator('[data-slot="dialog-close"]').click()
  await expect(dialog).toBeHidden()
})

test('disabled combobox retains its title and cannot open', async ({ page }) => {
  assertIsolatedStack()
  await login(page)
  await page.goto('/entries')
  const quality = page.locator('[data-slot="combobox-trigger"]').nth(4)
  await expect(quality).toBeDisabled()
  await expect(quality).toHaveAttribute('title', /.+/)
  await quality.focus()
  await quality.press('Enter')
  await expect(page.locator('[data-slot="combobox-list"]')).toHaveCount(0)
})
