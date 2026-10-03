import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Locator } from '@playwright/test'
import { comboboxTrigger, loginAs, pbOrigin, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'

// Tailwind rings are box shadows too: reject offsets/blur, not zero-offset spread.
async function flat(locator: Locator) {
  await expect(locator).toBeVisible()
  const shadow = await locator.evaluate(el => getComputedStyle(el).boxShadow)
  if (shadow === 'none') return
  const layers = shadow.split(/,(?![^()]*\))/)
  for (const layer of layers) {
    const lengths = layer.replace(/(?:rgba?|oklch|color|color-mix)\([^)]*\)/g, '').match(/-?[\d.]+px/g)?.map(parseFloat) ?? []
    expect(lengths.slice(0, 3), shadow).toEqual([0, 0, 0])
  }
}

async function keyboardRing(locator: Locator) {
  await locator.focus()
  await locator.press('Shift+Tab')
  await locator.page().keyboard.press('Tab')
  await expect(locator).toBeFocused()
  await expect.poll(() => locator.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe('none')
  await expect.poll(() => locator.evaluate(el => getComputedStyle(el).getPropertyValue('--tw-ring-shadow'))).toMatch(/[234]px/)
  await flat(locator)
}

// Inspect all application source, including components without a safe viewer flow.
test('no decorative shadow utility remains; indicators and boundaries remain', () => {
  const root = resolve('app')
  function inspect(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name)
      if (entry.isDirectory()) inspect(path)
      else if (/\.(vue|ts|css)$/.test(entry.name)) {
        expect(readFileSync(path, 'utf8'), path).not.toMatch(/(?:^|[\s:'"`])(?:[\w:[\]-]+:)?(?:drop-)?shadow-(?!none\b)(?:xs|sm|md|lg|xl|2xl|\[)/m)
      }
    }
  }
  inspect(root)
  for (const component of ['input/Input.vue', 'textarea/Textarea.vue', 'checkbox/Checkbox.vue', 'button/index.ts']) {
    const source = readFileSync(resolve(root, 'components/ui', component), 'utf8')
    expect(source).toContain('focus-visible:ring-')
    expect(source).toContain('aria-invalid:')
    expect(source).toContain('border')
  }
  expect(readFileSync(resolve(root, 'components/ui/toast/Toaster.vue'), 'utf8')).toContain('rounded-lg border p-3')
})

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1280, 390]) {
    test(`${theme} ${width}: flat surfaces, pink active navigation, keyboard indicators`, async ({ page }, testInfo) => {
      test.setTimeout(90_000)
      if (process.env.PW_BASE_URL !== 'http://127.0.0.1:3003' || pbOrigin() !== 'http://127.0.0.1:8093') throw new Error('Requires the owned read-only :3003/:8093 stack')
      await page.route('**/api/**', async route => {
        const { pathname } = new URL(route.request().url())
        const method = route.request().method()
        // Subscription registration is unnecessary for static surface inspection.
        if (pathname === '/api/realtime' && method === 'POST') return route.abort()
        expect(method === 'GET' || (method === 'POST' && (pathname.endsWith('/auth-with-password') || pathname.endsWith('/auth-refresh') || pathname === '/api/kankaku/totals')), `${method} ${pathname}`).toBe(true)
        await route.continue()
      })
      await page.addInitScript(({ theme }) => {
        localStorage.setItem('kankaku-locale', 'en')
        localStorage.setItem('kankaku-color-mode', theme)
        localStorage.setItem('kankaku-entries-group-by-session', '0')
      }, { theme })
      await page.setViewportSize({ width, height: 1000 })
      await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
      await expect(page.locator('html')).toHaveClass(theme)
      // Exclude only the external dev overlay from captures, never app CSS.
      await page.addStyleTag({ content: '#nuxt-devtools-container, nuxt-devtools-frame { display: none !important; }' })
      const evidence: Record<string, unknown> = {}
      for (const route of ['/', '/clients', '/projects', '/entries']) {
        await page.goto(route)
        const cards = page.locator(route === '/clients' ? '[data-testid="client-card"]' : route === '/projects' ? '[data-testid="project-card"]' : '[data-slot="card"]')
        await expect(cards.first()).toBeVisible()
        for (const card of await cards.all()) {
          await flat(card)
          expect(await card.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px')
        }
        // Resolve modern color syntax through canvas to assert painted sRGB pixels.
        const surfaces = await cards.first().evaluate(el => {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')!
          const rgb = (value: string) => { ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3) }
          return { canvas: rgb(getComputedStyle(document.querySelector('[data-testid="scroll-area"]')!.parentElement!).backgroundColor), card: rgb(getComputedStyle(el).backgroundColor) }
        })
        expect(surfaces.canvas).toEqual(theme === 'light' ? [249, 249, 249] : [20, 20, 20])
        expect(surfaces.card).toEqual(theme === 'light' ? [255, 255, 255] : [28, 28, 28])
        evidence[route] = surfaces
        await page.screenshot({ path: testInfo.outputPath(`${route === '/' ? 'dashboard' : route.slice(1)}-${theme}-${width}.png`) })
        if (route === '/clients') {
          await cards.first().getByRole('button').last().click()
          const sheet = page.locator('[data-slot="sheet-content"]')
          await flat(sheet)
          for (const box of await sheet.locator('.rounded-md.p-3').all()) await expect(box).toHaveCSS('border-top-width', '0px')
          await expect(sheet.locator('.border-t').first()).toHaveCSS('border-top-width', '1px')
          await page.keyboard.press('Escape')
        }
      }
      if (width === 390) {
        await page.getByRole('button', { name: 'Open menu', exact: true }).click()
        await flat(page.locator('[data-slot="sheet-content"]'))
      }
      const active = page.getByRole('link').filter({ has: page.locator('span', { hasText: /^Entries$/ }) }).filter({ visible: true })
      await expect(active).toHaveCount(1)
      await expect(active).toHaveAttribute('aria-current', 'page')
      const navigation = await active.evaluate(el => {
        const css = getComputedStyle(el)
        const ctx = document.createElement('canvas').getContext('2d')!
        const rgb = (color: string) => { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data] }
        return { background: css.backgroundColor, label: rgb(getComputedStyle(el.querySelector('span')!).color), icon: rgb(getComputedStyle(el.querySelector('svg')!).color), primary: rgb(css.getPropertyValue('--sidebar-primary').trim()), foreground: rgb(css.getPropertyValue('--sidebar-foreground').trim()) }
      })
      expect(navigation.background).toBe('rgba(0, 0, 0, 0)')
      expect(navigation.icon).toEqual(navigation.primary)
      expect(navigation.label).toEqual(theme === 'dark' ? navigation.foreground : navigation.primary)
      await keyboardRing(active)
      await active.hover()
      await expect.poll(() => active.evaluate(el => {
        const ctx = document.createElement('canvas').getContext('2d')!
        const rgb = (color: string) => { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data] }
        const css = getComputedStyle(el)
        return JSON.stringify(rgb(css.backgroundColor)) === JSON.stringify(rgb(css.getPropertyValue('--muted').trim()))
      })).toBe(true)
      evidence.navigation = navigation
      await page.screenshot({ path: testInfo.outputPath(`navigation-${theme}-${width}.png`) })
      if (width === 390) await page.keyboard.press('Escape')
      const more = page.getByRole('button', { name: /More filters/ })
      await keyboardRing(more)
      await more.click()
      const model = page.getByLabel('Model', { exact: true })
      await keyboardRing(model)
      await expect(model).toHaveCSS('border-top-width', '0px')
      await expect(model).toHaveCSS('height', '44px')
      await comboboxTrigger(page, 'Status').click()
      await flat(page.locator('[data-slot="combobox-list"]'))
      await page.keyboard.press('Escape')
      await page.locator('#entries-date-range').click()
      await flat(page.locator('[data-slot="popover-content"]'))
      await page.keyboard.press('Escape')
      const divider = page.locator(width === 390 ? '[data-testid="mobile-entry-row"]' : '[data-slot="table-row"]').first()
      await expect(divider).toHaveCSS(width === 390 ? 'border-top-width' : 'border-bottom-width', '1px')
      const exportButton = page.getByRole('button', { name: 'Export', exact: true })
      await exportButton.click()
      await flat(page.locator('[data-slot="dropdown-menu-content"]'))
      const download = page.waitForEvent('download')
      await page.getByRole('menuitem', { name: 'CSV', exact: true }).click()
      await download
      const toast = page.getByTestId('toast-viewport').locator('.pointer-events-auto').last()
      await flat(toast)
      await expect(toast).toHaveClass(/bg-success/)
      await page.route('**/api/collections/task_entries/records?*', async route => {
        if (new URL(route.request().url()).searchParams.get('perPage') === '500') await route.fulfill({ status: 500, json: { message: 'Read-only export failure fixture' } })
        else await route.continue()
      })
      await exportButton.click()
      await page.getByRole('menuitem', { name: 'CSV', exact: true }).click()
      await expect(toast).toHaveClass(/bg-destructive/)
      await flat(toast)
      if (width === 1280) {
        await page.keyboard.press('ControlOrMeta+k')
        await flat(page.locator('[data-slot="dialog-content"]'))
        await page.keyboard.press('Escape')
      }
      await testInfo.attach('surface-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' })
    })
  }
}
