import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { expect, test, type Locator } from '@playwright/test'
import { loginAs, pbOrigin, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'

async function paint(control: Locator) {
  return control.evaluate(el => {
    const css = getComputedStyle(el)
    const ctx = document.createElement('canvas').getContext('2d')!
    const pixel = (color: string) => {
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1)
      return [...ctx.getImageData(0, 0, 1, 1).data]
    }
    return { actual: pixel(css.backgroundColor), canvas: pixel(css.getPropertyValue('--background').trim()), muted: pixel(css.getPropertyValue('--muted').trim()), popover: pixel(css.getPropertyValue('--popover').trim()), primary: pixel(css.getPropertyValue('--primary').trim()), primaryForeground: pixel(css.getPropertyValue('--primary-foreground').trim()), text: pixel(css.color), opacity: css.opacity }
  })
}

async function field(control: Locator, theme: string, width: number, inside: boolean) {
  await expect(control).toBeVisible()
  await expect(control).toHaveCSS('height', '44px')
  await expect(control).toHaveCSS('border-radius', '16px')
  await expect(control).toHaveCSS('padding-left', '12px')
  await expect(control).toHaveCSS('font-size', width < 768 ? '16px' : '14px')
  await control.hover()
  const colors = await paint(control)
  expect(colors.actual).toEqual(inside ? colors.canvas : colors.muted)
  expect(colors.actual).toEqual([...(inside ? theme === 'light' ? [249, 249, 249] : [20, 20, 20] : theme === 'light' ? [242, 242, 242] : [28, 28, 28]), 255])
  expect(colors.opacity).toBe('1')
  await control.page().keyboard.press('Tab')
  await control.focus()
  expect(await control.evaluate(el => el.matches(':focus-visible'))).toBe(true)
  await expect.poll(() => control.evaluate(el => getComputedStyle(el).getPropertyValue('--tw-ring-shadow'))).toMatch(/3px/)
  return colors
}

async function settingsOptions(card: Locator, selectedName: string, width: number) {
  const buttons = card.locator('button[data-card-option]')
  await expect(buttons).toHaveCount(3)
  await expect(card.locator('[aria-pressed="true"]')).toHaveCount(1)
  await expect(card.getByRole('button', { name: selectedName, exact: true })).toHaveAttribute('aria-pressed', 'true')
  const observed = []
  for (const button of await buttons.all()) {
    const selected = await button.getAttribute('aria-pressed') === 'true'
    await expect(button).toHaveAttribute('data-variant', selected ? 'default' : 'outline')
    await expect(button).toHaveCSS('height', '44px')
    await expect(button).toHaveCSS('border-radius', '16px')
    await expect(button).toHaveCSS('padding-left', '12px')
    await expect(button).toHaveCSS('font-size', width < 768 ? '16px' : '14px')
    for (const hover of [false, true]) {
      if (hover) await button.hover()
      else await button.page().mouse.move(0, 0)
      await button.evaluate(async el => { await Promise.all(el.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))) })
      const colors = await paint(button)
      expect(colors.actual).toEqual(selected ? colors.primary : colors.canvas)
      if (selected) { expect(colors.actual).not.toEqual(colors.canvas); expect(colors.text).toEqual(colors.primaryForeground) }
      expect(colors.opacity).toBe('1')
      observed.push({ label: await button.innerText(), selected, hover, colors })
    }
    await button.page().keyboard.press('Tab')
    await button.focus()
    expect(await button.evaluate(el => el.matches(':focus-visible'))).toBe(true)
    await expect.poll(() => button.evaluate(el => getComputedStyle(el).getPropertyValue('--tw-ring-shadow'))).toMatch(/3px/)
  }
  return observed
}

// Card-contained NativeSelect/Textarea are not mounted by these read-only flows.
// Check their actual slot contract and state utilities, not synthetic controls.
test('contextual rule targets actual field slots and preserves primitive states', () => {
  const css = readFileSync('app/assets/css/tailwind.css', 'utf8')
  expect(css).toContain('@utility control-field {\n  background-color: var(--muted);')
  expect(css).toContain('select[data-slot="native-select"]')
  expect(css).toContain('textarea[data-slot="textarea"]')
  expect(css).toContain('[type="checkbox"], [type="radio"], [type="range"]')
  expect(css).toContain('button[data-slot="combobox-trigger"][role="combobox"]')
  expect(css).toContain('button[data-card-option][aria-pressed="false"]')
  for (const path of ['input/Input.vue', 'native-select/NativeSelect.vue', 'textarea/Textarea.vue', 'select/Select.vue']) {
    const source = readFileSync(`app/components/ui/${path}`, 'utf8')
    expect(source).toContain('focus-visible:ring-')
    expect(source).toContain('aria-invalid:focus-visible:ring-destructive')
    expect(source).toContain('opacity-50')
  }
})

for (const theme of ['light', 'dark']) for (const width of [320, 390, 1280]) {
  test(`${theme} ${width}: real card fields, right-aligned headers and independent portals`, async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    expect(`${process.env.PW_BASE_URL}|${pbOrigin()}`).toBe('http://127.0.0.1:3003|http://127.0.0.1:8093')
    const denied: string[] = []
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname
      const allowed = request.method() === 'GET' || (request.method() === 'POST' && (/\/auth-(with-password|refresh)$/.test(path) || path === '/api/kankaku/totals' || path === '/api/realtime'))
      if (!allowed) { denied.push(`${request.method()} ${path}`); await route.abort(); return }
      await route.continue()
    })
    await page.addInitScript(theme => {
      localStorage.setItem('kankaku-locale', 'en')
      localStorage.setItem('kankaku-color-mode', theme)
    }, theme)
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' })
    await page.setViewportSize({ width, height: 1100 })
    await page.goto('/login')
    await expect(page.locator('html')).toHaveClass(theme)
    const observations: unknown[] = []
    for (const id of ['email', 'password']) observations.push(await field(page.locator(`[data-slot="card"] #${id}`), theme, width, true))
    const primary = await paint(page.getByRole('button', { name: 'Sign in', exact: true }))
    expect(primary.actual).not.toEqual(primary.canvas)
    await page.screenshot({ path: testInfo.outputPath(`login-${theme}-${width}.png`) })
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
    await page.goto('/')
    const chart = page.getByTestId('dashboard-time-series')
    await expect(chart).toHaveAccessibleName('Time series')
    await expect(chart.locator('[data-slot="card-title"]')).toHaveCount(0)
    await expect(page.getByText('Time series', { exact: true })).toHaveCount(0)
    const controls = chart.locator('button[data-slot="combobox-trigger"]')
    await expect(controls).toHaveCount(2)
    for (const control of await controls.all()) observations.push(await field(control, theme, width, true))
    const header = chart.locator('[data-slot="card-header"]')
    await expect(header).toHaveCSS('display', 'flex')
    const headerBox = (await header.boundingBox())!
    const lastBox = (await controls.last().boundingBox())!
    expect(Math.abs(lastBox.x + lastBox.width - (headerBox.x + headerBox.width - 24))).toBeLessThanOrEqual(1)
    if (width === 1280) expect((await controls.first().boundingBox())!.y).toBe(lastBox.y)
    expect(await header.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    for (const [id, name, column] of [['breakdown-by-client', 'By client', 'Client'], ['breakdown-by-project', 'By project', 'Project']]) {
      const card = page.getByTestId(id!)
      await expect(card).toHaveAccessibleName(name!)
      await expect(card.locator('[data-slot="card-header"]')).toHaveCount(0)
      await expect(page.getByText(name!, { exact: true })).toHaveCount(0)
      await expect(card.getByRole('columnheader', { name: column!, exact: true })).toBeVisible()
      expect(await card.getByRole('row').count()).toBeGreaterThan(1)
      await expect(card).toHaveCSS('padding-top', '24px')
    }
    await controls.first().press('Enter')
    const popup = page.locator('[data-slot="combobox-list"]')
    await expect(popup).toBeVisible()
    expect(await popup.evaluate(el => !!el.closest('[data-slot="card"]'))).toBe(false)
    const popupPaint = await paint(popup)
    expect(popupPaint.actual).toEqual(popupPaint.popover)
    expect(popupPaint.actual).not.toEqual(popupPaint.canvas)
    await expect(popup.locator('[data-slot="command-input"]')).toBeVisible()
    await page.getByRole('option', { name: 'Cost', exact: true }).click()
    await expect(controls.first()).toContainText('Cost')
    await controls.last().press('Enter')
    await page.getByRole('option', { name: 'No grouping', exact: true }).click()
    await expect(controls.last()).toContainText('No grouping')
    await expect(popup).toBeHidden()
    await expect(chart.getByRole('img').first()).toBeVisible()
    observations.push(await paint(page.getByRole('button', { name: 'Export', exact: true })))
    expect((observations.at(-1) as Awaited<ReturnType<typeof paint>>).actual).toEqual(theme === 'light' ? [242, 242, 242, 255] : [28, 28, 28, 255])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${theme}-${width}.png`) })
    await page.goto('/entries')
    observations.push(await field(page.locator('#entries-filter-client'), theme, width, false))
    await page.goto('/settings')
    const appearance = page.getByTestId('settings-appearance'), language = page.getByTestId('settings-language')
    const themeName = theme === 'light' ? 'Light' : 'Dark'
    observations.push({ appearance: await settingsOptions(appearance, themeName, width), language: await settingsOptions(language, 'English', width) })
    const otherTheme = theme === 'light' ? 'dark' : 'light'
    await appearance.getByRole('button', { name: otherTheme === 'light' ? 'Light' : 'Dark', exact: true }).click()
    await expect(page.locator('html')).toHaveClass(otherTheme)
    await expect.poll(() => page.evaluate(() => localStorage.getItem('kankaku-color-mode'))).toBe(otherTheme)
    observations.push({ alternateAppearance: await settingsOptions(appearance, otherTheme === 'light' ? 'Light' : 'Dark', width) })
    await appearance.getByRole('button', { name: 'System', exact: true }).click()
    await expect(page.locator('html')).toHaveClass(theme)
    await expect.poll(() => page.evaluate(() => localStorage.getItem('kankaku-color-mode'))).toBe('system')
    observations.push({ systemAppearance: await settingsOptions(appearance, 'System', width) })
    await appearance.getByRole('button', { name: themeName, exact: true }).click()
    for (const [name, code] of [['Español', 'es'], ['日本語', 'ja'], ['English', 'en']]) {
      await language.getByRole('button', { name: name!, exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('lang', code!)
      await expect.poll(() => page.evaluate(() => localStorage.getItem('kankaku-locale'))).toBe(code)
      observations.push({ locale: code, language: await settingsOptions(language, name!, width) })
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
    await page.screenshot({ path: testInfo.outputPath(`settings-${theme}-${width}.png`) })
    expect(denied, 'zero business mutations attempted or denied').toEqual([])
    const receipt = JSON.stringify({ theme, width, observations, popupPaint, denied, businessMutations: 0 }, null, 2)
    await writeFile(testInfo.outputPath('card-field-receipt.json'), receipt)
    await testInfo.attach('card-field-receipt', { body: receipt, contentType: 'application/json' })
  })
}
