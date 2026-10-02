import { expect, test } from '@playwright/test'
import { loginAs, pbOrigin, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'
import { resolvePreset } from '../app/lib/period'

for (const bounds of [{}, { dateStart: '2026-01-01' }, { dateEnd: '2026-01-31' }, { dateStart: '2026-01-01', dateEnd: '2026-01-31' }]) {
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
    const expected = bounds.dateStart && bounds.dateEnd ? `${bounds.dateStart} → ${bounds.dateEnd}` : bounds.dateStart ? `From ${bounds.dateStart}` : bounds.dateEnd ? `Until ${bounds.dateEnd}` : 'All time'
    await expect(trigger).toHaveAccessibleName(`Date range: ${expected}`)
    const exportButton = page.getByRole('button', { name: 'Export', exact: true })
    await expect(exportButton).toBeEnabled()
    const filter = reads.at(-1)!.searchParams.get('filter')!
    expect(filter.includes('started_at >=')).toBe(!!bounds.dateStart)
    expect(filter.includes('started_at <=')).toBe(!!bounds.dateEnd)
    const utc = await page.evaluate(({ start, end }) => ({
      from: start ? new Date(`${start}T00:00:00`).toISOString().replace('T', ' ') : undefined,
      to: end ? new Date(`${end}T23:59:59.999`).toISOString().replace('T', ' ') : undefined,
    }), { start: bounds.dateStart, end: bounds.dateEnd })
    if (utc.from) expect(filter).toContain(`started_at >= "${utc.from}"`)
    if (utc.to) expect(filter).toContain(`started_at <= "${utc.to}"`)
    const downloaded = page.waitForEvent('download')
    await exportButton.click()
    await page.getByRole('menuitem', { name: 'CSV', exact: true }).click()
    const stream = await (await downloaded).createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    const csv = Buffer.concat(chunks).toString('utf8')
    if (bounds.dateStart) expect(csv).toContain(bounds.dateStart)
    if (bounds.dateEnd) expect(csv).toContain(bounds.dateEnd)
    expect(reads.at(-1)!.searchParams.get('filter')).toBe(filter)
    await page.getByRole('switch', { name: 'Group by session' }).click()
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
    await expect(page.getByRole('switch', { name: 'Group by session' })).toBeChecked()
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
