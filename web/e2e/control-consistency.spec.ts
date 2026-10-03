import { writeFile } from 'node:fs/promises'
import type { Locator } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { loginAs, pbOrigin, OWNER_EMAIL, OWNER_PASSWORD, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'

// Composite computed colors over their real ancestors; don't count a nonexistent
// border as a boundary or an alpha ring as opaque.
async function contrast(control: Locator, property: 'borderTopColor' | 'backgroundColor' | 'color' | 'ring') {
  return control.evaluate((el, property) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const rgba = (color: string) => {
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1)
      return [...ctx.getImageData(0, 0, 1, 1).data].map((v, i) => i === 3 ? v / 255 : v)
    }
    const mix = (a: number[], b: number[]) => a.slice(0, 3).map((v, i) => v * a[3]! + b[i]! * (1 - a[3]!)).concat(1)
    const bg = (node: Element | null) => {
      const chain: Element[] = []
      for (let n = node; n; n = n.parentElement) chain.unshift(n)
      return chain.reduce((b, n) => mix(rgba(getComputedStyle(n).backgroundColor), b), [255, 255, 255, 1])
    }
    const lum = (rgb: number[]) => rgb.slice(0, 3).reduce((sum, v, i) => {
      v /= 255
      return sum + (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i]!
    }, 0)
    const style = getComputedStyle(el)
    const outer = bg(el.parentElement), fill = bg(el)
    const color = rgba(property === 'ring' ? style.getPropertyValue('--tw-ring-color') : style[property])
    const surface = property === 'color' ? fill : outer
    const painted = mix(color, surface)
    const a = lum(painted), b = lum(surface)
    return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), alpha: color[3], opacity: style.opacity }
  }, property)
}

async function mutedToolbar(control: Locator, width: number) {
  await expect(control).toBeVisible({ timeout: 30_000 })
  await expect(control).toBeEnabled()
  await control.page().mouse.move(0, 0)
  await expect(control).toHaveCSS('height', '44px')
  await expect(control).toHaveCSS('border-radius', '16px')
  await expect(control).toHaveCSS('border-top-width', '0px')
  await expect(control).toHaveCSS('font-size', width < 768 ? '16px' : '14px')
  const colors = () => control.evaluate(el => {
    const style = getComputedStyle(el)
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const pixel = (color: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 1, 1)
      return [...ctx.getImageData(0, 0, 1, 1).data]
    }
    return { actual: pixel(style.backgroundColor), muted: pixel(style.getPropertyValue('--muted').trim()), opacity: style.opacity }
  })
  const parity = async () => {
    const result = await colors()
    expect(result.actual).toEqual(result.muted)
    expect(result.actual[3]).toBe(255)
    expect(result.opacity).toBe('1')
  }
  await expect(async () => { await parity() }).toPass()
  await control.hover()
  // Wait for finite CSS transitions, then assert final paint, not an intermediate sample.
  await control.evaluate(async el => { await Promise.all(el.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))) })
  await parity()
  await keyboardFocus(control)
  return colors()
}

async function square(control: Locator, size: number) {
  await expect(control).toHaveCSS('height', `${size}px`)
  await expect(control).toHaveCSS('width', `${size}px`)
  await expect(control).toHaveCSS('border-top-width', '0px')
}

async function keyboardFocus(control: Locator) {
  await control.page().keyboard.press('Tab')
  await control.focus()
  await expect(control).toBeFocused()
  expect(await control.evaluate(el => el.matches(':focus-visible'))).toBe(true)
  await expect(control).toHaveCSS('opacity', '1')
  const ring = await contrast(control, 'ring')
  expect(ring.alpha).toBe(1)
  expect(ring.opacity).toBe('1')
  expect(ring.ratio).toBeGreaterThanOrEqual(3)
}

// Decode an actual Chromium screenshot, not the date input's computed text color.
async function nativeIconPixels(input: Locator) {
  const png = await input.screenshot()
  return input.page().evaluate(async data => {
    const image = new Image(); image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(image, 0, 0)
    const lum = (rgb: number[]) => rgb.reduce((sum, v, i) => {
      v /= 255
      return sum + (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i]!
    }, 0)
    const bg = [...ctx.getImageData(image.width - 40, Math.floor(image.height / 2), 1, 1).data].slice(0, 3)
    const background = lum(bg)
    let visiblePixels = 0
    for (let x = image.width - 34; x < image.width - 12; x++) for (let y = image.height / 2 - 10; y < image.height / 2 + 10; y++) {
      const pixel = lum([...ctx.getImageData(x, y, 1, 1).data].slice(0, 3))
      if ((Math.max(pixel, background) + .05) / (Math.min(pixel, background) + .05) >= 3) visiblePixels++
    }
    return visiblePixels
  }, png.toString('base64'))
}

for (const theme of ['light', 'dark']) for (const width of [320, 390, 1280]) {
  test(`${theme} ${width}: muted toolbar rest and settled hover`, async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    if (process.env.PW_BASE_URL !== 'http://127.0.0.1:3003' || pbOrigin() !== 'http://127.0.0.1:8093') throw new Error('Owned stack required')
    const mutations: string[] = []
    await page.route('**/api/**', async route => {
      const { pathname } = new URL(route.request().url())
      const method = route.request().method()
      const allowed = method === 'GET' || (method === 'POST' && (pathname.endsWith('/auth-with-password') || pathname.endsWith('/auth-refresh') || pathname === '/api/kankaku/totals' || pathname === '/api/realtime'))
      if (!allowed) { mutations.push(`${method} ${pathname}`); await route.abort(); return }
      await route.continue()
    })
    await page.addInitScript(theme => {
      localStorage.setItem('kankaku-color-mode', theme)
      localStorage.setItem('kankaku-locale', 'en')
    }, theme)
    await page.setViewportSize({ width, height: 1100 })
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD)
    const evidence: unknown[] = []
    await page.goto('/')
    const period = page.getByRole('button').filter({ has: page.locator('svg.lucide-calendar-range') })
    evidence.push(await mutedToolbar(period, width))
    await period.click()
    await expect(page.getByLabel('Start', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(period).toBeFocused()
    const dashboardExport = page.getByRole('button', { name: 'Export', exact: true })
    evidence.push(await mutedToolbar(dashboardExport, width))
    await dashboardExport.click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dashboardExport).toBeFocused()
    await page.goto('/tasks')
    const history = page.getByTestId('tasks-toolbar').getByRole('button', { name: 'Completed history', exact: true })
    evidence.push(await mutedToolbar(history, width))
    await history.click()
    await expect(history).toHaveAttribute('aria-pressed', 'true')
    await history.click()
    await expect(history).toHaveAttribute('aria-pressed', 'false')
    await expect(history).toBeFocused()
    await page.goto('/unassigned')
    const assign = page.getByRole('button', { name: 'Assign group', exact: true }).first()
    evidence.push(await mutedToolbar(assign, width)) // Group action needs no selection; never submit it.
    await page.goto('/entries')
    for (const trigger of [page.locator('#entries-date-range'), page.locator('#entries-more-filters'), page.getByRole('button', { name: 'Export', exact: true })]) {
      evidence.push(await mutedToolbar(trigger, width))
      const isMore = await trigger.getAttribute('id') === 'entries-more-filters'
      await trigger.click()
      if (isMore) {
        await expect(trigger).toHaveAttribute('aria-expanded', 'true')
        await trigger.click()
        await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      } else {
        await page.keyboard.press('Escape')
      }
      await expect(trigger).toBeFocused()
    }
    expect(mutations).toEqual([])
    const colors = JSON.stringify({ theme, width, evidence, mutations }, null, 2)
    await writeFile(testInfo.outputPath('muted-toolbar-colors.json'), colors)
    await testInfo.attach('muted-toolbar-colors', { body: colors, contentType: 'application/json' })
    await page.screenshot({ path: testInfo.outputPath(`toolbar-${theme}-${width}.png`) })
  })

  test(`${theme} ${width}: shared standalone and segmented geometry`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    if (process.env.PW_BASE_URL !== 'http://127.0.0.1:3003' || pbOrigin() !== 'http://127.0.0.1:8093') throw new Error('Owned stack required')
    await page.route('**/api/**', async route => {
      const { pathname } = new URL(route.request().url())
      const method = route.request().method()
      const allowed = method === 'GET' || (method === 'POST' && (pathname.endsWith('/auth-with-password') || pathname.endsWith('/auth-refresh') || pathname === '/api/kankaku/totals' || pathname === '/api/realtime'))
      if (!allowed) { await route.abort(); throw new Error(`Forbidden mutation: ${method} ${pathname}`) }
      await route.continue()
    })
    await page.addInitScript(({ theme }) => {
      localStorage.setItem('kankaku-color-mode', theme)
      localStorage.setItem('kankaku-locale', 'en')
    }, { theme })
    await page.setViewportSize({ width, height: 1000 })
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
    for (const path of ['/clients', '/projects', '/tasks', '/entries']) {
      await page.goto(path)
      const group = page.locator('.control-group')
      await expect(group).toBeVisible()
      await expect(group).toHaveCSS('height', '44px')
      await expect(group).toHaveCSS('border-radius', '16px')
      for (const button of await group.locator('button').all()) {
        await expect(button).toHaveCSS('height', '36px')
        await expect(button).toHaveCSS('border-radius', '12px')
      }
      for (const control of await page.locator('[data-slot="input"], [data-slot="combobox-trigger"], #entries-date-range').all()) {
        if (!await control.isVisible()) continue
        await expect(control).toHaveCSS('height', '44px')
        await expect(control).toHaveCSS('border-radius', '16px')
        await expect(control).toHaveCSS('border-top-width', '0px')
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      if (path === '/tasks') {
        expect(await page.locator('main').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
        expect(await page.getByTestId('tasks-toolbar').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
      }
      await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-${theme}-${width}.png`) })
    }
  })

  test(`${theme} ${width}: eight independent defect regressions, read-only`, async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    if (process.env.PW_BASE_URL !== 'http://127.0.0.1:3003' || pbOrigin() !== 'http://127.0.0.1:8093') throw new Error('Owned stack required')
    const mutations: string[] = []
    await page.route('**/api/**', async route => {
      const { pathname } = new URL(route.request().url())
      const method = route.request().method()
      const allowed = method === 'GET' || (method === 'POST' && (pathname.endsWith('/auth-with-password') || pathname.endsWith('/auth-refresh') || pathname === '/api/kankaku/totals' || pathname === '/api/realtime'))
      if (!allowed) { mutations.push(`${method} ${pathname}`); await route.abort(); return }
      await route.continue()
    })
    await page.addInitScript(theme => {
      localStorage.setItem('kankaku-color-mode', theme)
      localStorage.setItem('kankaku-locale', 'en')
    }, theme)
    await page.setViewportSize({ width, height: 1100 })
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD)
    await page.goto('/tasks')
    const toolbar = page.getByTestId('tasks-toolbar')
    await expect(toolbar).toBeVisible()
    expect(await page.locator('main').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    expect(await toolbar.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    for (const control of await toolbar.locator('button').all()) {
      const box = (await control.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
    }
    await expect(toolbar.getByRole('button', { name: 'New task', exact: true })).toHaveCSS('height', '44px')
    await page.locator('[data-slot="card"][role="button"]').first().click()
    const tabs = page.locator('[data-slot="tabs-list"]')
    await expect(tabs).toHaveCSS('height', '44px')
    await expect(tabs).toHaveCSS('padding', '4px')
    await expect(tabs).toHaveCSS('border-radius', '16px')
    for (const tab of await tabs.getByRole('tab').all()) {
      await expect(tab).toHaveCSS('height', '36px')
      await expect(tab).toHaveCSS('border-radius', '12px')
      await expect(tab).toHaveCSS('font-size', width < 768 ? '16px' : '14px')
    }
    // Reka activates on focus. Only the already-active tab is safe to focus.
    await keyboardFocus(tabs.locator('[data-state="active"]'))
    const sheetClose = page.locator('[data-slot="sheet-close"]')
    await square(sheetClose, 44)
    await keyboardFocus(sheetClose)
    await page.keyboard.press('Escape')

    await page.goto('/clients')
    await page.getByRole('group', { name: 'Client view' }).getByRole('button', { name: 'List', exact: true }).click()
    await square(page.locator('tbody').getByRole('button', { name: 'Edit', exact: true }).first(), 32)
    await page.getByRole('button', { name: 'New client', exact: true }).click()
    const dialog = page.locator('[data-slot="dialog-content"]')
    const close = dialog.locator('[data-slot="dialog-close"]')
    await square(close, 44)
    await expect(close).toHaveCSS('border-radius', '16px')
    await keyboardFocus(close)
    const title = (await dialog.locator('[data-slot="dialog-title"]').boundingBox())!
    const closeBox = (await close.boundingBox())!
    expect(title.x + title.width).toBeLessThanOrEqual(closeBox.x)
    const sw = dialog.getByRole('switch')
    await keyboardFocus(sw)
    expect((await contrast(sw.locator('[data-slot="switch-thumb"]'), 'backgroundColor')).ratio).toBeGreaterThanOrEqual(3)
    await sw.click() // Local unsaved form only.
    await expect(sw).toHaveAttribute('data-state', 'unchecked')
    await page.locator('#c-notes').focus()
    await expect.poll(async () => (await contrast(sw, 'backgroundColor')).ratio).toBeGreaterThanOrEqual(3)
    await expect.poll(async () => (await contrast(sw.locator('[data-slot="switch-thumb"]'), 'backgroundColor')).ratio).toBeGreaterThanOrEqual(3)
    const textarea = page.locator('#c-notes')
    await close.focus()
    await expect(textarea).toHaveCSS('border-top-width', '1px')
    expect((await contrast(textarea, 'borderTopColor')).ratio).toBeGreaterThanOrEqual(3)
    await textarea.fill('First local note\nSecond local note\nThird local note')
    await keyboardFocus(textarea)
    expect((await textarea.boundingBox())!.height).toBeGreaterThanOrEqual(64)
    const save = dialog.getByRole('button', { name: 'Save', exact: true })
    await save.hover()
    await expect(save).toHaveCSS('border-top-width', '0px')
    await expect.poll(async () => (await contrast(save, 'color')).ratio).toBeGreaterThanOrEqual(4.5)
    await page.screenshot({ path: testInfo.outputPath(`form-focus-hover-${theme}-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'New client', exact: true })).toBeFocused()

    if (width < 768) await page.getByTestId('mobile-menu-trigger').click()
    const search = page.locator('[data-footer-control="search"]')
    await expect(search).toHaveCSS('height', '44px')
    await expect(search).toHaveCSS('border-radius', '16px')
    await expect(search).toHaveCSS('padding-left', '12px')
    await expect(search).toHaveCSS('font-size', width < 768 ? '16px' : '14px')
    await keyboardFocus(search)
    if (width < 768) await page.keyboard.press('Escape')

    await page.goto('/sessions-without-task')
    const checkbox = page.locator('tbody [role="checkbox"]').first()
    await expect(checkbox).toBeVisible()
    await page.locator('h1').click()
    await expect(checkbox).toHaveCSS('border-top-width', '1px')
    expect((await contrast(checkbox, 'borderTopColor')).ratio).toBeGreaterThanOrEqual(3)
    await checkbox.click() // Local selection, never submit/ignore/attach.
    await keyboardFocus(checkbox)
    await page.getByRole('button', { name: 'Ignore selection', exact: true }).click()
    const destructive = page.getByRole('button', { name: 'Confirm', exact: true })
    await destructive.hover() // Inspect only; never confirm a business operation.
    await expect.poll(async () => (await contrast(destructive, 'color')).ratio).toBeGreaterThanOrEqual(4.5)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await checkbox.click()

    await page.goto('/entries')
    await page.locator('#entries-date-range').click()
    await page.getByRole('button', { name: 'Open calendar for Start', exact: true }).click()
    await square(page.locator('[data-slot="calendar-cell-trigger"]').filter({ visible: true }).first(), 32)
    await square(page.locator('[data-slot="calendar-prev-button"]'), 28)
    await square(page.locator('[data-slot="calendar-next-button"]'), 28)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')

    await page.goto('/')
    await page.getByRole('button').filter({ has: page.locator('svg.lucide-calendar-range') }).click()
    for (const name of ['Start', 'End']) {
      const input = page.getByLabel(name, { exact: true })
      await expect(input).toHaveAttribute('type', 'date')
      await expect(input).toHaveCSS('color-scheme', theme)
      await keyboardFocus(input)
      expect(await nativeIconPixels(input), 'actual Chromium calendar glyph pixels >=3:1').toBeGreaterThanOrEqual(15)
    }
    await page.screenshot({ path: testInfo.outputPath(`native-date-${theme}-${width}.png`) })
    expect(mutations, 'no business write attempts, including task status PATCH').toEqual([])
  })
}
