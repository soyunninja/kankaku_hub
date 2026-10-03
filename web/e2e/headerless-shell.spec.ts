import { expect, test } from '@playwright/test'
import { loginAs, pbOrigin, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'

test.beforeEach(async ({ page }) => {
  if (process.env.PW_BASE_URL !== 'http://127.0.0.1:3003' || pbOrigin() !== 'http://127.0.0.1:8093') throw new Error('Requires owned read-only stack')
  await page.route('**/api/**', async route => {
    const { pathname } = new URL(route.request().url())
    const method = route.request().method()
    const allowedPost = pathname.endsWith('/auth-with-password') || pathname.endsWith('/auth-refresh') || pathname === '/api/kankaku/totals' || pathname === '/api/realtime'
    expect(method === 'GET' || (method === 'POST' && allowedPost), `${method} ${pathname}`).toBe(true)
    await route.continue()
  })
  await page.addInitScript(() => localStorage.setItem('kankaku-locale', 'en'))
})

for (const width of [1280, 1440, 390]) {
  for (const theme of ['dark', 'light']) {
    test(`${theme} ${width}: shared headerless routes and bottom account`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 688 })
      await page.addInitScript(theme => localStorage.setItem('kankaku-color-mode', theme), theme)
      await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
      for (const path of ['/', '/clients', '/projects', '/tasks', '/entries', '/unassigned', '/sessions-without-task', '/settings']) {
        await page.goto(path)
        await expect(page.locator('main')).toBeVisible()
        await expect(page.locator('[data-testid="scroll-area"] > header')).toHaveCount(0)
        expect((await page.locator('main').boundingBox())!.y).toBe(0)
      }
      await page.goto('/')
      if (width < 768) await page.getByTestId('mobile-menu-trigger').click()
      if (width < 768) {
        await expect.poll(async () => (await page.locator('[data-slot="sheet-content"]').boundingBox())?.x).toBe(0)
      }
      const footer = page.getByTestId('sidebar-footer')
      await expect(footer).toHaveCount(1)
      await expect(footer.getByRole('button', { name: /Theme|Language/ })).toHaveCount(0)
      await expect(page.getByTestId('read-only-badge')).toHaveCount(1)
      await expect(page.getByTestId('read-only-badge')).toBeVisible()
      const account = footer.locator('[data-footer-control="account"]')
      const geometry = await footer.evaluate(el => {
        const rect = el.getBoundingClientRect()
        const account = el.querySelector('[data-footer-control="account"]')!.getBoundingClientRect()
        return { bottom: rect.bottom, accountBottom: account.bottom, overflow: el.scrollWidth - el.clientWidth,
          controls: [...el.querySelectorAll('button')].map(button => button.getBoundingClientRect().height) }
      })
      expect(geometry.bottom).toBe(width < 768 ? 688 : 664)
      const frame = page.locator(width < 768 ? '[data-slot="sheet-content"]' : 'aside')
      await expect(frame).toHaveCSS('border-right-width', '0px')
      if (width >= 768) {
        expect((await frame.boundingBox())!.x).toBe(24)
        expect((await frame.boundingBox())!.y).toBe(24)
        expect(await frame.evaluate(el => Number.parseFloat(getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThan(0)
      }
      expect(geometry.bottom - geometry.accountBottom).toBe(12)
      expect(geometry.overflow).toBe(0)
      for (const height of geometry.controls) expect(height).toBeGreaterThanOrEqual(44)
      await page.screenshot({ path: testInfo.outputPath(`footer-${theme}-${width}.png`) })
      await page.setViewportSize({ width, height: 480 })
      await expect(account).toBeVisible()
      expect((await footer.boundingBox())!.y + (await footer.boundingBox())!.height).toBe(width < 768 ? 480 : 456)
      await account.click()
      await expect(page.getByRole('menu')).toContainText(VIEWER_EMAIL)
      await page.keyboard.press('Escape')
      await expect(account).toBeFocused()
      const ids = await page.locator('[id]').evaluateAll(els => els.map(el => el.id))
      expect(new Set(ids).size).toBe(ids.length)
    })
  }
}

test('mobile utilities, single palette, focus restoration and local logout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 688 })
  await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
  const trigger = page.getByTestId('mobile-menu-trigger')
  await trigger.press('Enter')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.waitForURL('/settings')
  for (const mode of ['Light', 'Dark', 'System']) {
    await page.getByRole('button', { name: mode, exact: true }).click()
    if (mode !== 'System') await expect(page.locator('html')).toHaveClass(mode.toLowerCase())
  }
  await page.getByRole('button', { name: '日本語', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await trigger.click()
  await page.locator('[data-footer-control="search"]').click()
  await expect(page.locator('[data-slot="sheet-content"]')).toBeHidden()
  await expect(page.locator('#palette-listbox')).toHaveCount(1)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.locator('#palette-listbox')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.locator('[data-footer-control="account"]').click()
  await page.getByRole('menuitem', { name: 'Log out', exact: true }).click()
  await page.waitForURL('/login')
  await page.goto('/entries')
  await page.waitForURL(url => url.pathname === '/login')
})

test('breakpoint focus follows footer controls only, without duplicate footers or extra reads', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 688 })
  await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
  await page.waitForLoadState('networkidle')
  const reads: string[] = []
  page.on('request', request => { if (/\/records|\/kankaku\/totals/.test(request.url())) reads.push(request.url()) })
  const search = page.locator('[data-testid="sidebar-footer"] [data-footer-control="search"]')
  await search.focus()
  await page.setViewportSize({ width: 767, height: 688 })
  await expect(search).toBeFocused()
  await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible()
  await expect(page.getByTestId('sidebar-footer')).toHaveCount(1)
  await page.setViewportSize({ width: 768, height: 688 })
  await expect(search).toBeFocused()
  await expect(page.getByTestId('sidebar-footer')).toHaveCount(1)
  // Finish Sheet teardown/focus restoration before intentionally blurring the
  // desktop footer; otherwise the pending restoration can race the next resize.
  await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0)
  await expect(search).toBeFocused()
  await search.evaluate(el => (el as HTMLElement).blur())
  await page.setViewportSize({ width: 767, height: 688 })
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true)
  await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0)
  expect(reads).toHaveLength(0)
})
