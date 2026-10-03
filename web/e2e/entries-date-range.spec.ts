import { expect, test } from '@playwright/test'
import { loginAs, pbOrigin, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'
import { resolvePreset } from '../app/lib/period'

test.beforeEach(async ({ context }) => {
  await context.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !path.includes('/auth-') && path !== '/api/kankaku/totals' && path !== '/api/realtime') {
      await route.abort()
      throw new Error(`Forbidden business mutation: ${request.method()} ${path}`)
    }
    await route.continue()
  })
})

for (const bounds of [{}, { dateStart: '2026-01-01', dateRange: 'all' }, { dateEnd: '2026-01-31', dateRange: 'all' }, { dateStart: '2026-01-01', dateEnd: '2026-01-31', dateRange: 'all' }]) {
  test(`optional date range ${JSON.stringify(bounds)}`, async ({ page }) => {
    if (process.env.PW_BASE_URL !== 'http://127.0.0.1:3003' || pbOrigin() !== 'http://127.0.0.1:8093') throw new Error('Requires isolated :3003/:8093 stack')
    const reads: URL[] = []
    const totals: Record<string, unknown>[] = []
    await page.route('**/api/collections/task_entries/records?*', async route => {
      expect(route.request().method()).toBe('GET')
      const url = new URL(route.request().url())
      reads.push(url)
      await route.fulfill({ json: { page: 1, perPage: Number(url.searchParams.get('perPage')), totalItems: 0, totalPages: 1, items: [] } })
    })
    await page.route('**/api/kankaku/totals', async route => {
      const body = route.request().postDataJSON()
      if (body.group_by !== 'session' || body.per_page !== 25) return route.continue()
      totals.push(body)
      await route.fulfill({ json: { groups: [], total: {}, total_groups: 0, total_pages: 1, page: 1, per_page: 25 } })
    })
    await page.addInitScript(() => {
      localStorage.setItem('kankaku-locale', 'en')
      localStorage.setItem('kankaku-entries-group-by-session', '0')
    })
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
    await page.goto(`/entries?${new URLSearchParams({ ...bounds, agent: 'pi' })}`)
    const trigger = page.locator('#entries-date-range')
    const effective = bounds.dateStart || bounds.dateEnd ? bounds : { dateStart: resolvePreset('30d').start, dateEnd: resolvePreset('30d').end }
    const expected = effective.dateStart && effective.dateEnd ? `${effective.dateStart} → ${effective.dateEnd}` : effective.dateStart ? `From ${effective.dateStart}` : effective.dateEnd ? `Until ${effective.dateEnd}` : 'All time'
    await expect(trigger).toHaveAccessibleName(`Date range: ${expected}`)
    const exportButton = page.getByRole('button', { name: 'Export', exact: true })
    await expect(exportButton).toBeEnabled()
    const mainReads = reads.filter(url => url.searchParams.get('perPage') === '25')
    const filter = mainReads.at(-1)!.searchParams.get('filter')!
    for (const read of mainReads) {
      expect(read.searchParams.get('filter')!.includes('started_at >=')).toBe(!!effective.dateStart)
      expect(read.searchParams.get('filter')!.includes('started_at <=')).toBe(!!effective.dateEnd)
    }
    const utc = await page.evaluate(({ start, end }) => ({
      from: start ? new Date(`${start}T00:00:00`).toISOString().replace('T', ' ') : undefined,
      to: end ? new Date(`${end}T23:59:59.999`).toISOString().replace('T', ' ') : undefined,
    }), { start: effective.dateStart, end: effective.dateEnd })
    if (utc.from) expect(filter).toContain(`started_at >= "${utc.from}"`)
    if (utc.to) expect(filter).toContain(`started_at <= "${utc.to}"`)
    const downloaded = page.waitForEvent('download')
    await exportButton.click()
    await page.getByRole('menuitem', { name: 'CSV', exact: true }).click()
    const stream = await (await downloaded).createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    const csv = Buffer.concat(chunks).toString('utf8')
    if (effective.dateStart) expect(csv).toContain(effective.dateStart)
    if (effective.dateEnd) expect(csv).toContain(effective.dateEnd)
    expect(reads.at(-1)!.searchParams.get('filter')).toBe(filter)
    await page.getByRole('button', { name: 'Sessions', exact: true }).click()
    await expect.poll(() => totals.length).toBe(1)
    expect(totals[0]!.from ?? undefined).toBe(utc.from)
    expect(totals[0]!.to ?? undefined).toBe(utc.to)
    await trigger.click()
    for (const name of ['Today', '7 days', '30 days', 'This month', 'Last month']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Today', exact: true }).click()
    await expect.poll(() => totals.length).toBe(2)
    await expect(trigger).toContainText(resolvePreset('today').start)
    await page.getByRole('button', { name: 'All time', exact: true }).click()
    await expect.poll(() => totals.length).toBe(3)
    expect(totals.at(-1)!.from).toBeUndefined()
    expect(totals.at(-1)!.to).toBeUndefined()
    expect(totals.at(-1)!.filters).toMatchObject({ agent: 'pi' })
    await expect(page.getByRole('button', { name: 'Sessions', exact: true })).toHaveAttribute('aria-pressed', 'true')
    // Invalid drafts never change the applied range; an empty bound stays open.
    await page.getByLabel('Start', { exact: true }).fill('bad')
    await page.getByLabel('Start', { exact: true }).press('Enter')
    await expect(page.getByLabel('Start', { exact: true })).toHaveAttribute('aria-invalid', 'true')
    await page.getByLabel('Start', { exact: true }).fill('26/02/01')
    await page.getByLabel('Start', { exact: true }).press('Enter')
    await expect(trigger).toContainText('From 2026-02-01')
    await expect(page.getByLabel('End', { exact: true })).toHaveValue('')
    await page.getByRole('button', { name: 'Open calendar for Start', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Open calendar for Start', exact: true })).toBeFocused()
    await expect(page.getByLabel('End', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
  })
}

for (const grouped of [false, true]) {
  test(`atomic dates, explicit All time and history (${grouped ? 'grouped' : 'flat'})`, async ({ page }) => {
    const reads: URL[] = []
    const totals: Record<string, unknown>[] = []
    await page.addInitScript(grouped => {
      localStorage.setItem('kankaku-locale', 'en')
      localStorage.setItem('kankaku-entries-group-by-session', grouped ? '1' : '0')
    }, grouped)
    await page.route('**/api/collections/task_entries/records?*', async route => {
      expect(route.request().method()).toBe('GET')
      const url = new URL(route.request().url())
      if (url.searchParams.get('perPage') === '25') reads.push(url)
      await route.fulfill({ json: { page: 1, perPage: 25, totalItems: 0, totalPages: 1, items: [] } })
    })
    await page.route('**/api/kankaku/totals', async route => {
      const body = route.request().postDataJSON()
      if (body.group_by === 'session' && body.per_page === 25) totals.push(body)
      await route.fulfill({ json: { groups: [], total: {}, total_groups: 0, total_pages: 1 } })
    })
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
    reads.length = 0
    totals.length = 0
    await page.goto('/entries?keep=yes#ledger')
    const trigger = page.locator('#entries-date-range')
    const preset = resolvePreset('30d')
    const label = `Date range: ${preset.start} → ${preset.end}`
    const ready = () => expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled()
    await ready()
    await expect(trigger).toHaveAccessibleName(label)
    if (grouped) {
      expect(totals.length).toBeGreaterThan(0)
      for (const body of totals) { expect(body.from).toBeTruthy(); expect(body.to).toBeTruthy() }
    }
    else {
      expect(reads.length).toBeGreaterThan(0)
      for (const url of reads) {
        expect(url.searchParams.get('filter')).toContain('started_at >=')
        expect(url.searchParams.get('filter')).toContain('started_at <=')
      }
    }
    expect(new URL(page.url()).search).toBe('?keep=yes')
    await trigger.click()
    await page.getByRole('button', { name: 'All time', exact: true }).click()
    await expect(trigger).toHaveAccessibleName('Date range: All time')
    await expect.poll(() => new URL(page.url()).searchParams.get('dateRange')).toBe('all')
    await ready()
    const allUrl = page.url()
    await page.reload()
    await ready()
    await expect(trigger).toHaveAccessibleName('Date range: All time')
    if (grouped) { expect(totals.at(-1)!.from).toBeUndefined(); expect(totals.at(-1)!.to).toBeUndefined() }
    else expect(reads.at(-1)!.searchParams.get('filter') || '').toBe('')
    await trigger.click()
    const before = grouped ? totals.length : reads.length
    await page.getByRole('button', { name: '7 days', exact: true }).click()
    const seven = resolvePreset('7d')
    await expect.poll(() => new URL(page.url()).searchParams.get('dateStart')).toBe(seven.start)
    await ready()
    expect(new URL(page.url()).searchParams.get('dateEnd')).toBe(seven.end)
    expect(new URL(page.url()).searchParams.has('dateRange')).toBe(false)
    expect((grouped ? totals.length : reads.length) - before).toBe(1)
    await page.keyboard.press('Escape')
    await page.goBack()
    await ready()
    await expect(trigger).toHaveAccessibleName('Date range: All time')
    expect(page.url()).toBe(allUrl)
    await page.goForward()
    await ready()
    await expect(trigger).toHaveAccessibleName(`Date range: ${seven.start} → ${seven.end}`)
    await trigger.click()
    await page.getByLabel('Start', { exact: true }).fill('bad')
    await page.getByLabel('Start', { exact: true }).press('Enter')
    const beforeInvalid = grouped ? totals.length : reads.length
    await expect(page.getByLabel('Start', { exact: true })).toHaveAttribute('aria-invalid', 'true')
    expect(grouped ? totals.length : reads.length).toBe(beforeInvalid)
    await page.getByLabel('Start', { exact: true }).fill('26/01/01')
    await page.getByLabel('Start', { exact: true }).press('Enter')
    await expect.poll(() => new URL(page.url()).searchParams.get('dateStart')).toBe('2026-01-01')
    expect(new URL(page.url()).searchParams.get('dateEnd')).toBe(seven.end)
    expect(new URL(page.url()).searchParams.get('keep')).toBe('yes')
    expect(new URL(page.url()).hash).toBe('#ledger')
    await page.keyboard.press('Escape')
    const beforeReset = grouped ? totals.length : reads.length
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await ready()
    if (grouped) {
      for (const body of totals.slice(beforeReset)) { expect(body.from).toBeTruthy(); expect(body.to).toBeTruthy() }
    }
    else {
      for (const url of reads.slice(beforeReset)) {
        expect(url.searchParams.get('filter')).toContain('started_at >=')
        expect(url.searchParams.get('filter')).toContain('started_at <=')
      }
    }
    await expect(trigger).toHaveAccessibleName(label)
    expect(new URL(page.url()).search).toBe('?keep=yes')
    await page.reload()
    await ready()
    await expect(trigger).toHaveAccessibleName(label)
    await page.setViewportSize({ width: 320, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const geometry = await trigger.evaluate(el => {
      const button = el.getBoundingClientRect()
      const icon = el.querySelector('svg')!.getBoundingClientRect()
      return { button: { left: button.left, right: button.right }, icon: { left: icon.left, right: icon.right, width: icon.width } }
    })
    expect(geometry.icon.width).toBe(16)
    expect(geometry.icon.left).toBeGreaterThanOrEqual(geometry.button.left)
    expect(geometry.icon.right).toBeLessThanOrEqual(geometry.button.right)
  })
}
