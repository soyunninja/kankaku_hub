import { writeFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { login, pbOrigin } from './helpers'

// Owner controls must render for hover coverage, but no record writes are allowed.
test.beforeEach(async ({ page }) => {
  if (process.env.PW_BASE_URL !== 'http://127.0.0.1:3003' || pbOrigin() !== 'http://127.0.0.1:8093') throw new Error('Requires owned read-only stack')
  await page.route('**/api/**', route => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    const readonlyPost = request.method() === 'POST' && (/\/auth-(with-password|refresh)$/.test(pathname) || pathname.startsWith('/api/kankaku/totals') || pathname === '/api/realtime')
    if (request.method() === 'GET' || readonlyPost) return route.continue()
    throw new Error(`Forbidden write: ${request.method()} ${pathname}`)
  })
  await page.addInitScript(() => localStorage.setItem('kankaku-locale', 'en'))
})

async function openTable(page: Page, path: string) {
  await page.goto(path)
  if (path === '/tasks') await page.getByRole('group', { name: 'Task view' }).getByRole('button', { name: 'List', exact: true }).click()
  if (path === '/clients' || path === '/projects') {
    await page.getByRole('group', { name: /Client view|Project view/ }).getByRole('button', { name: 'List', exact: true }).click()
  }
  await expect(page.locator('table tbody tr').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
}

async function appearance(element: Locator) {
  return element.evaluate(node => {
    const style = getComputedStyle(node)
    const rect = node.getBoundingClientRect()
    return {
      background: style.backgroundColor, color: style.color, opacity: style.opacity,
      transform: style.transform, shadow: style.boxShadow, filter: style.filter,
      border: style.borderBottomWidth, width: rect.width, height: rect.height,
      decoration: style.textDecorationLine,
    }
  })
}

async function unchangedOnHover(page: Page, element: Locator) {
  await element.scrollIntoViewIfNeeded()
  await page.mouse.move(0, 0)
  await page.waitForTimeout(180)
  const rest = await appearance(element)
  await element.hover()
  await page.waitForTimeout(180)
  expect(await appearance(element)).toEqual(rest)
}

async function borderlessActions(page: Page) {
  const widths = await page.locator('button, [data-slot="button"]').evaluateAll(nodes => nodes
    .filter(node => node.getClientRects().length && !node.matches('[role="checkbox"], [role="radio"], [role="switch"], [role="combobox"], [data-slot="combobox-trigger"]'))
    .map(node => getComputedStyle(node).borderWidth))
  expect(widths.length).toBeGreaterThan(0)
  for (const width of widths) expect(width).toBe('0px')
}

async function gutters(card: Locator) {
  return card.evaluate(node => {
    const style = getComputedStyle(node)
    const content = getComputedStyle(node.querySelector('[data-slot="card-content"]')!)
    return {
      top: style.paddingTop, bottom: style.paddingBottom,
      left: content.paddingLeft, right: content.paddingRight,
      border: style.borderTopWidth, shadow: style.boxShadow,
    }
  })
}

async function mutedBorderless(control: Locator) {
  const result = await control.evaluate(node => {
    const style = getComputedStyle(node)
    // Resolve active-theme colors through the browser, including OKLCH tokens.
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    const rgb = (color: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    const background = rgb(style.backgroundColor)
    const muted = rgb(style.getPropertyValue('--muted').trim())
    const luminance = (channels: number[]) => channels.map(channel => {
      const value = channel / 255
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
    }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index]!, 0)
    const contrast = (foreground: string) => {
      const light = luminance(rgb(foreground))
      const dark = luminance(background)
      return (Math.max(light, dark) + .05) / (Math.min(light, dark) + .05)
    }
    return {
      muted: background.join(',') === muted.join(','), border: style.borderTopWidth,
      textContrast: contrast(style.color),
      placeholderContrast: node instanceof HTMLInputElement ? contrast(getComputedStyle(node, '::placeholder').color) : 4.5,
    }
  })
  expect(result.muted).toBe(true)
  expect(result.border).toBe('0px')
  expect(result.textContrast).toBeGreaterThanOrEqual(4.5)
  expect(result.placeholderContrast).toBeGreaterThanOrEqual(4.5)
}

async function focusVisible(page: Page, control: Locator) {
  await page.mouse.move(0, 0)
  await page.keyboard.press('Tab')
  await control.focus()
  await expect(control).toBeFocused()
  expect(await control.evaluate(node => {
    const style = getComputedStyle(node)
    return node.matches(':focus-visible') && (style.boxShadow !== 'none' || Number.parseFloat(style.outlineWidth) > 0)
  })).toBe(true)
  await control.evaluate(node => (node as HTMLElement).blur())
}

test('Dashboard greeting uses safe reactive auth names, localized fallback and bold name only', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  let name: string | undefined = '  Ada Example  '
  let authenticationRequests = 0
  let profileReads = 0
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/collections/users/records') profileReads++
  })
  await page.route('**/api/collections/users/auth-*', async route => {
    authenticationRequests++
    const response = await route.fetch()
    const body = await response.json()
    // Alter only fictional fixture auth responses, never server profiles or tokens.
    if (name === undefined) delete body.record.name
    else body.record.name = name
    await route.fulfill({ response, json: body })
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await login(page)
  const heading = page.locator('main h1')
  await expect(heading).toHaveText('Hello, Ada Example', { timeout: 15_000 })
  await expect(heading.locator('.font-extrabold')).toHaveText('Ada Example')
  expect(await heading.evaluate(node => getComputedStyle(node).fontWeight)).toBe('600')
  expect(await heading.locator('.font-extrabold').evaluate(node => ({ size: getComputedStyle(node).fontSize, weight: getComputedStyle(node).fontWeight }))).toEqual({ size: '24px', weight: '800' })
  expect(await heading.evaluate(node => getComputedStyle(node).fontSize)).toBe('20px')
  await expect(page).toHaveTitle(/Dashboard/)
  const initialAuthRequests = authenticationRequests
  await page.getByRole('link', { name: 'Clients', exact: true }).click()
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await expect(heading).toHaveText('Hello, Ada Example')
  expect(authenticationRequests).toBe(initialAuthRequests)
  for (const [language, navigation, expected] of [
    ['Español', 'Panel', 'Hola, Ada Example'],
    ['日本語', 'ダッシュボード', 'こんにちは、Ada Example'],
  ]) {
    await page.goto('/settings')
    await page.getByRole('button', { name: language, exact: true }).click()
    await page.getByRole('link', { name: navigation, exact: true }).click()
    await expect(heading).toHaveText(expected!)
  }
  name = '<script>window.greetingInjected = true</script> A long fictional name'.repeat(2)
  await page.reload()
  await expect(heading).toHaveText(`Hello, ${name}`)
  await expect(heading.locator('script')).toHaveCount(0)
  expect(await page.evaluate(() => 'greetingInjected' in window)).toBe(false)
  await page.setViewportSize({ width: 320, height: 1000 })
  expect(await heading.evaluate(node => node.scrollWidth - node.clientWidth)).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
  await expect(heading.locator('.font-extrabold')).toHaveText(name)
  await page.screenshot({ path: testInfo.outputPath('safe-long-greeting-mobile-320.png') })
  for (const blank of ['   ', undefined]) {
    name = blank
    await page.reload()
    await expect(heading).toHaveText('Hello')
    await expect(heading.locator('.font-extrabold')).toHaveCount(0)
    expect(await heading.evaluate(node => getComputedStyle(node).fontSize)).toBe('20px')
  }
  expect(profileReads).toBe(0)
  await page.screenshot({ path: testInfo.outputPath('greeting-fallback.png') })
})

for (const theme of ['light', 'dark']) {
  test(`padded table cards and real hover/focus states: ${theme}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await page.addInitScript(theme => localStorage.setItem('kankaku-color-mode', theme), theme)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await login(page)
    await page.goto('/')
    const reference = await gutters(page.getByTestId('breakdown-by-client'))
    expect(reference).toEqual({ top: '24px', bottom: '24px', left: '24px', right: '24px', border: '0px', shadow: 'none' })
    const observations = []
    for (const path of ['/tasks', '/unassigned', '/sessions-without-task', '/entries', '/clients', '/projects']) {
      await openTable(page, path)
      await expect(page.locator('html')).toHaveClass(new RegExp(theme))
      await borderlessActions(page)
      const table = page.locator('table').first()
      const card = table.locator('xpath=ancestor::*[@data-slot="card"][1]')
      if (!['/clients', '/projects'].includes(path)) expect(await gutters(card)).toEqual(reference)
      const title = page.locator('main h1')
      expect(await title.evaluate(node => ({ size: getComputedStyle(node).fontSize, weight: getComputedStyle(node).fontWeight }))).toEqual({ size: '20px', weight: '600' })
      // Every loaded top-level row, every header, and first-row cells/controls.
      const targets = table.locator(':scope > thead tr, :scope > thead th, :scope > tbody > tr, :scope > tbody > tr:first-child > td, :scope > tbody > tr:first-child button, :scope > tbody > tr:first-child a')
      for (let i = 0; i < await targets.count(); i++) await unchangedOnHover(page, targets.nth(i))
      const controls = table.locator('button:not([disabled]), a')
      if (await controls.count()) await focusVisible(page, controls.first())
      observations.push({ path, theme, gutters: await gutters(card), rows: await table.locator('tbody > tr').count() })
      if (path === '/entries') {
        await expect(page.getByTestId('session-group-row').first().locator('td')).toHaveCount(10)
        for (const width of [1280, 1440]) {
          await page.setViewportSize({ width, height: 1000 })
          const expand = page.getByTestId('session-group-row').first().locator('button[aria-expanded]')
          const box = await expand.boundingBox()
          expect(box!.x).toBeGreaterThanOrEqual(0)
          expect(box!.x + box!.width).toBeLessThanOrEqual(width - 24)
          await focusVisible(page, expand)
        }
        const expand = page.getByTestId('session-group-row').first().locator('button[aria-expanded]')
        await expand.press('Enter')
        const nested = page.getByTestId('session-group-entries').first()
        await expect(nested.locator('table thead th')).toHaveCount(4)
        await expect(nested.locator('[data-entry-detail]').first()).toBeVisible()
        await unchangedOnHover(page, nested.locator('tbody tr').first())
        await unchangedOnHover(page, nested.locator('[data-entry-detail]').first())
        await nested.locator('[data-entry-detail]').first().press('Enter')
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toBeHidden()
        await page.mouse.move(0, 0)
        await page.screenshot({ path: testInfo.outputPath(`entries-padded-${theme}.png`) })
        await page.getByRole('button', { name: 'Entries', exact: true }).click()
        await expect(table.locator('thead th')).toHaveCount(8)
        for (const control of await table.locator('thead button').all()) await unchangedOnHover(page, control)
        const cost = table.locator('thead th').last()
        const sortedResponse = (sort: string) => page.waitForResponse(response => {
          const url = new URL(response.url())
          return url.pathname === '/api/collections/task_entries/records' && url.searchParams.get('sort') === sort
        })
        const descending = sortedResponse('-cost')
        await cost.getByRole('button').click()
        expect((await descending).ok()).toBe(true)
        await expect(cost).toHaveAttribute('aria-sort', 'descending')
        const ascending = sortedResponse('cost')
        await cost.getByRole('button').click()
        expect((await ascending).ok()).toBe(true)
        await expect(cost).toHaveAttribute('aria-sort', 'ascending')
        await expect(table.locator('tbody [data-entry-detail]').first()).toBeVisible()
        await table.locator('tbody tr button[title]').first().click()
        await expect(page.getByRole('button', { name: 'Remove session filter' })).toBeVisible()
        const checkbox = table.locator('input[type="checkbox"]').first()
        await checkbox.check()
        await unchangedOnHover(page, checkbox)
        await expect(checkbox).toBeChecked()
      }
      if (path === '/unassigned') {
        const checkbox = table.getByRole('checkbox').first()
        await expect(checkbox).toHaveCSS('border-top-width', '1px')
        // Group selection resolves all entry IDs asynchronously before updating.
        await checkbox.click()
        await expect(checkbox).toBeChecked()
        await unchangedOnHover(page, checkbox)
        await expect(checkbox).toBeChecked()
      }
      if (path === '/tasks') {
        await page.mouse.move(0, 0)
        await expect(page.getByRole('tooltip')).toHaveCount(0)
        await page.screenshot({ path: testInfo.outputPath(`tasks-padded-${theme}.png`) })
      }
      if (path === '/projects') {
        const sort = table.locator('thead button').first()
        await sort.click()
        await expect(table.locator('thead th').first()).not.toHaveAttribute('aria-sort', 'none')
        const outside = page.getByRole('group', { name: 'Project view' }).getByRole('button', { name: 'Grid', exact: true })
        expect(await outside.getAttribute('class')).toContain('hover:')
        await outside.click()
        const gridAction = page.locator('main [data-slot="button"][data-size="icon"]').first()
        expect(await gridAction.getAttribute('class')).toContain('hover:')
      }
    }
    await writeFile(testInfo.outputPath(`table-surfaces-${theme}.json`), JSON.stringify(observations, null, 2))
  })

  test(`local catalog/filter refinements and Dashboard spacing: ${theme}`, async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await page.addInitScript(theme => localStorage.setItem('kankaku-color-mode', theme), theme)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await login(page)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto('/')
      const metrics = page.getByTestId('kpi-value').first().locator('xpath=ancestor::*[contains(@class,"grid-cols-2")][1]')
      const breakdown = page.getByTestId('breakdown-by-client').locator('..')
      for (const grid of [metrics, breakdown]) {
        expect(await grid.evaluate(node => ({ row: getComputedStyle(node).rowGap, column: getComputedStyle(node).columnGap }))).toEqual({ row: '24px', column: '24px' })
      }
      for (const path of ['/clients', '/projects']) {
        const collection = path.slice(1)
        const catalogResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/collections/${collection}/records` && response.request().method() === 'GET')
        await page.goto(path)
        const catalog = await (await catalogResponse).json()
        const search = page.locator(path === '/clients' ? '#client-search' : '#project-search')
        // getFullList may skip totals; this fixture fits in one complete page.
        expect(catalog.items.length).toBeLessThan(catalog.perPage)
        await expect(search).toHaveAttribute('placeholder', `${catalog.items.length} ${collection}, search ${collection}…`)
        const placeholder = await search.getAttribute('placeholder')
        await mutedBorderless(search)
        await focusVisible(page, search)
        expect(await page.locator('main h1').locator('..').getByText(/^\d+ (clients|projects)$/).count()).toBe(0)
        await search.fill('no-matching-catalog-item')
        await expect(search).toHaveAttribute('placeholder', placeholder!)
        await search.fill('')
        if (path === '/projects') await mutedBorderless(page.locator('#project-client-filter'))
      }
      await page.goto('/tasks')
      await mutedBorderless(page.locator('#tasks-filter-client'))
      await mutedBorderless(page.locator('#tasks-filter-project'))
      await expect(page.getByRole('button', { name: /Keyboard shortcuts/ })).toHaveCount(0)
      const taskMode = page.getByRole('group', { name: 'Task view' })
      expect(await taskMode.evaluate(node => getComputedStyle(node).borderRadius)).toBe('16px')
      await expect(taskMode.getByRole('button', { name: 'Board', exact: true })).toHaveAttribute('data-variant', 'secondary')
      await taskMode.getByRole('button', { name: 'List', exact: true }).click()
      await expect(taskMode.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(taskMode.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('data-variant', 'secondary')
      await expect(page.locator('table tbody tr').first()).toBeVisible()
      await page.goto('/entries')
      const layout = page.getByTestId('entries-filter-layout')
      expect(await layout.evaluate(node => {
        const style = getComputedStyle(node)
        return { background: style.backgroundColor, padding: style.padding, border: style.borderTopWidth, radius: style.borderRadius, shadow: style.boxShadow, card: node.closest('[data-slot="card"]') !== null }
      })).toEqual({ background: 'rgba(0, 0, 0, 0)', padding: '0px', border: '0px', radius: '0px', shadow: 'none', card: false })
      await mutedBorderless(page.locator('#entries-filter-client'))
      if (width < 768) await page.getByRole('button', { name: 'More filters · 0', exact: true }).click()
      await mutedBorderless(page.locator('#entries-filter-project'))
      const mode = page.locator('.entries-mode')
      await expect(mode.getByRole('button', { name: 'Sessions', exact: true })).toHaveAttribute('data-variant', 'secondary')
      expect(await mode.evaluate(node => getComputedStyle(node).borderRadius)).toBe('16px')
      await mode.getByRole('button', { name: 'Entries', exact: true }).click()
      await expect(mode.getByRole('button', { name: 'Entries', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(mode.getByRole('button', { name: 'Entries', exact: true })).toHaveAttribute('data-variant', 'secondary')
      await mode.getByRole('button', { name: 'Sessions', exact: true }).click()
      await borderlessActions(page)
      await page.screenshot({ path: testInfo.outputPath(`filter-layer-${theme}-${width}.png`) })
    }
  })

  test(`mobile padded cards preserve full measurements: ${theme}`, async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await page.addInitScript(theme => localStorage.setItem('kankaku-color-mode', theme), theme)
    await login(page)
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      for (const path of ['/tasks', '/unassigned', '/sessions-without-task', '/entries']) {
        if (path === '/entries') {
          await page.goto(path)
          await expect(page.getByTestId('mobile-menu-trigger')).toBeVisible()
          await expect(page.getByTestId('entries-mobile-ledger')).toBeVisible()
          await expect(page.getByTestId('session-group-row').first()).toBeVisible()
        }
        else await openTable(page, path)
        const card = page.locator('[data-slot="card"]').filter({ has: page.locator(path === '/entries' ? '[data-testid="entries-mobile-ledger"]' : 'table') }).first()
        expect(await gutters(card)).toEqual({ top: '24px', bottom: '24px', left: '24px', right: '24px', border: '0px', shadow: 'none' })
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
        await borderlessActions(page)
        if (path === '/entries') {
          for (const metric of await page.locator('.metric').all()) {
            expect(await metric.evaluate(node => node.scrollWidth - node.clientWidth)).toBe(0)
            expect(await metric.evaluate(node => getComputedStyle(node).textOverflow)).not.toBe('ellipsis')
          }
          await page.screenshot({ path: testInfo.outputPath(`mobile-entries-${theme}-${width}.png`) })
        }
      }
    }
  })
}
