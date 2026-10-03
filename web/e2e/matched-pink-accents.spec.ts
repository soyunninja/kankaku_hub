import type { Locator, Route } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { avatarColorVar } from '../app/lib/client-avatar'
import { loginAs, pbOrigin, OWNER_EMAIL, OWNER_PASSWORD } from './helpers'

// Read the actual shared classes without importing Vue SFCs into Node.
const badgeSource = readFileSync('app/components/ui/badge/index.ts', 'utf8')
const buttonSource = readFileSync('app/components/ui/button/index.ts', 'utf8')
const badgeClasses = `${badgeSource.match(/cva\(\s*"([^"]+)"/)![1]} ${badgeSource.match(/default:\s*"([^"]+)"/)![1]}`
const linkClasses = `${buttonSource.match(/cva\(\s*"([^"]+)"/)![1]} ${buttonSource.match(/link:\s*"([^"]+)"/)![1]}`

// Resolve browser colors through canvas, then composite encoded sRGB over the
// actual ancestor chain. Alpha indicators are not treated as opaque OKLab blends.
async function sample(locator: Locator, property: 'color' | 'backgroundColor' | 'ring' = 'color') {
  await locator.evaluate(async el => {
    // Flush the label and its ancestor surfaces, then await actual finite paint
    // transitions. First-passing contrast can otherwise sample an intermediate hover.
    const chain: Element[] = []
    for (let node: Element | null = el; node; node = node.parentElement) {
      void getComputedStyle(node).backgroundColor
      chain.push(node)
    }
    // Do not await unrelated sibling animations (for example a closing popup).
    // A reversed/cancelled transition rejects finished; recheck replacement paint.
    for (;;) {
      const animations = [...new Set(chain.flatMap(node => node.getAnimations()))]
        .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime) && animation.playState !== 'finished' && animation.playState !== 'idle')
      if (!animations.length) break
      await Promise.allSettled(animations.map(animation => animation.finished))
    }
  })
  return locator.evaluate((el, property) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const rgba = (value: string) => {
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1)
      return [...ctx.getImageData(0, 0, 1, 1).data].map((v, i) => i === 3 ? v / 255 : v)
    }
    const mix = (a: number[], b: number[]) => a.slice(0, 3).map((v, i) => Math.round(v * a[3]! + b[i]! * (1 - a[3]!))).concat(1)
    const background = (node: Element | null) => {
      const chain: Element[] = []
      for (let n = node; n; n = n.parentElement) chain.unshift(n)
      return chain.reduce((b, n) => mix(rgba(getComputedStyle(n).backgroundColor), b), [255, 255, 255, 1])
    }
    const lum = (rgb: number[]) => rgb.slice(0, 3).reduce((sum, value, i) => {
      const v = value / 255
      return sum + (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i]!
    }, 0)
    const style = getComputedStyle(el)
    const surface = background(property === 'color' ? el : el.parentElement)
    let paint: string
    if (property === 'ring') {
      const layers = style.boxShadow.split(/,(?![^()]*\))/)
      const indicators = layers.filter(layer => {
        const lengths = layer.replace(/(?:rgba?|oklch|oklab|color)\([^)]*\)/g, '').match(/-?[\d.]+px/g)?.map(Number.parseFloat) ?? []
        return lengths.length >= 4 && lengths[3]! > 0
      })
      const layer = indicators.at(-1)
      if (!layer) throw new Error(`No painted focus spread: ${style.boxShadow}`)
      const color = layer.trim().match(/^(?:rgba?|oklch|oklab|color)\([^)]*\)/)?.[0]
      if (!color) throw new Error(`Unrecognized painted focus color: ${layer}`)
      paint = color
    }
    else paint = style[property]
    const raw = rgba(paint)
    const painted = mix(raw, surface)
    const a = lum(painted), b = lum(surface)
    const hex = (rgb: number[]) => `#${rgb.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`
    return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), foreground: hex(painted), surface: hex(surface), alpha: raw[3], opacity: style.opacity, shadow: style.boxShadow, focusVisible: el.matches(':focus-visible') }
  }, property)
}

async function focus(locator: Locator) {
  await locator.page().keyboard.press('Tab')
  await locator.focus()
  await expect(locator).toBeFocused()
  expect(await locator.evaluate(el => el.matches(':focus-visible'))).toBe(true)
}

for (const theme of ['light', 'dark'] as const) for (const width of [320, 390, 1280]) {
  test(`${theme} ${width}: matched roles and real foregrounds, read-only`, async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    if (process.env.PW_BASE_URL !== 'http://127.0.0.1:3003' || pbOrigin() !== 'http://127.0.0.1:8093') throw new Error('Owned read-only stack required')
    const mutations: string[] = []
    await page.route('**/api/**', async route => {
      const method = route.request().method(), pathname = new URL(route.request().url()).pathname
      const allowed = method === 'GET' || (method === 'POST' && (/\/auth-(with-password|refresh)$/.test(pathname) || pathname === '/api/kankaku/totals' || pathname === '/api/realtime'))
      if (!allowed) { mutations.push(`${method} ${pathname}`); await route.abort(); return }
      await route.continue()
    })
    await page.addInitScript(theme => {
      localStorage.setItem('kankaku-color-mode', theme)
      localStorage.setItem('kankaku-locale', 'en')
      localStorage.setItem('kankaku-entries-group-by-session', '0')
    }, theme)
    await page.setViewportSize({ width, height: 1100 })
    const evidence: Record<string, unknown> = {}
    const check = async (name: string, locator: Locator, threshold: number, property: 'color' | 'backgroundColor' | 'ring' = 'color') => {
      await expect(locator).toBeVisible()
      await expect.poll(async () => (await sample(locator, property)).ratio, name).toBeGreaterThanOrEqual(threshold)
      evidence[name] = await sample(locator, property)
    }
    await page.goto('/login')
    await expect(page.locator('html')).toHaveClass(theme)
    await check('login graphic', page.locator('svg.lucide-gauge'), 3)
    await check('login primary label', page.locator('button[type="submit"]'), 4.5)
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD)
    await expect(page.locator('html')).toHaveClass(theme)
    await check('body', page.locator('main h1'), 4.5)
    const roles = await page.locator('html').evaluate(el => {
      const style = getComputedStyle(el), ctx = document.createElement('canvas').getContext('2d')!
      return Object.fromEntries(['primary', 'primary-foreground', 'sidebar-primary', 'sidebar-primary-foreground', 'ring', 'sidebar-ring', 'chart-1', 'background', 'card', 'secondary', 'accent', 'accent-foreground', 'foreground'].map(name => {
        const value = style.getPropertyValue(`--${name}`).trim()
        ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1)
        const hex = `#${[...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`
        return [name, { value, hex }]
      }))
    })
    evidence.roles = roles
    for (const name of ['primary', 'sidebar-primary', 'ring', 'sidebar-ring']) expect(roles[name]!.value).toBe('oklch(0.580 0.228 1)')
    expect(roles['chart-1']!.value).toBe('oklch(0.650 0.228 1)')
    expect(roles['primary-foreground']!.value).toBe('oklch(0.98 0 0)')
    if (theme === 'dark') {
      expect(roles.background!.hex).toBe('#141414'); expect(roles.card!.hex).toBe('#1C1C1C'); expect(roles.secondary!.hex).toBe('#292929')
      expect(roles['accent-foreground']!.value).toBe(roles.foreground!.value)
    }
    else { expect(roles.background!.hex).toBe('#F9F9F9'); expect(roles.card!.hex).toBe('#FFFFFF') }

    if (width < 768) await page.getByTestId('mobile-menu-trigger').click()
    const active = page.locator('nav a[aria-current="page"]').filter({ visible: true })
    await check('active navigation label', active.locator('span').first(), 4.5)
    await check('active navigation icon', active.locator('svg'), 3)
    expect((await sample(active.locator('svg'))).foreground).toBe(roles['sidebar-primary']!.hex)
    expect((await sample(active.locator('span').first())).foreground).toBe(roles[theme === 'dark' ? 'foreground' : 'sidebar-primary']!.hex)
    await expect(active).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await active.hover()
    await check('hover navigation label', active.locator('span').first(), 4.5)
    const hoverLabel = await sample(active.locator('span').first())
    expect(hoverLabel.foreground).toBe(roles.foreground!.hex)
    expect(hoverLabel.surface).toBe(theme === 'light' ? '#F2F2F2' : '#1C1C1C')
    await check('hover navigation icon', active.locator('svg'), 3)
    expect((await sample(active.locator('svg'))).foreground).toBe(roles['sidebar-primary']!.hex)
    await focus(active)
    await check('hover focused navigation label', active.locator('span').first(), 4.5)
    const focusedLabel = await sample(active.locator('span').first())
    expect(focusedLabel.foreground).toBe(hoverLabel.foreground)
    expect(focusedLabel.surface).toBe(hoverLabel.surface)
    await check('navigation focus', active, 3, 'ring')
    await check('shell Gauge graphic', page.locator('svg.lucide-gauge').filter({ visible: true }).first(), 3)
    await page.screenshot({ path: testInfo.outputPath('navigation.png') })
    if (width < 768) await page.keyboard.press('Escape')

    await page.goto('/settings')
    const primary = page.getByRole('button', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true })
    await check('filled primary label', primary, 4.5)
    await primary.hover()
    await check('hover filled primary label', primary, 4.5)
    await focus(primary)
    await check('primary focus', primary, 3, 'ring')
    const website = page.getByRole('link', { name: 'kankaku.io', exact: true })
    await check('settings plain link', website, 4.5)
    await website.hover(); await check('hover settings link', website, 4.5)
    if (theme === 'dark') expect((await sample(website)).foreground).toBe(roles.foreground!.hex)

    // Actual shared variant classes, on a rendered fixture using real theme CSS.
    // No DOM prototype changes or synthetic contrast colors; badge/link variants
    // have no ordinary app flow that renders a focusable linked primary badge.
    await page.locator('main').evaluate((main, variants) => {
      const section = document.createElement('section'); section.dataset.testid = 'pink-variant-fixture'
      section.style.padding = '16px'; section.style.background = 'var(--secondary)'
      const badge = document.createElement('a'); badge.href = '#'; badge.className = variants.badge; badge.textContent = 'Brand badge'; badge.dataset.testid = 'pink-badge'
      const link = document.createElement('a'); link.href = '#'; link.className = variants.link; link.textContent = 'Guide link'; link.dataset.testid = 'pink-link'
      section.append(badge, link); main.append(section)
    }, { badge: badgeClasses, link: linkClasses })
    const badge = page.getByTestId('pink-badge'), link = page.getByTestId('pink-link')
    await check('shared link variant', link, 4.5)
    await badge.hover()
    evidence['hover linked primary badge'] = await sample(badge)
    expect.soft((await sample(badge)).ratio, 'hover linked primary badge label').toBeGreaterThanOrEqual(4.5)
    await focus(badge)
    evidence['linked primary badge focus'] = await sample(badge, 'ring')
    expect.soft((await sample(badge, 'ring')).ratio, 'linked primary badge focus').toBeGreaterThanOrEqual(3)
    expect((await sample(badge, 'ring')).alpha).toBe(1)
    if (theme === 'dark') expect((await sample(badge, 'ring')).foreground).toBe(roles.foreground!.hex)
    await badge.evaluate(el => el.setAttribute('aria-invalid', 'true'))
    await check('linked badge invalid focus', badge, 3, 'ring')
    const destructivePaint = await badge.evaluate(el => {
      const ctx = document.createElement('canvas').getContext('2d')!
      ctx.fillStyle = getComputedStyle(el).getPropertyValue('--destructive').trim(); ctx.fillRect(0, 0, 1, 1)
      return `#${[...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`
    })
    expect((await sample(badge, 'ring')).foreground).toBe(destructivePaint)
    expect((await sample(badge, 'ring')).alpha).toBe(1)
    await badge.evaluate(el => el.removeAttribute('aria-invalid'))
    await page.screenshot({ path: testInfo.outputPath('settings-and-variants.png') })

    // Standard seed IDs are generated by PocketBase and may omit chart-1.
    // Substitute one GET-only identity, preserving the real record's other
    // fields and list counts; the actual ClientAvatar still computes its paint.
    const avatarId = 'pinkclient00001'
    expect(avatarId).toMatch(/^[a-z0-9]{15}$/)
    expect(avatarColorVar(avatarId)).toBe('var(--chart-1)')
    const clientsPattern = '**/api/collections/clients/records?*'
    const chartClient = async (route: Route) => {
      expect(route.request().method()).toBe('GET')
      const response = await route.fetch()
      expect(response.ok()).toBe(true)
      const original = await response.json()
      const index = original.items.findIndex((client: { favicon?: string, unassigned: boolean }) => !client.favicon && !client.unassigned)
      expect(index, 'seeded initials client for chart-1 coverage').toBeGreaterThanOrEqual(0)
      const items = original.items.map((client: { id: string }, i: number) => i === index ? { ...client, id: avatarId } : client)
      const fixture = { ...original, items }
      expect({ ...items[index], id: original.items[index].id }).toEqual(original.items[index])
      expect({ ...fixture, items: original.items }).toEqual(original)
      evidence['chart-1 fixture'] = { id: avatarId, palette: avatarColorVar(avatarId), originalPalette: avatarColorVar(original.items[index].id), totalItems: original.totalItems, identityOnly: true }
      await route.fulfill({ response, json: fixture })
    }
    await page.route(clientsPattern, chartClient)
    await page.goto('/clients')
    const avatar = page.locator('[data-testid="client-avatar"][data-avatar-state="initials"][style*="--chart-1"]').first()
    await check('chart-1 avatar initials', avatar, 4.5)
    expect((await sample(avatar)).surface).toBe(roles['chart-1']!.hex)
    await page.unroute(clientsPattern, chartClient)
    await page.getByRole('button', { name: 'New client', exact: true }).click()
    const dialog = page.locator('[data-slot="dialog-content"]'), sw = dialog.getByRole('switch'), textarea = page.locator('#c-notes')
    await focus(sw); await check('checked switch focus', sw, 3, 'ring')
    await check('checked switch fill', sw, 3, 'backgroundColor')
    await check('checked switch thumb', sw.locator('[data-slot="switch-thumb"]'), 3, 'backgroundColor')
    await textarea.fill('First local note\nSecond local note\nThird local note')
    await focus(textarea); await check('textarea focus', textarea, 3, 'ring')
    const geometry = await textarea.boundingBox()
    expect(geometry!.height).toBeGreaterThanOrEqual(64)
    // Exercise the real focused aria-invalid state without submitting a form.
    await textarea.evaluate(el => el.setAttribute('aria-invalid', 'true'))
    evidence['textarea invalid focus'] = await sample(textarea, 'ring')
    expect.soft((await sample(textarea, 'ring')).ratio, 'textarea invalid focused ring').toBeGreaterThanOrEqual(3)
    expect((await sample(textarea, 'ring')).foreground).toBe(destructivePaint)
    expect((await sample(textarea, 'ring')).alpha).toBe(1)
    await textarea.evaluate(el => el.removeAttribute('aria-invalid'))
    await page.screenshot({ path: testInfo.outputPath('form.png') })
    await page.keyboard.press('Escape')

    await page.goto('/sessions-without-task')
    const checkbox = page.locator('tbody [role="checkbox"]').first()
    await checkbox.click() // Local selection only; never attach/ignore.
    await focus(checkbox); await check('checked checkbox focus', checkbox, 3, 'ring')
    await check('checked checkbox fill', checkbox, 3, 'backgroundColor')
    await check('checkbox checkmark', checkbox.locator('svg'), 3)
    await checkbox.evaluate(el => el.setAttribute('aria-invalid', 'true'))
    evidence['checkbox invalid focus'] = await sample(checkbox, 'ring')
    expect.soft((await sample(checkbox, 'ring')).ratio, 'checkbox invalid focused ring').toBeGreaterThanOrEqual(3)
    expect((await sample(checkbox, 'ring')).foreground).toBe(destructivePaint)
    expect((await sample(checkbox, 'ring')).alpha).toBe(1)
    await checkbox.evaluate(el => el.removeAttribute('aria-invalid'))
    await checkbox.click()

    await page.goto('/entries')
    await page.locator('#entries-date-range').click()
    await page.getByRole('button', { name: 'Open calendar for Start', exact: true }).click()
    const selected = page.locator('[data-slot="calendar-cell-trigger"][data-selected]').filter({ visible: true }).first()
    await check('selected calendar label', selected, 4.5)
    await check('selected calendar graphic', selected, 3, 'backgroundColor')
    if (theme === 'dark') expect((await sample(selected, 'backgroundColor')).foreground).toBe(roles.foreground!.hex)
    await selected.hover(); await check('hover selected calendar label', selected, 4.5)
    await focus(selected); await check('selected calendar focus', selected, 3, 'ring')
    await page.screenshot({ path: testInfo.outputPath('calendar.png') })
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    const item = page.getByRole('menuitem', { name: 'CSV', exact: true })
    await focus(item); await check('menu accent label', item, 4.5)
    if (theme === 'dark') expect((await sample(item)).foreground).toBe(roles.foreground!.hex)
    await page.keyboard.press('Escape')

    const entry = { id: 'pinkentry000001', session_name: 'Pink guide fixture', session_id: 'pink-guide', started_at: '2026-09-20 10:00:00.000Z', status: 'completed', client: '', project: '', task: '', work_ms: 1000, wall_ms: 1000, waiting_ms: 0, cost: 0, input: 0, output: 0, cache_read: 0, cache_write: 0, segments: [], agent: 'pi', prompt: '' }
    await page.route('**/api/collections/task_entries/records?*', route => route.fulfill({ json: { page: 1, perPage: 25, totalItems: 1, totalPages: 1, items: [entry] } }))
    await page.route('**/api/collections/task_entries/records/*', route => route.fulfill({ json: entry }))
    await page.route('**/api/collections/work_records/records?*', route => route.fulfill({ json: { page: 1, perPage: 200, totalItems: 0, totalPages: 1, items: [] } }))
    await page.goto('/entries')
    await page.getByRole('button', { name: /View entry details: Pink guide fixture/ }).click()
    const guide = page.locator('[data-slot="sheet-content"] a[target="_blank"]').last()
    await check('entry guide plain link', guide, 4.5)
    await guide.hover(); await check('hover entry guide link', guide, 4.5)
    if (theme === 'dark') expect((await sample(guide)).foreground).toBe(roles.foreground!.hex)
    await page.screenshot({ path: testInfo.outputPath('guide.png') })
    await page.keyboard.press('Escape')
    expect(mutations, 'no attempted business writes').toEqual([])
    await writeFile(testInfo.outputPath('matched-pink-evidence.json'), JSON.stringify(evidence, null, 2))
    await testInfo.attach('matched-pink-evidence', { path: testInfo.outputPath('matched-pink-evidence.json'), contentType: 'application/json' })
  })
}
