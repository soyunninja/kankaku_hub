import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { login } from './helpers'

// Discover existing projects through the catalog; never seed or mutate records.
async function existingProject(page: Page) {
  await page.goto('/projects')
  const card = page.locator('[data-testid="project-card"]').first()
  await expect(card).toBeVisible()
  const name = (await card.getByRole('heading').innerText()).trim()
  await card.getByRole('button', { name: `Abrir detalles de ${name}`, exact: true }).click()
  await expect(page).toHaveURL(/\/organizacion\/clientes\/[^/?#]+\/proyectos\/[^/?#]+$/)
  return { name, path: new URL(page.url()).pathname }
}

for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
  test(`task page visual alignment and long title at ${width}px in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.addInitScript(value => localStorage.setItem('kankaku-color-mode', value), theme)
    const { path } = await existingProject(page)
    const link = page.locator('main a[href*="/tareas/"]').first()
    await expect(link).toBeVisible()
    const taskPath = await link.getAttribute('href')
    const longTitle = 'Task presentation with a long title '.repeat(5) + 'UnbrokenTitle'.repeat(12)
    await page.route(`**/api/collections/tasks/records/${taskPath!.split('/').at(-1)}*`, async route => {
      const response = await route.fetch()
      const record = await response.json()
      await route.fulfill({ response, json: { ...record, title: longTitle } })
    })
    await page.goto(taskPath!)
    const title = page.getByRole('heading', { level: 1 })
    await expect(title).toHaveText(longTitle)
    await expect(title).toHaveCSS('font-size', '20px')
    const header = page.getByTestId('task-detail-header')
    await expect(header.getByRole('button', { name: 'Volver', exact: true })).toBeVisible()
    const body = title.locator('xpath=ancestor::div[@data-testid="task-detail-body"]')
    await expect(body).toHaveCSS('row-gap', '24px')
    const card = page.locator('main section > ul > li').first()
    await expect(card).toBeVisible()
    await expect(card).toHaveCSS('border-radius', '24px')
    await expect(card).toHaveCSS('padding-top', width < 640 ? '8px' : '20px')
    const evidence = await body.evaluate(el => {
      const container = el.parentElement!
      const card = el.querySelector('section > ul > li')!
      const style = getComputedStyle(card)
      return { bodyWidth: el.getBoundingClientRect().width, containerWidth: container.getBoundingClientRect().width,
        background: style.backgroundColor, radius: style.borderRadius, gap: getComputedStyle(el).rowGap,
        heading: getComputedStyle(el.querySelector('h1')!).fontSize,
        overflow: document.documentElement.scrollWidth > innerWidth, theme: document.documentElement.className }
    })
    expect(Math.abs(evidence.bodyWidth - evidence.containerWidth)).toBeLessThan(2)
    expect(evidence.background).not.toBe('rgba(0, 0, 0, 0)')
    expect(evidence.overflow).toBe(false)
    expect(evidence.theme).toContain(theme)
    const titleBox = await title.boundingBox()
    const statusBox = await page.locator('#task-detail-status-label').boundingBox()
    expect(statusBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height)
    console.log('TASK_VISUAL', JSON.stringify({ width, theme, ...evidence }))
    await page.screenshot({ path: testInfo.outputPath(`task-${width}-${theme}.png`), fullPage: true })
    await header.getByRole('button', { name: 'Volver', exact: true }).click()
    await expect(page).toHaveURL(`${new URL(page.url()).origin}${path}`)
  })
}

for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
  test(`project doing badge matches active project success at ${width}px in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.addInitScript(value => localStorage.setItem('kankaku-color-mode', value), theme)
    const { path } = await existingProject(page)
    const project = path.split('/').at(-1)!
    await page.route('**/api/collections/projects/records?**', async route => {
      const response = await route.fetch()
      const body = await response.json()
      await route.fulfill({ response, json: { ...body, items: body.items.map((record: any) => ({ ...record, active: true })) } })
    })
    await page.goto(path.split('/proyectos/')[0]!)
    const active = page.getByTestId('client-projects').getByTestId('project-card').first().locator('[data-slot="badge"]').filter({ hasText: /^Activo$/ })
    await expect(active).toBeVisible()
    const colors = await active.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, foreground: getComputedStyle(el).color }))
    await page.route('**/api/collections/tasks/records?**', route => route.fulfill({ json: {
      page: 1, perPage: 200, totalPages: 1, totalItems: 3,
      items: ['doing', 'open', 'done'].map(status => ({ id: `visual-${status}`, project, status, active: true,
        title: 'Read-only badge wrapping title '.repeat(5), description: '', external_ref: '' })),
    } }))
    await page.goto(path)
    const cards = page.getByTestId('task-card')
    await expect(cards).toHaveCount(3)
    const doing = cards.locator('[data-slot="badge"]').filter({ hasText: /^En curso$/ })
    await expect(doing).toHaveCSS('background-color', colors.background)
    await expect(doing).toHaveCSS('color', colors.foreground)
    await expect(doing).toHaveClass(/bg-success/)
    for (const label of ['Abierta', 'Hecha']) {
      const badge = cards.locator('[data-slot="badge"]').filter({ hasText: new RegExp(`^${label}$`) })
      await expect(badge).not.toHaveClass(/bg-success/)
      await expect(badge).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    }
    await expect(doing).toHaveCSS('white-space', 'normal')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    console.log('BADGE_VISUAL', JSON.stringify({ width, theme, ...colors }))
    await page.screenshot({ path: testInfo.outputPath(`badge-${width}-${theme}.png`), fullPage: true })
  })
}

for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
  test(`client image white inset and fallback at ${width}px in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.addInitScript(value => localStorage.setItem('kankaku-color-mode', value), theme)
    let favicon = 'readonly-avatar.svg'
    await page.route('**/api/collections/clients/records**', async route => {
      const response = await route.fetch()
      const body = await response.json()
      const decorate = (record: any) => ({ ...record, favicon, updated: '2026-01-01' })
      await route.fulfill({ response, json: body.items ? { ...body, items: body.items.map(decorate) } : decorate(body) })
    })
    await page.route('**/api/files/**/readonly-avatar*.svg*', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="8" fill="red"/></svg>' }))
    await page.goto('/organizacion?tab=clients')
    const card = page.getByTestId('client-card').first()
    await expect(card).toBeVisible()
    const custom = card.getByTestId('client-avatar')
    await expect(custom).toHaveCSS('width', '28px')
    const checkImage = async (locator: ReturnType<Page['getByTestId']>, size: number) => {
      await expect(locator).toHaveAttribute('data-avatar-state', 'image')
      await expect(locator).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      for (const side of ['top', 'right', 'bottom', 'left']) await expect(locator).toHaveCSS(`padding-${side}`, '5px')
      await expect(locator).toHaveCSS('width', `${size}px`)
      await expect(locator).toHaveCSS('height', `${size}px`)
      await expect(locator.locator('img')).toHaveCSS('object-fit', 'cover')
    }
    await checkImage(custom, 28)
    const { path: projectPath } = await existingProject(page)
    await page.goto(projectPath.split('/proyectos/')[0]!)
    const path = new URL(page.url()).pathname
    const avatar = page.locator('main [data-testid="client-avatar"]').first()
    await checkImage(avatar, 40)
    const small = page.getByTestId('client-projects').getByTestId('client-avatar').first()
    await checkImage(small, 20)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    console.log('AVATAR_VISUAL', JSON.stringify({ width, theme, sizes: [28, 40, 20], background: 'rgb(255, 255, 255)', padding: '5px' }))
    await page.screenshot({ path: testInfo.outputPath(`avatar-${width}-${theme}.png`), fullPage: true })
    // A synthetic DOM load error exercises the actual Vue error handler without a backend write.
    await avatar.locator('img').dispatchEvent('error')
    await expect(avatar).toHaveAttribute('data-avatar-state', 'initials')
    await expect(avatar).toHaveCSS('padding-top', '0px')
    await expect(avatar).not.toHaveCSS('background-color', 'rgb(255, 255, 255)')
    favicon = 'readonly-avatar-recovered.svg'
    await page.reload()
    await checkImage(avatar, 40)
    await expect(avatar.locator('img')).toHaveAttribute('src', /readonly-avatar-recovered\.svg.*v=/)
    favicon = ''
    await page.goto(path)
    await expect(avatar).toHaveAttribute('data-avatar-state', 'initials')
    await expect(avatar).toHaveCSS('padding-top', '0px')
    await expect(avatar).not.toHaveCSS('background-color', 'rgb(255, 255, 255)')
  })
}

const observedWrites = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  await login(page)
  const writes: string[] = []
  observedWrites.set(page, writes)
  await page.route('**/api/**', async route => {
    const request = route.request()
    const readPost = request.method() === 'POST' && ['/api/kankaku/totals', '/api/collections/users/auth-refresh'].includes(new URL(request.url()).pathname)
    if (!readPost && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      writes.push(request.url())
      await route.abort()
    }
    else await route.continue()
  })
})
test.afterEach(async ({ page }) => {
  expect(observedWrites.get(page)).toEqual([])
})

async function expectClientKpis(page: Page, width: number) {
  const kpis = page.getByTestId('client-kpis')
  await expect(kpis.getByTestId('kpi-value')).toHaveCount(4)
  for (const title of ['Tiempo de trabajo', 'Coste', 'Proyectos', 'Coste medio/tarea']) {
    await expect(kpis.getByText(title, { exact: true })).toBeVisible()
  }
  const columns = await kpis.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(columns).toBe(width < 768 ? 2 : 4)
  const spacing = await kpis.evaluate(el => {
    const style = getComputedStyle(el)
    const boxes = Array.from(el.children, child => child.getBoundingClientRect())
    const horizontal: number[] = []
    const vertical: number[] = []
    for (const a of boxes) for (const b of boxes) {
      if (Math.abs(a.top - b.top) < 1 && b.left > a.left) {
        if (!boxes.some(c => c !== a && c !== b && Math.abs(c.top - a.top) < 1 && c.left > a.left && c.left < b.left)) horizontal.push(b.left - a.right)
      }
      if (Math.abs(a.left - b.left) < 1 && b.top > a.top) vertical.push(b.top - a.bottom)
    }
    return { rowGap: parseFloat(style.rowGap), columnGap: parseFloat(style.columnGap), horizontal, vertical }
  })
  const expectedGap = width < 768 ? 12 : 24
  expect(spacing.rowGap).toBe(expectedGap)
  expect(spacing.columnGap).toBe(expectedGap)
  expect(spacing.horizontal.length).toBeGreaterThan(0)
  for (const gap of [...spacing.horizontal, ...spacing.vertical]) expect(gap).toBeCloseTo(expectedGap, 1)
  if (columns === 2) expect(spacing.vertical).toHaveLength(2)
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width)
}

for (const width of [1440, 390]) {
  test(`canonical project loads directly, reloads and returns to its owning client at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const { name, path } = await existingProject(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(page.getByRole('tablist')).toHaveCount(0)
    if (width === 1440) {
      await expect(page.locator('nav a[href="/organizacion"]')).toHaveAttribute('aria-current', 'page')
    }
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(page).toHaveTitle(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    const panel = page.getByTestId('project-time-series')
    await expect(panel.getByRole('combobox', { name: 'Métrica', exact: true })).toHaveText('Tiempo de trabajo')
    await expect(panel.getByRole('combobox')).toHaveCount(1)
    await expect(page.getByTestId('project-period')).toContainText('Últimos 30 días')
    for (const removed of ['Tendencia', 'Por modelo', 'Prompts más costosos']) await expect(page.getByRole('heading', { name: removed, exact: true })).toHaveCount(0)
    const cards = page.getByTestId('task-card')
    await expect(cards.first()).toBeVisible()
    await expect(cards.first().locator('dt')).toHaveText(['Tiempo', 'Coste', 'Sesiones totales'])
    await expect(cards.first().getByTestId('task-total-sessions')).toHaveText(/^\d+$/)
    await expect(cards.first().getByRole('button')).toHaveCount(0)
    await expect(cards.locator('p[title]')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await panel.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Coste', exact: true }).click()
    await expect(panel).toHaveAttribute('aria-label', /Coste.*Tareas.*\d{4}-\d{2}-\d{2}/)
    await panel.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Tiempo de trabajo', exact: true }).click()
    const taskLink = page.locator('main a[href*="/tareas/"]').first()
    await expect(taskLink).toBeVisible()
    const taskTitle = (await taskLink.locator('xpath=ancestor::article').getByRole('heading', { level: 3 }).innerText()).trim()
    await expect(taskLink).toHaveAttribute('href', new RegExp(`^${path}/tareas/[^/]+$`))
    await taskLink.click()
    await expect(page).toHaveURL(/\/organizacion\/clientes\/[^/?#]+\/proyectos\/[^/?#]+\/tareas\/[^/?#]+$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(taskTitle)
    await expect(page.getByTestId('project-time-series')).toHaveCount(0)
    await expect(page.getByTestId('task-card')).toHaveCount(0)
    await page.getByRole('button', { name: 'Volver', exact: true }).click()
    await expect(page).toHaveURL(`${new URL(page.url()).origin}${path}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await page.getByRole('button', { name: 'Volver', exact: true }).click()
    await expect(page).toHaveURL(`${new URL(page.url()).origin}${path.split('/proyectos/')[0]}`)
    await expect(page.getByTestId('detail-client-name')).toBeVisible()
    await expect(page.getByRole('tab')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

for (const width of [1440, 900, 740, 390]) {
  test(`client cards open full details with direct/reload/back at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/organizacion?tab=clients')
    const card = page.locator('[data-testid="client-card"]').first()
    await expect(card).toBeVisible()
    const name = (await card.getByRole('heading').innerText()).trim()
    await card.getByRole('button', { name: `Abrir detalles de ${name}`, exact: true }).click()
    await expect(page).toHaveURL(/\/organizacion\/clientes\/[^/?#]+$/)
    const path = new URL(page.url()).pathname
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('tablist')).toHaveCount(0)
    if (width === 1440) await expect(page.locator('nav a[href="/organizacion"]')).toHaveAttribute('aria-current', 'page')
    for (const section of ['Contacto', 'Notas', 'Proyectos']) {
      await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible()
    }
    await expectClientKpis(page, width)
    await expect(page.getByRole('heading', { name: 'Tendencia', exact: true })).toHaveCount(0)
    await expect(page.getByTestId('client-time-series').getByRole('combobox', { name: 'Métrica', exact: true })).toHaveText('Tiempo de trabajo')
    await expect(page.getByTestId('client-time-series').getByRole('combobox', { name: 'Agrupar por', exact: true })).toHaveCount(0)
    await expect(page.getByTestId('detail-client-status-badge')).toBeVisible()
    const projects = page.locator('main a[href*="/proyectos/"]')
    for (const link of await projects.all()) await expect(link).toHaveAttribute('href', new RegExp(`^${path}/proyectos/`))
    await expect(page.locator('main a[href^="/projects/"]')).toHaveCount(0)
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(page).toHaveTitle(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    await expectClientKpis(page, width)
    await expect(page.getByTestId('client-edit')).toBeVisible()
    await expect(page.getByTestId('client-archive')).toBeVisible()
    const main = await page.getByTestId('client-main').boundingBox()
    const sidebar = await page.getByTestId('client-sidebar').boundingBox()
    expect(main).toBeTruthy()
    expect(sidebar).toBeTruthy()
    if (width === 1440) {
      expect(sidebar!.x).toBeGreaterThanOrEqual(main!.x + main!.width)
      expect(Math.abs(sidebar!.y - main!.y)).toBeLessThan(2)
      expect(main!.width + sidebar!.width).toBeGreaterThan(896)
      const archive = await page.getByTestId('client-archive').boundingBox()
      expect(Math.abs(archive!.x + archive!.width - sidebar!.x - sidebar!.width)).toBeLessThan(2)
    }
    else {
      expect(sidebar!.y).toBeGreaterThanOrEqual(main!.y + main!.height)
      expect(Math.abs(sidebar!.x - main!.x)).toBeLessThan(2)
    }
    const action = await page.getByTestId('client-actions').boundingBox()
    const contact = await page.getByRole('heading', { name: 'Contacto', exact: true }).boundingBox()
    const notes = await page.getByRole('heading', { name: 'Notas', exact: true }).boundingBox()
    expect(action!.y + action!.height).toBeLessThan(contact!.y)
    expect(contact!.y).toBeLessThan(notes!.y)
    if (await page.getByTestId('client-edit').isEnabled()) {
      await page.getByTestId('client-edit').focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name: 'Editar cliente', exact: true })
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('#c-name')).toHaveValue(name)
      await expect(dialog.getByRole('button', { name: 'Guardar', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    }
    await page.getByRole('button', { name: 'Volver', exact: true }).click()
    await expect(page).toHaveURL(/\/organizacion\?tab=clients$/)
    await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('button', { name: 'Lista', exact: true }).click()
    await page.getByRole('cell', { name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('combobox').fill(name)
    await page.getByRole('option', { name, exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
  })
}

for (const width of [1440, 390]) {
  test(`task board/list opens full detail with sessions, edit appearance and direct/reload/back at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const writes: string[] = []
    await page.route('**/api/**', async route => {
      // Totals and authentication refresh are reads despite using POST.
      const readPost = route.request().method() === 'POST' && ['/api/kankaku/totals', '/api/collections/users/auth-refresh'].includes(new URL(route.request().url()).pathname)
      if (!readPost && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.request().method())) {
        writes.push(route.request().url())
        await route.abort()
      }
      else await route.continue()
    })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/organizacion?tab=tasks')
    const card = page.locator('main [role="button"][aria-label]').filter({ has: page.locator('[aria-label$=" sesiones"]') }).first()
    await expect(card).toBeVisible()
    const name = (await card.locator('p').first().innerText()).trim()
    const response = page.waitForResponse(res => /\/api\/collections\/tasks\/records\/[^/?]+(?:\?|$)/.test(res.url()) && res.request().method() === 'GET')
    if (width === 1440) await card.click()
    else {
      await card.focus()
      await page.keyboard.press('Enter')
    }
    await expect(page).toHaveURL(/\/organizacion\/clientes\/[^/?#]+\/proyectos\/[^/?#]+\/tareas\/[^/?#]+$/)
    const record = await (await response).json()
    const path = new URL(page.url()).pathname
    expect(path.split('/').at(-1)).toBe(record.id)
    expect(path.split('/')[5]).toBe(record.project)
    await expect(page.getByTestId('project-time-series')).toHaveCount(0)
    await expect(page.getByTestId('task-card')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0)
    if (record.description) await expect(page.getByTestId('task-detail-description')).toHaveText(record.description)
    await expect(page.getByRole('tab', { name: { open: 'Abierta', doing: 'En curso', done: 'Hecha' }[record.status as 'open' | 'doing' | 'done'], exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: 'Sesiones', exact: true })).toBeVisible()
    const session = page.locator('main section > ul > li').first()
    await expect(session).toBeVisible()
    await expect(session.locator('dl')).toContainText('Registros')
    await expect(session.locator('pre')).toContainText(/pi --session|claude|codex/)
    const disclosure = session.getByRole('button', { name: 'Entradas de la sesión', exact: true })
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    await disclosure.click()
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    await expect(session.getByTestId('session-entry-row').first()).toBeVisible()
    await disclosure.click()
    await disclosure.click()
    await expect(session.getByTestId('session-entry-row').first()).toBeVisible()
    await page.getByRole('button', { name: 'Editar tarea', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Editar tarea', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('#t-title')).toHaveValue(name)
    await expect(dialog.locator('#t-desc')).toHaveValue(record.description ?? '')
    await expect(dialog.locator('#t-ref')).toHaveValue(record.external_ref ?? '')
    await expect(dialog.getByRole('button', { name: 'Guardar', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    if (width === 1440) await expect(page.locator('nav a[href="/organizacion"]')).toHaveAttribute('aria-current', 'page')
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(page).toHaveTitle(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    await page.goto(`/organizacion/tareas/${record.id}?comparison=one&comparison=two#task-context`)
    await expect(page).toHaveURL(`${new URL(page.url()).origin}${path}?comparison=one&comparison=two#task-context`)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await page.getByRole('button', { name: 'Volver', exact: true }).click()
    await expect(page).toHaveURL(`${new URL(page.url()).origin}${path.split('/tareas/')[0]}`)
    await page.goto('/organizacion?tab=tasks')
    await expect(page.getByRole('tab').nth(2)).toHaveAttribute('aria-selected', 'true')
    await card.focus()
    await page.keyboard.press(' ')
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await page.getByRole('button', { name: 'Volver', exact: true }).click()
    await expect(page).toHaveURL(`${new URL(page.url()).origin}${path.split('/tareas/')[0]}`)
    await page.goto('/organizacion?tab=tasks')
    await page.getByRole('button', { name: 'Lista', exact: true }).click()
    const link = page.getByRole('link', { name, exact: true })
    await expect(link).toHaveAttribute('href', path)
    await link.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('combobox').fill(name)
    await page.getByRole('option', { name, exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    expect(writes).toEqual([])
    expect(errors).toEqual([])
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
  })
}

for (const width of [1440, 390]) {
  test(`project task chart and safe catalog titles at ${width}px without writes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const { path, name } = await existingProject(page)
    const [, , , client, , project] = path.split('/')
    const requests: any[] = []
    await page.route('**/api/collections/tasks/records?**', async route => {
      await route.fulfill({ json: { page: 1, perPage: 200, totalPages: 1, totalItems: 3, items: [
        { id: 'readonlytaskone', project, title: 'Readonly named task', status: 'open' },
        { id: 'readonlytasktwo', project, title: '', status: 'done' },
        { id: 'readonlytaskzero', project, title: 'No activity', status: 'doing' },
      ] } })
    })
    await page.route('**/api/kankaku/totals', async route => {
      const body = route.request().postDataJSON()
      if (body.filters?.project !== project) return route.fallback()
      requests.push(body)
      const total = { entries: 2, work_ms: 7_200_000, cost: 3, cost_unknown_entries: 1 }
      const first = { ...total, entries: 1, work_ms: 3_600_000, cost: 2, cost_unknown_entries: 0 }
      const second = { ...first, cost: 1, cost_unknown_entries: 1 }
      const groups = body.group_by === 'task' ? [{ ...first, group_key: 'readonlytaskone' }, { ...second, group_key: 'readonlytasktwo' }]
        : body.group_by === 'day' ? [{ ...(body.filters.task === 'readonlytaskone' ? first : body.filters.task === 'readonlytasktwo' ? second : total), group_key: '1' }] : []
      await route.fulfill({ json: { total, groups, total_pages: 1, total_groups: groups.length, page: 1, per_page: body.per_page } })
    })
    await page.goto(path)
    for (const reload of [false, true]) {
      if (reload) await page.reload()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
      await expect(page.getByTestId('task-card')).toHaveCount(3)
      const unnamed = page.getByTestId('task-card').filter({ has: page.getByRole('heading', { name: 'Tarea sin nombre', exact: true }) })
      await expect(unnamed.locator('dd').nth(1)).toHaveText('No disponible')
      await expect(unnamed).not.toContainText('readonlytasktwo')
      const zero = page.getByTestId('task-card').filter({ has: page.getByRole('heading', { name: 'No activity', exact: true }) })
      await expect(zero.locator('dd').nth(0)).toHaveText('0s')
      await expect(zero.locator('dd').nth(1)).toHaveText('$0.00')
      const panel = page.getByTestId('project-time-series')
      await expect(panel.getByTestId('chart-svg')).toBeVisible()
      const bars = panel.locator('g[role="img"][tabindex="0"]')
      await expect(bars).toHaveCount(30)
      await expect(bars.nth(1)).toHaveAttribute('aria-label', /Readonly named task.*Tarea sin nombre/)
      await expect(bars.first()).toHaveAttribute('aria-label', /0/)
      await bars.first().focus()
      await expect(bars.first()).toBeFocused()
      await panel.getByRole('combobox').click()
      await page.getByRole('option', { name: 'Coste', exact: true }).click()
      await expect(panel.getByRole('status')).toBeVisible()
      await expect(bars.nth(1)).toHaveAttribute('aria-label', /\$/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    for (const body of requests) {
      expect(body.filters.client).toBe(client)
      expect(body.filters.project).toBe(project)
      expect(['none', 'day', 'task']).toContain(body.group_by)
      if (body.group_by === 'task') expect(body.per_page).toBe(200)
      if (body.group_by === 'day') expect(body.day_boundaries).toHaveLength(31)
      else if (body.group_by === 'task' && !body.from) expect(body.to).toBeUndefined()
      else { expect(body.from).toBeTruthy(); expect(body.to).toBeTruthy() }
    }
  })
}

for (const width of [1440, 390]) {
  for (const state of ['known', 'denied', 'capped', 'fallback']) {
    test(`all-time task sessions are ${state} at ${width}px without writes`, async ({ page }, testInfo) => {
      if (width === 1440 && state === 'known') console.info('Session-count browser artifacts:', testInfo.project.outputDir)
      await page.setViewportSize({ width, height: 1000 })
      const { path } = await existingProject(page)
      const [, , , client, , project] = path.split('/')
      // Discovery returns at navigation; settle its independent live count read
      // before intercepting the two fixture loads measured below.
      await expect(page.getByTestId('task-total-sessions').first()).toHaveText(/^\d+$/)
      const countRequests: any[] = []
      const rowRequests: any[] = []
      await page.route('**/api/collections/tasks/records?**', route => route.fulfill({ json: {
        page: 1, perPage: 200, totalPages: 1, totalItems: 3, items: [
          { id: 'sessiontaskone', project, title: 'Named sessions', status: 'open' },
          { id: 'sessiontaskblank', project, title: 'Blank only', status: 'done' },
          { id: 'sessiontaskzero', project, title: 'No entries', status: 'doing' },
        ],
      } }))
      await page.route('**/api/kankaku/totals', async route => {
        const body = route.request().postDataJSON()
        if (body.filters?.project !== project) return route.fallback()
        const total = { entries: 10, work_ms: 1000, cost: 1 }
        if (body.group_by === 'task' && !body.from) {
          countRequests.push(body)
          if (state === 'denied' || state === 'fallback') return route.fulfill({ status: state === 'denied' ? 403 : 404, json: { message: 'Unavailable session read' } })
          return route.fulfill({ json: { total, groups: [
            { ...total, group_key: 'sessiontaskone', distinct_sessions: 4 },
            { ...total, group_key: 'sessiontaskblank', distinct_sessions: 1 },
          ], total_pages: state === 'capped' ? 6 : 1, total_groups: state === 'capped' ? 1200 : 2, page: 1, per_page: 200 } })
        }
        const groups = body.group_by === 'task' ? [{ ...total, group_key: 'sessiontaskone' }]
          : body.group_by === 'day' ? [{ ...total, group_key: '0' }] : []
        await route.fulfill({ json: { total, groups, total_pages: 1, total_groups: groups.length, page: 1, per_page: body.per_page } })
      })
      await page.route('**/api/collections/task_entries/records?**', async route => {
        const url = new URL(route.request().url())
        if (url.searchParams.get('fields') !== 'task,session_id,client,project') return route.fallback()
        rowRequests.push(Object.fromEntries(url.searchParams))
        const entry = (task: string, session_id: string) => ({ task, session_id, project, client, started_at: '2001-01-01' })
        const items = state === 'fallback' ? [entry('sessiontaskone', 'same'), entry('sessiontaskone', 'same'), entry('sessiontaskone', 'old'), entry('sessiontaskblank', '')]
          : [entry('sessiontaskone', ''), entry('sessiontaskone', ''), entry('sessiontaskblank', '')]
        await route.fulfill({ json: { items, page: 1, perPage: 2000, totalItems: items.length, totalPages: 1 } })
      })
      await page.goto(path)
      for (const reload of [false, true]) {
        if (reload) await page.reload()
        await expect(page.getByTestId('task-card')).toHaveCount(3)
        const expected = state === 'known' ? ['3', '0', '0'] : state === 'fallback' ? ['2', '0', '0'] : ['No disponible', 'No disponible', 'No disponible']
        await expect(page.getByTestId('task-total-sessions')).toHaveText(expected)
        await expect(page.getByTestId('project-period')).toContainText('Últimos 30 días')
        await expect(page.getByTestId('project-time-series').getByTestId('chart-svg')).toBeVisible()
        for (const card of await page.getByTestId('task-card').all()) await expect(card.locator('dt').last()).toHaveText('Sesiones totales')
      }
      expect(countRequests).toHaveLength(2)
      for (const body of countRequests) {
        expect(body.filters).toEqual({ client, project })
        expect(body.from).toBeUndefined()
        expect(body.to).toBeUndefined()
        expect(body.per_page).toBe(200)
      }
      expect(rowRequests).toHaveLength(['known', 'fallback'].includes(state) ? 2 : 0)
      for (const request of rowRequests) {
        expect(request.perPage).toBe('2000')
        expect(request.filter).toContain(`client = "${client}"`)
        expect(request.filter).toContain(`project = "${project}"`)
        expect(request.filter).not.toContain('started_at')
        if (state === 'known') expect(request.filter).toContain('session_id = ""')
      }
    })
  }
}

test('malformed project task costs stay unavailable without hiding work or true zero', async ({ page }, testInfo) => {
  console.info('Cost-validity browser artifacts:', testInfo.project.outputDir)
  await page.setViewportSize({ width: 390, height: 1000 })
  const { path } = await existingProject(page)
  const project = path.split('/').at(-1)
  const catalog = [
    { id: 'readonlynegative', title: 'Negative cost', cost: -1 },
    { id: 'readonlymissing', title: 'Missing cost' },
    { id: 'readonlyzero', title: 'Known zero', cost: 0 },
    { id: 'readonlyestimate', title: 'Valid estimate', cost: 2 },
  ]
  await page.route('**/api/collections/tasks/records?**', route => route.fulfill({ json: {
    page: 1, perPage: 200, totalPages: 1, totalItems: catalog.length,
    items: catalog.map(task => ({ ...task, project, status: 'open' })),
  } }))
  await page.route('**/api/kankaku/totals', async route => {
    const body = route.request().postDataJSON()
    if (body.filters?.project !== project) return route.fallback()
    const total = { entries: 4, work_ms: 4000, cost: 2 }
    const groups = body.group_by === 'task' ? catalog.map(task => ({
      group_key: task.id, entries: 1, work_ms: 1000,
      ...('cost' in task ? { cost: task.cost } : {}),
      cost_estimated_entries: task.id === 'readonlyestimate' ? 1 : 0,
    })) : body.group_by === 'day' ? [{ ...total, work_ms: body.filters.task ? 1000 : 4000, cost: body.filters.task ? 0 : 2, group_key: '0' }] : []
    await route.fulfill({ json: { total, groups, total_pages: 1, total_groups: groups.length, page: 1, per_page: body.per_page } })
  })
  await page.goto(path)
  for (const reload of [false, true]) {
    if (reload) await page.reload()
    const panel = page.getByTestId('project-time-series')
    await expect(panel.getByTestId('chart-svg')).toBeVisible()
    for (const task of catalog) {
      const card = page.getByTestId('task-card').filter({ has: page.getByRole('heading', { name: task.title, exact: true }) })
      await expect(card.locator('dd').first()).toHaveText('1s')
      await expect(card.locator('dd').nth(1)).toHaveText(task.cost === 0 ? '$0.00' : task.cost === 2 ? '$2.00' : 'No disponible')
      await expect(card).not.toContainText(/NaN|Infinity/)
    }
    await panel.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Coste', exact: true }).click()
    await expect(panel.getByTestId('chart-svg')).toHaveCount(0)
    await expect(panel.getByRole('status')).toBeVisible()
    await panel.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Tiempo de trabajo', exact: true }).click()
    await expect(panel.getByTestId('chart-svg')).toBeVisible()
  }
})

// Analytics responses are intercepted read-only; no backend fixtures are created.
for (const width of [1440, 390]) {
  test(`client analytics chart has keyboard-readable local-day bars at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/organizacion?tab=clients')
    const card = page.getByTestId('client-card').first()
    await expect(card).toBeVisible()
    const name = (await card.getByRole('heading').innerText()).trim()
    const requests: any[] = []
    await page.route('**/api/kankaku/totals', async route => {
      const body = route.request().postDataJSON()
      // Shell badges have no selected-client filter; leave those requests alone.
      if (!body.filters?.client || !['none', 'day', 'project'].includes(body.group_by)) return route.fallback()
      requests.push(body)
      const total = {
        entries: 3, work_ms: 7_200_000, wall_ms: 7_200_000, waiting_ms: 0,
        input: 0, output: 0, cache_read: 0, cache_write: 0, cost: 9,
        waiting_unavailable_entries: 0, cost_unknown_entries: 1, cost_estimated_entries: 0,
        cost_known_entries: 2, cost_known_sum: 9, unlinked_entries: 0, distinct_sessions: 1,
      }
      await route.fulfill({ json: {
        total, groups: body.group_by === 'day' ? [{ ...total, group_key: '1', work_ms: body.filters.project ? 3_600_000 : 7_200_000, cost: body.filters.project ? 4 : 9 }]
          : body.group_by === 'project' ? [{ ...total, group_key: 'chart-project', work_ms: 3_600_000, cost: 4 }] : [],
        page: 1, per_page: 200, total_groups: body.group_by === 'none' ? 0 : 1, total_pages: 1,
      } })
    })
    await card.getByRole('button', { name: `Abrir detalles de ${name}`, exact: true }).click()
    await expect(page).toHaveURL(/\/organizacion\/clientes\/[^/?#]+$/)
    const path = new URL(page.url()).pathname
    for (const navigation of ['opened', 'direct', 'reload']) {
      if (navigation === 'direct') await page.goto(path)
      if (navigation === 'reload') await page.reload()
      await expectClientKpis(page, width)
      const analytics = page.getByTestId('client-analytics')
      await expect(analytics.getByTestId('chart-svg')).toBeVisible()
      await expect(analytics.getByTestId('kpi-value').nth(2)).toHaveText('3')
      await expect(analytics.getByTestId('client-kpis')).toContainText('1 registro')
      const bars = analytics.locator('g[role="img"][tabindex="0"]')
      await expect(bars).toHaveCount(30)
      await bars.first().focus()
      await expect(bars.first()).toBeFocused()
      await expect(bars.first()).toHaveAttribute('aria-label', /\d{4}-\d{2}-\d{2}:.*0/)
      await page.keyboard.press('Tab')
      await expect(bars.nth(1)).toBeFocused()
      await expect(bars.nth(1)).toHaveAttribute('aria-label', /chart-project/)
      await expect(bars.nth(1)).toHaveAttribute('aria-label', /Otros/)
      await expect(analytics.getByRole('heading', { name: 'Tendencia', exact: true })).toHaveCount(0)
      await expect(analytics.getByTestId('client-time-series')).toHaveAttribute('aria-label', /Tiempo de trabajo.*\d{4}-\d{2}-\d{2}/)
      const panel = analytics.getByTestId('client-time-series')
      await expect(panel.getByRole('combobox', { name: 'Métrica', exact: true })).toHaveText('Tiempo de trabajo')
      await expect(panel.getByRole('combobox', { name: 'Agrupar por', exact: true })).toHaveCount(0)
      await expect(panel.getByRole('combobox')).toHaveCount(1)
      await expect(bars.nth(1).locator('rect[fill]')).toHaveCount(2)
      await expect(bars.nth(1).locator('rect[fill]').first()).toHaveAttribute('fill', 'var(--chart-1)')
      await expect(bars.nth(1).locator('rect[fill]').nth(1)).toHaveAttribute('fill', '#64748b')
      await panel.getByRole('combobox', { name: 'Métrica', exact: true }).focus()
      await page.keyboard.press('Enter')
      await page.getByRole('option', { name: 'Coste', exact: true }).click()
      await expect(panel.getByRole('combobox', { name: 'Métrica', exact: true })).toHaveText('Coste')
      await expect(panel).toHaveAttribute('aria-label', /Coste/)
      await expect(bars.nth(1)).toHaveAttribute('aria-label', /\$/)
      await expect(bars.nth(1)).toHaveAttribute('aria-label', /chart-project/)
      await expect(bars.nth(1).locator('rect[fill]')).toHaveCount(2)
      await expect(panel.getByRole('combobox', { name: 'Agrupar por', exact: true })).toHaveCount(0)
      await panel.getByRole('combobox', { name: 'Métrica', exact: true }).click()
      await page.getByRole('option', { name: 'Tiempo de trabajo', exact: true }).click()
      await expect(bars.nth(1)).toHaveAttribute('aria-label', /chart-project/)
      for (const section of ['Contacto', 'Notas', 'Proyectos']) await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible()
    }
    const id = path.split('/').at(-1)
    expect(requests.length).toBeGreaterThanOrEqual(6)
    for (const request of requests) {
      expect(request.filters.client).toBe(id)
      if (request.filters.project) expect(request.filters.project).toBe('chart-project')
    }
    const projectDays = requests.filter(request => request.group_by === 'day' && request.filters.project)
    expect(projectDays.length).toBeGreaterThanOrEqual(3)
    // One ranked project per chart load; never an all-project daily scan.
    expect(projectDays.length).toBeLessThanOrEqual(15)
    const day = requests.find(r => r.group_by === 'day')
    expect(day.day_boundaries).toHaveLength(31)
    await page.getByRole('button', { name: 'Volver', exact: true }).click()
    await expect(page).toHaveURL(/\/organizacion\?tab=clients$/)
  })
}

for (const state of ['fallback', 'capped', 'ranking denied']) {
  test(`client project chart handles ${state} without backend writes`, async ({ page }, testInfo) => {
    if (state === 'fallback') console.info('Readonly browser artifacts:', testInfo.project.outputDir)
    await page.goto('/organizacion?tab=clients')
    const card = page.getByTestId('client-card').first()
    await expect(card).toBeVisible()
    const requests: any[] = []
    let chartFrom = ''
    await page.route('**/api/kankaku/totals', async route => {
      const body = route.request().postDataJSON()
      if (!body.filters?.client) return route.fallback()
      if (body.group_by === 'none' && !chartFrom) chartFrom = body.from
      if (state !== 'ranking denied') {
        await route.fulfill({ status: 404, json: { message: 'Unavailable' } })
        return
      }
      if (body.group_by === 'project' && body.from === chartFrom) {
        await route.fulfill({ status: 403, json: { message: 'Denied' } })
        return
      }
      const total = { entries: 1, work_ms: 100, cost: 1 }
      const groups = body.group_by === 'day' ? [{ ...total, group_key: '0' }] : []
      await route.fulfill({ json: { total, groups, total_pages: 1, page: 1, per_page: 200, total_groups: groups.length } })
    })
    await page.route('**/api/collections/task_entries/records?**', async route => {
      const url = new URL(route.request().url())
      const filter = url.searchParams.get('filter') ?? ''
      // Shell badge fallback scans are not client analytics requests.
      if (!filter.includes('client =') || !filter.includes('started_at >=')) return route.fallback()
      requests.push(Object.fromEntries(url.searchParams))
      const client = filter.match(/client = "([^"]+)"/)?.[1]
      const started = filter.match(/started_at >= "([^"]+)"/)?.[1]
      await route.fulfill({ json: { page: 1, perPage: 2000, totalPages: state === 'capped' ? 2 : 1, totalItems: state === 'capped' ? 2001 : 1, items: [{ id: 'readonly-entry', client, project: 'fallback-project', started_at: started, work_ms: 100, cost: 1, cost_quality: 'measured' }] } })
    })
    await card.getByRole('button', { name: /^Abrir detalles de/ }).click()
    const chart = page.getByTestId('client-time-series')
    for (const reload of [false, true]) {
      if (reload) await page.reload()
      await expect(chart).toBeVisible()
      await expect(chart.getByRole('combobox', { name: 'Agrupar por', exact: true })).toHaveCount(0)
      await expect(chart.getByRole('combobox', { name: 'Métrica', exact: true })).toHaveText('Tiempo de trabajo')
      if (state === 'fallback') {
        await expect(chart.getByTestId('chart-svg')).toBeVisible()
        await expect(chart.locator('g[role="img"]').first()).toHaveAttribute('aria-label', /fallback-project/)
      }
      else {
        await expect(chart.getByTestId('chart-svg')).toHaveCount(0)
        await expect(chart.getByRole(state === 'capped' ? 'status' : 'alert')).toBeVisible()
      }
    }
    const id = new URL(page.url()).pathname.split('/').at(-1)
    if (state === 'ranking denied') {
      // A denied chart must not trigger chart fallback; card shares still read rows.
      expect(requests).toHaveLength(2)
      for (const request of requests) {
        const start = request.filter.match(/started_at >= "([^"]+)"/)?.[1]
        expect(new Date(start).getTime()).not.toBe(new Date(chartFrom).getTime())
      }
    }
    for (const request of requests) {
      expect(request.perPage).toBe('2000')
      expect(request.filter).toContain(`client = "${id}"`)
      expect(request.filter).toContain('started_at >=')
      expect(request.filter).toContain('started_at <=')
    }
  })
}

for (const state of ['empty', 'denied']) {
  test(`client analytics exposes ${state} reads without backend writes`, async ({ page }) => {
    await page.goto('/organizacion?tab=clients')
    const card = page.getByTestId('client-card').first()
    await expect(card).toBeVisible()
    await page.route('**/api/kankaku/totals', async route => {
      if (!['none', 'day'].includes(route.request().postDataJSON().group_by)) return route.fallback()
      if (state === 'denied') {
        await route.fulfill({ status: 403, json: { message: 'Read denied', data: {} } })
        return
      }
      const total = Object.fromEntries(['entries', 'work_ms', 'wall_ms', 'waiting_ms', 'input', 'output', 'cache_read', 'cache_write', 'cost', 'waiting_unavailable_entries', 'cost_unknown_entries', 'cost_estimated_entries', 'cost_known_entries', 'cost_known_sum', 'unlinked_entries', 'distinct_sessions'].map(key => [key, 0]))
      await route.fulfill({ json: { total, groups: [], page: 1, per_page: 200, total_groups: 0, total_pages: 0 } })
    })
    await card.getByRole('button', { name: /^Abrir detalles de/ }).click()
    for (const reload of [false, true]) {
      if (reload) await page.reload()
      if (state === 'empty') {
        await expectClientKpis(page, 1280)
        await expect(page.getByText('No hay datos en este periodo', { exact: true })).toBeVisible()
        await expect(page.getByTestId('chart-svg')).toHaveCount(0)
      }
      else {
        await expect(page.locator('main [role="alert"]')).toBeVisible()
        await expect(page.getByTestId('client-analytics')).toHaveCount(0)
      }
    }
    await page.getByRole('button', { name: 'Volver', exact: true }).click()
    await expect(page).toHaveURL(/\/organizacion\?tab=clients$/)
  })
}

for (const width of [1440, 390]) {
  test(`client project cards retain catalog information and readonly navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    let projectRows: any[] = []
    await page.route('**/api/collections/projects/records?**', async route => {
      const response = await route.fetch()
      projectRows = (await response.json()).items
      await route.fulfill({ response })
    })
    const requests: any[] = []
    await page.route('**/api/kankaku/totals', async route => {
      const body = route.request().postDataJSON()
      if (body.group_by !== 'project' || !body.filters?.client) return route.fallback()
      requests.push(body)
      const project = projectRows.find(p => p.client === body.filters.client)
      const total = { entries: 1, work_ms: 7_200_000, cost: 9 }
      await route.fulfill({ json: { total, groups: project ? [{ ...total, group_key: project.id }] : [], page: 1, per_page: 200, total_groups: project ? 1 : 0, total_pages: 1 } })
    })
    // Choose a client with an existing project rather than assuming the first
    // client card has projects (the live catalog's first client can be empty).
    await existingProject(page)
    const id = projectRows.find(p => p.client)?.client
    expect(id).toBeTruthy()
    await page.goto(`/organizacion/clientes/${id}`)
    await expect(page).toHaveURL(/\/organizacion\/clientes\/[^/?#]+$/)
    await expect(page.getByTestId('detail-client-name')).toBeVisible()
    const clientName = (await page.getByTestId('detail-client-name').innerText()).trim()
    const path = new URL(page.url()).pathname
    for (const navigation of ['opened', 'direct', 'reload']) {
      if (navigation === 'direct') await page.goto(path)
      if (navigation === 'reload') await page.reload()
      const section = page.getByTestId('client-projects')
      await expect(section.getByTestId('project-card').first()).toBeVisible()
      const geometry = await section.evaluate(el => {
        const style = getComputedStyle(el)
        const heading = el.querySelector('h2')!
        const grid = el.querySelector(':scope > div.grid')!
        return { border: style.borderTopWidth, padding: style.paddingTop, weight: getComputedStyle(heading).fontWeight,
          spacing: grid.getBoundingClientRect().top - heading.getBoundingClientRect().bottom }
      })
      expect(geometry).toEqual({ border: '0px', padding: '16px', weight: '700', spacing: 16 })
      const selected = projectRows.filter(p => p.client === id)
      expect(selected.length).toBeGreaterThan(0)
      await expect(section.getByTestId('project-card')).toHaveCount(selected.length)
      for (const [index, project] of selected.entries()) {
        const card = section.getByTestId('project-card').filter({ has: page.locator(`a[href="/organizacion/clientes/${project.client}/proyectos/${project.id}"]`) })
        await expect(card.getByRole('heading', { level: 3 })).toHaveText(project.name)
        await expect(card.locator('p[title]')).toHaveText(clientName + (project.code ? ` / ${project.code}` : ''))
        await expect(card.locator('dt').nth(0)).toHaveText('Tiempo')
        await expect(card.locator('dt').nth(1)).toHaveText('Coste')
        await expect(card.locator('dd').nth(0)).toHaveText(index === 0 ? '2h' : '0s')
        await expect(card.locator('dd').nth(1)).toHaveText(index === 0 ? '$9.00' : '$0.00')
        await expect(card.getByText(project.active ? 'Activo' : 'Inactivo', { exact: true })).toBeVisible()
        await expect(card.getByRole('link', { name: `Abrir detalles de ${project.name}`, exact: true })).toHaveAttribute('href', `/organizacion/clientes/${project.client}/proyectos/${project.id}`)
        await expect(card.getByRole('button')).toHaveCount(0)
        await expect(card.locator('[data-testid*="write-action"]')).toHaveCount(0)
      }
      const columns = await section.locator(':scope > div.grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)
      expect(columns).toBe(width < 1024 ? 2 : 3)
      await expectClientKpis(page, width)
    }
    expect(requests).toHaveLength(6)
    const starts = [...new Set(requests.map(body => body.from))].sort()
    expect(starts).toHaveLength(2)
    expect(requests.filter(body => body.from === starts[0])).toHaveLength(3)
    expect(requests.filter(body => body.from === starts[1])).toHaveLength(3)
    for (const body of requests) {
      expect(body.filters).toEqual({ client: id })
      expect(body.per_page).toBe(200)
    }
    const first = projectRows.find(p => p.client === id)
    const link = page.getByTestId('client-projects').getByRole('link', { name: `Abrir detalles de ${first.name}`, exact: true })
    await link.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/organizacion/clientes/${first.client}/proyectos/${first.id}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(first.name)
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.getByTestId('client-projects').getByTestId('project-card').first()).toBeVisible()
  })
}

for (const width of [1440, 390]) {
  for (const state of ['known', 'partial', 'zero', 'unknown', 'capped']) {
    test(`client project cost share is ${state} at ${width}px without writes`, async ({ page }, testInfo) => {
      if (width === 1440 && state === 'known') console.info('Cost-share browser artifacts:', testInfo.project.outputDir)
      await page.setViewportSize({ width, height: 1000 })
      let projectRows: any[] = []
      await page.route('**/api/collections/projects/records?**', async route => {
        const response = await route.fetch()
        const json = await response.json()
        projectRows = json.items ?? []
        await route.fulfill({ response, json })
      })
      await existingProject(page)
      const project = projectRows.find(row => row.client)
      expect(project).toBeTruthy()
      const requests: any[] = []
      await page.route('**/api/kankaku/totals', async route => {
        const body = route.request().postDataJSON()
        if (body.filters?.client !== project.client) return route.fallback()
        requests.push(body)
        const total = { entries: 2, work_ms: 200, cost: state === 'zero' ? 0 : 100,
          cost_unknown_entries: state === 'unknown' ? 1 : 0, cost_estimated_entries: 0, cost_known_entries: 2, cost_known_sum: state === 'zero' ? 0 : 100 }
        const row = { ...total, entries: 1, work_ms: 50, cost: state === 'zero' ? 0 : 25, cost_unknown_entries: 0, cost_known_sum: state === 'zero' ? 0 : 25 }
        const groups = body.group_by === 'project' ? [{ ...row, group_key: project.id }]
          : body.group_by === 'day' ? [{ ...(body.filters.project ? row : total), group_key: '0' }] : []
        await route.fulfill({ json: { total, groups, page: 1, per_page: 200, total_groups: groups.length,
          total_pages: state === 'capped' && body.group_by === 'project' ? 2 : 1 } })
      })
      await page.route('**/api/collections/task_entries/records?**', async route => {
        const url = new URL(route.request().url())
        const filter = url.searchParams.get('filter') ?? ''
        if (!filter.includes(`client = "${project.client}"`) || !filter.includes('started_at >=')) return route.fallback()
        expect(url.searchParams.get('perPage')).toBe('2000')
        const start = filter.match(/started_at >= "([^"]+)"/)?.[1]
        const items = [
          { id: 'readonly-cost-share', client: project.client, project: project.id, started_at: start, work_ms: 50, cost: state === 'zero' ? 0 : 25, cost_quality: state === 'unknown' ? 'unknown' : 'estimated' },
          { id: 'readonly-unassigned', client: project.client, project: '', started_at: start, work_ms: 150, cost: state === 'zero' ? 0 : 75, cost_quality: state === 'unknown' ? 'unknown' : 'measured' },
          ...(state === 'partial' ? [{ id: 'readonly-unknown', client: project.client, project: project.id, started_at: start, work_ms: 1, cost: 900, cost_quality: 'unknown' }] : []),
        ]
        await route.fulfill({ json: { page: Number(url.searchParams.get('page') ?? 1), perPage: 2000,
          totalPages: state === 'capped' ? 100 : 1, totalItems: state === 'capped' ? 200000 : items.length, items } })
      })
      const path = `/organizacion/clientes/${project.client}`
      await page.goto(path)
      for (const reload of [false, true]) {
        if (reload) await page.reload()
        const card = page.getByTestId('project-card').filter({ has: page.locator(`a[href="/organizacion/clientes/${project.client}/proyectos/${project.id}"]`) })
        const track = card.getByTestId('project-cost-share')
        const fill = card.getByTestId('project-cost-share-fill')
        await expect(track).toBeVisible()
        await expect(track).toHaveClass(/bg-background/)
        expect(await track.evaluate(el => {
          const probe = document.createElement('span')
          probe.style.backgroundColor = 'var(--background)'
          el.appendChild(probe)
          const expected = getComputedStyle(probe).backgroundColor
          probe.remove()
          return getComputedStyle(el).backgroundColor === expected
        })).toBe(true)
        if (['known', 'partial', 'capped'].includes(state)) {
          await expect(track).toHaveAttribute('role', 'meter')
          await expect(track).toHaveAttribute('aria-valuemin', '0')
          await expect(track).toHaveAttribute('aria-valuemax', '100')
          await expect(track).toHaveAttribute('aria-valuenow', '25')
          await expect(track).toHaveAttribute('aria-label', /coste de tokens disponible .*del coste disponible del cliente .*\(25%\)/)
          const ratio = await track.evaluate(el => el.firstElementChild!.getBoundingClientRect().width / el.getBoundingClientRect().width)
          expect(ratio).toBeCloseTo(0.25, 2)
          await expect(fill).toHaveClass(/bg-primary/)
        }
        else {
          await expect(track).toHaveAttribute('role', 'img')
          await expect(track).not.toHaveAttribute('aria-valuenow')
          await expect(track).not.toHaveAttribute('aria-label', /%/)
          expect(await fill.evaluate(el => el.getBoundingClientRect().width)).toBe(0)
          await expect(track).toHaveAttribute('aria-label', state === 'zero' ? /\$0\.00.*sin coste que comparar/ : /sin datos de coste/)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await expect(card.getByRole('link')).toHaveAttribute('href', `/organizacion/clientes/${project.client}/proyectos/${project.id}`)
      }
      const back = page.getByTestId('client-detail-back')
      await expect(back).toHaveAccessibleName('Volver')
      await expect(back).toHaveAttribute('title', 'Volver')
      const backBox = await back.boundingBox()
      const titleBox = await page.getByTestId('detail-client-name').boundingBox()
      expect(backBox!.x).toBeLessThan(titleBox!.x)
      // Align with the title block (name and code), as in project detail.
      const titleBlock = await page.getByTestId('detail-client-name').locator('..').boundingBox()
      expect(Math.abs(backBox!.y + backBox!.height / 2 - titleBlock!.y - titleBlock!.height / 2)).toBeLessThan(2)
      await back.click()
      await expect(page).toHaveURL(/\/organizacion\?tab=clients$/)
      await page.goto(path)
      const cardOverall = requests.filter(request => request.group_by === 'none').sort((a, b) => a.from.localeCompare(b.from))[0]
      const cardGroups = requests.find(request => request.group_by === 'project' && request.from === cardOverall.from)
      expect(cardGroups).toBeTruthy()
      expect(cardGroups.to).toBe(cardOverall.to)
      expect(cardGroups.filters).toEqual({ client: project.client })
      expect(cardOverall.filters).toEqual({ client: project.client })
      const card = page.getByTestId('project-card').filter({ has: page.locator(`a[href="/organizacion/clientes/${project.client}/proyectos/${project.id}"]`) })
      await card.getByRole('link').focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(new RegExp(`/organizacion/clientes/${project.client}/proyectos/${project.id}$`))
    })
  }
}

for (const state of ['no projects', 'project totals denied']) {
  test(`client project section handles ${state} directly and after reload`, async ({ page }) => {
    if (state === 'no projects') {
      await page.route('**/api/collections/projects/records?**', route => route.fulfill({ json: { items: [], page: 1, perPage: 200, totalItems: 0, totalPages: 0 } }))
    }
    else {
      await page.route('**/api/kankaku/totals', async route => {
        const body = route.request().postDataJSON()
        if (body.group_by !== 'project' || !body.filters?.client) return route.fallback()
        await route.fulfill({ status: 403, json: { message: 'Project totals denied', data: {} } })
      })
    }
    await page.goto('/organizacion?tab=clients')
    const card = page.getByTestId('client-card').first()
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: /^Abrir detalles de/ }).click()
    await expect(page).toHaveURL(/\/organizacion\/clientes\/[^/?#]+$/)
    for (const reload of [false, true]) {
      if (reload) await page.reload()
      if (state === 'no projects') {
        await expect(page.getByTestId('client-projects')).toContainText('Sin proyectos')
        await expect(page.getByTestId('client-projects').getByTestId('project-card')).toHaveCount(0)
        await expectClientKpis(page, 1280)
      }
      else {
        await expect(page.locator('main [role="alert"]')).toBeVisible()
        await expect(page.getByTestId('client-projects')).toHaveCount(0)
      }
    }
    await page.getByRole('button', { name: 'Volver', exact: true }).click()
    await expect(page).toHaveURL(/\/organizacion\?tab=clients$/)
  })
}

for (const state of ['protected', 'viewer', 'editable', 'archived']) {
  test(`client sidebar ${state} appearance uses readonly intercepted records`, async ({ page }) => {
    if (state === 'viewer') {
      await page.route('**/api/collections/users/auth-refresh', async route => {
        const response = await route.fetch()
        const body = await response.json()
        body.record.role = 'viewer'
        await route.fulfill({ response, json: body })
      })
    }
    await page.route('**/api/collections/clients/records?**', async route => {
      const response = await route.fetch()
      const body = await response.json()
      body.items = [{ ...body.items[0], id: 'readonlyclient', name: 'Readonly client', code: 'readonly', unassigned: state === 'protected', active: state !== 'archived', website: 'https://example.com', contact_email: 'contact@example.com', contact_phone: '+34 123', notes: 'Readonly notes' }]
      await route.fulfill({ response, json: body })
    })
    await page.goto('/organizacion/clientes/readonlyclient')
    await expect(page.getByTestId('detail-client-name')).toHaveText('Readonly client')
    const edit = page.getByTestId('client-edit')
    const archive = page.getByTestId('client-archive')
    if (state === 'viewer') {
      await expect(edit).toHaveCount(0)
      await expect(archive).toHaveCount(0)
      await expect(page.locator('[data-testid*="favicon-refresh-button"]')).toHaveCount(0)
    }
    else if (state === 'protected') {
      await expect(edit).toBeDisabled()
      await expect(archive).toBeDisabled()
      await expect(page.locator('[data-testid*="favicon-refresh-button"]')).toHaveCount(0)
    }
    else {
      await expect(archive).toBeEnabled()
      await expect(archive).toHaveText(state === 'archived' ? 'Reactivar' : 'Archivar')
      await edit.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      for (const [id, value] of Object.entries({ 'c-name': 'Readonly client', 'c-code': 'readonly', 'c-website': 'https://example.com', 'c-contact-email': 'contact@example.com', 'c-contact-phone': '+34 123', 'c-notes': 'Readonly notes' })) {
        await expect(dialog.locator(`#${id}`)).toHaveValue(value)
      }
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    }
    await expect(page.getByTestId('client-sidebar')).toContainText('Readonly notes')
  })
}

for (const state of ['wrong task project', 'wrong project client', 'missing project', 'missing client', 'missing task', 'denied parent', 'denied task', 'protected', 'viewer']) {
  test(`nested task ${state} validates the actual chain before detail reads`, async ({ page }) => {
    const client = 'readonlyclient'
    const project = 'readonlyproject'
    const task = 'readonlytask'
    const path = `/organizacion/clientes/${client}/proyectos/${project}/tareas/${task}`
    const reads: string[] = []
    if (state === 'viewer') {
      await page.route('**/api/collections/users/auth-refresh', async route => {
        const response = await route.fetch()
        const body = await response.json()
        body.record.role = 'viewer'
        await route.fulfill({ response, json: body })
      })
    }
    await page.route('**/api/collections/clients/records?**', route => route.fulfill({ json: {
      items: state === 'missing client' ? [] : [{ id: client, name: 'Readonly owner', active: true, unassigned: state === 'protected' }],
      page: 1, perPage: 200, totalPages: 1, totalItems: state === 'missing client' ? 0 : 1,
    } }))
    await page.route('**/api/collections/projects/records?**', route => route.fulfill(state === 'denied parent'
      ? { status: 403, json: { message: 'Denied' } }
      : { json: { items: state === 'missing project' ? [] : [{ id: project, client: state === 'wrong project client' ? 'anotherclient' : client, name: 'Readonly project', active: true }],
        page: 1, perPage: 200, totalPages: 1, totalItems: state === 'missing project' ? 0 : 1 } }))
    await page.route(`**/api/collections/tasks/records/${task}*`, route => route.fulfill(['missing task', 'denied task'].includes(state)
      ? { status: state === 'missing task' ? 404 : 403, json: { message: 'Unavailable' } }
      : { json: { id: task, project: state === 'wrong task project' ? 'anotherproject' : project, title: 'Readonly task', status: 'open', description: '', external_ref: '' } }))
    await page.route('**/api/kankaku/totals', async route => {
      if (route.request().postDataJSON().filters?.task !== task) return route.fallback()
      reads.push('sessions')
      await route.fulfill({ json: { total: { entries: 0 }, groups: [], page: 1, per_page: 50, total_pages: 0, total_groups: 0 } })
    })
    await page.route('**/api/collections/task_entries/records?**', async route => {
      if (!(new URL(route.request().url()).searchParams.get('filter') ?? '').includes('session_id')) return route.fallback()
      reads.push('entries/resume')
      await route.fulfill({ json: { items: [], page: 1, totalPages: 0, totalItems: 0 } })
    })
    const valid = ['protected', 'viewer'].includes(state)
    for (const reload of [false, true]) {
      if (reload) await page.reload()
      else await page.goto(path)
      if (valid) {
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Readonly task')
        await expect(page.getByRole('heading', { name: 'Sesiones', exact: true })).toBeVisible()
        if (state === 'viewer') {
          await expect(page.getByRole('button', { name: 'Editar tarea', exact: true })).toHaveCount(0)
          await expect(page.getByRole('tab')).toHaveCount(0)
        }
      }
      else {
        await expect(page.locator(`main [role="${state.startsWith('denied') ? 'alert' : 'status'}"]`)).toHaveText(state.startsWith('denied') ? 'Ha ocurrido un error' : 'Tarea no encontrada o no disponible')
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Editar tarea', exact: true })).toHaveCount(0)
        expect(reads).toEqual([])
      }
      await expect(page.getByTestId('project-time-series')).toHaveCount(0)
      await expect(page.getByTestId('task-card')).toHaveCount(0)
    }
    if (valid) expect(reads).toEqual(['sessions', 'sessions'])
    await page.getByRole('button', { name: 'Volver', exact: true }).click()
    await expect(page).toHaveURL(`${new URL(page.url()).origin}/organizacion/clientes/${client}/proyectos/${project}`)
  })
}

test('missing task ID keeps an accessible return to the Tasks tab', async ({ page }) => {
  await page.goto('/organizacion/tareas/missingtaskid')
  await expect(page.locator('main [role="status"]')).toHaveText('Tarea no encontrada o no disponible')
  await page.reload()
  await expect(page.locator('main [role="status"]')).toHaveText('Tarea no encontrada o no disponible')
  await page.getByRole('button', { name: 'Volver', exact: true }).click()
  await expect(page).toHaveURL(/\/organizacion\?tab=tasks$/)
})

test('missing client ID keeps an accessible return to the Clients tab', async ({ page }) => {
  await page.goto('/organizacion/clientes/missingclientid')
  await expect(page.locator('main [role="status"]')).toHaveText('Cliente no encontrado o no disponible')
  await page.reload()
  await expect(page.locator('main [role="status"]')).toHaveText('Cliente no encontrado o no disponible')
  await page.getByRole('button', { name: 'Volver', exact: true }).click()
  await expect(page).toHaveURL(/\/organizacion\?tab=clients$/)
})

for (const prefix of ['/projects', '/organizacion/proyectos']) {
  test(`${prefix} redirect preserves actual ownership, repeated query values and hash`, async ({ page }) => {
    const { name, path } = await existingProject(page)
    const id = path.split('/').at(-1)
    await page.goto(`${prefix}/${id}?comparison=one&comparison=two&tab=tasks#project-context`)
    await expect(page).toHaveURL(`${new URL(page.url()).origin}${path}?comparison=one&comparison=two&tab=tasks#project-context`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(page.getByRole('tablist')).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await page.getByRole('button', { name: 'Volver', exact: true }).click()
    await expect(page).toHaveURL(`${new URL(page.url()).origin}${path.split('/proyectos/')[0]}`)
  })
}

for (const state of ['wrong owner', 'missing project', 'missing client', 'denied catalog', 'denied analytics']) {
  test(`nested project ${state} never exposes another owner or stale metrics`, async ({ page }) => {
    const { name, path } = await existingProject(page)
    if (state === 'denied catalog') {
      await page.route('**/api/collections/projects/records?**', route => route.fulfill({ status: 403, json: { message: 'Denied' } }))
    }
    if (state === 'denied analytics') {
      await page.route('**/api/kankaku/totals', async route => {
        if (!route.request().postDataJSON().filters?.project) return route.fallback()
        await route.fulfill({ status: 403, json: { message: 'Denied' } })
      })
    }
    let target = path
    if (state === 'missing project') target = path.replace(/\/proyectos\/[^/]+$/, '/proyectos/missingproject')
    if (state === 'missing client') target = path.replace(/\/clientes\/[^/]+/, '/clientes/missingclient')
    if (state === 'wrong owner') {
      // Derive a different real client from the existing readonly catalog.
      await page.goto('/organizacion?tab=clients')
      const buttons = page.getByTestId('client-card').getByRole('button', { name: /^Abrir detalles de/ })
      await expect(buttons.first()).toBeVisible()
      for (const button of await buttons.all()) {
        await button.click()
        await expect(page.getByTestId('detail-client-name')).toBeVisible()
        const candidate = new URL(page.url()).pathname
        if (candidate !== path.split('/proyectos/')[0]) { target = `${candidate}/proyectos/${path.split('/').at(-1)}`; break }
        await page.goto('/organizacion?tab=clients')
      }
      expect(target).not.toBe(path)
    }
    for (const reload of [false, true]) {
      if (reload) await page.reload()
      else await page.goto(target)
      await expect(page.locator(`main [role="${state.startsWith('denied') ? 'alert' : 'status'}"]`)).toHaveText(state.startsWith('denied') ? 'Ha ocurrido un error' : 'Proyecto no encontrado o no disponible')
      await expect(page.getByRole('heading', { level: 1, name, exact: true })).toHaveCount(0)
      await expect(page.getByTestId('kpi-value')).toHaveCount(0)
      await expect(page.locator('main a[href*="/tareas/"]')).toHaveCount(0)
    }
  })
}

for (const prefix of ['/projects', '/organizacion/proyectos']) {
  test(`${prefix} missing project remains a coherent readonly state`, async ({ page }) => {
    await page.goto(`${prefix}/missingproject`)
    await expect(page.locator('main [role="status"]')).toHaveText('Proyecto no encontrado o no disponible')
    await expect(page).toHaveURL(new RegExp(`${prefix}/missingproject$`))
  })
}

test('entry project relation opens the actual client-owned project', async ({ page }) => {
  const catalog = new Map<string, string>()
  await page.route('**/api/collections/projects/records?**', async route => {
    const response = await route.fetch()
    for (const project of (await response.json()).items ?? []) catalog.set(project.id, project.client)
    await route.fulfill({ response })
  })
  await page.goto('/entries')
  await page.locator('.entries-mode').getByRole('button', { name: 'Entradas', exact: true }).click()
  const buttons = page.locator('main [data-entry-detail]')
  await expect(buttons.first()).toBeVisible()
  let target = ''
  for (const button of await buttons.all()) {
    await button.click()
    const sheet = page.locator('[data-slot="sheet-content"]')
    await expect(sheet).toBeVisible()
    // The live entry drawer is a separate caller; page-only task styling must not leak.
    await expect(sheet.locator('h1')).toHaveCount(0)
    const drawerTitle = sheet.locator('h2').first()
    await expect(drawerTitle).toHaveCSS('font-size', '16px')
    await expect(sheet.getByTestId('task-detail-body')).toHaveCount(0)
    const link = sheet.locator('a[href*="/proyectos/"]')
    if (await link.count()) {
      target = (await link.getAttribute('href'))!
      const id = target.split('/').at(-1)!
      expect(target).toBe(`/organizacion/clientes/${catalog.get(id)}/proyectos/${id}`)
      await link.click()
      break
    }
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
  }
  expect(target).not.toBe('')
  await expect(page).toHaveURL(`${new URL(page.url()).origin}${target}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('Organization list links and palette project results open the canonical child', async ({ page }) => {
  const { name, path } = await existingProject(page)
  await page.goto('/organizacion?tab=projects')
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  const link = page.getByRole('link', { name, exact: true })
  await expect(link).toHaveAttribute('href', path)
  await link.click()
  await expect(page).toHaveURL(new RegExp(`${path}$`))
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('combobox').fill(name)
  await page.getByRole('option', { name, exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`${path}$`))
})
