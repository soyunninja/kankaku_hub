import { expect, test } from '@playwright/test'
import { unzipSync, strFromU8 } from 'fflate'
import { resolvePreset } from '../app/lib/period'
import { loginAs, pbOrigin, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const allowed = request.method() === 'GET' || (request.method() === 'POST' && (/\/auth-(with-password|refresh)$/.test(path) || path === '/api/kankaku/totals' || path === '/api/realtime'))
    if (!allowed) { await route.abort(); throw new Error(`Forbidden mutation: ${request.method()} ${path}`) }
    await route.continue()
  })
})

function parseCsv(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const text = content.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++ }
      else quoted = !quoted
    }
    else if (!quoted && char === ',') { row.push(cell); cell = '' }
    else if (!quoted && (char === '\r' || char === '\n')) {
      if (char === '\r' && text[i + 1] === '\n') i++
      rows.push([...row, cell]); row = []; cell = ''
    }
    else cell += char
  }
  if (row.length || cell) rows.push([...row, cell])
  return rows
}

for (const format of ['csv', 'xlsx'] as const) {
  test(`partial ${format} export requires consent and preserves click snapshot`, async ({ page }) => {
    test.setTimeout(90_000)
    if (process.env.PW_BASE_URL !== 'http://127.0.0.1:3003' || pbOrigin() !== 'http://127.0.0.1:8093') {
      throw new Error('Read-only spec requires the isolated :3003/:8093 stack')
    }
    let release = () => {}
    let holdExport = false
    let held = false
    const gate = new Promise<void>(resolve => { release = resolve })
    let total = 5001
    const requests: URL[] = []
    const records = Array.from({ length: 5001 }, (_, i) => ({
      id: `partial${String(i).padStart(8, '0')}`, task_id: `identity-${i}`, status: 'completed',
      started_at: '2026-01-01 10:00:00.000Z', ended_at: '2026-01-01 10:01:00.000Z',
      session_id: `session-${i}`, work_ms: 1000, wall_ms: 1000, waiting_ms: 0,
      input: 1, output: 1, cost: 0, agent: 'pi',
    }))
    await page.route('**/api/collections/task_entries/records?*', async (route) => {
      expect(route.request().method()).toBe('GET')
      const url = new URL(route.request().url())
      const perPage = Number(url.searchParams.get('perPage'))
      const current = Number(url.searchParams.get('page') || 1)
      if (perPage === 500) {
        requests.push(url)
        if (holdExport && current === 1) { held = true; await gate }
      }
      // Empty browse exposes contextual reset; export remains its own
      // capped synthetic fixture, independent of the visible page.
      await route.fulfill({ json: perPage === 25
        ? { page: current, perPage, totalItems: 0, totalPages: 0, items: [] }
        : { page: current, perPage, totalItems: total,
            totalPages: Math.ceil(total / perPage), items: records.slice((current - 1) * perPage, Math.min(current * perPage, total)) } })
    })
    await page.addInitScript(() => {
      localStorage.setItem('kankaku-locale', 'en')
      localStorage.setItem('kankaku-entries-group-by-session', '0')
    })
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
    await page.goto('/entries?session_id=original-session&dateStart=2026-01-01&dateEnd=2026-01-31&dateRange=all')
    const trigger = page.getByRole('button', { name: 'Export', exact: true })
    const downloads: unknown[] = []
    page.on('download', download => downloads.push(download))
    async function start() {
      await expect(trigger).toBeEnabled()
      await trigger.focus()
      await trigger.press('Enter')
      const csv = page.getByRole('menuitem', { name: 'CSV', exact: true })
      await expect(csv).toBeFocused()
      if (format === 'xlsx') await csv.press('ArrowDown')
      await page.getByRole('menuitem', { name: format.toUpperCase(), exact: true }).press('Enter')
    }
    const dialog = page.getByRole('dialog', { name: 'Download a partial export?' })
    for (const cancel of ['button', 'escape', 'outside']) {
      await start()
      await expect(dialog).toContainText('first 5000 of 5001')
      expect(downloads).toHaveLength(0)
      await expect(page.getByRole('button', { name: 'Export', exact: true, includeHidden: true })).toBeDisabled()
      if (cancel === 'button') await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      else if (cancel === 'escape') await page.keyboard.press('Escape')
      else await page.mouse.click(5, 5)
      await expect(dialog).not.toBeVisible()
      await expect(trigger).toBeEnabled()
      expect(downloads).toHaveLength(0)
    }
    requests.length = 0
    holdExport = true
    await start()
    await expect.poll(() => held).toBe(true)
    // Reset while the click-time export fetch is pending, before consent.
    try {
      await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
      await expect.poll(() => new URL(page.url()).search).toBe('')
      const live = resolvePreset('30d')
      await expect(page.locator('#entries-date-range')).toHaveAccessibleName(`Date range: ${live.start} → ${live.end}`)
    }
    finally { release() }
    await expect(dialog).toBeVisible()
    const generatedBefore = Date.now()
    const downloadEvent = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download first 5000', exact: true }).click()
    const download = await downloadEvent
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    const content = Buffer.concat(chunks).toString('utf8')
    const rows = format === 'csv'
      ? parseCsv(content)
      : await page.evaluate(files => {
          const parse = (text: string) => new DOMParser().parseFromString(text, 'application/xml')
          const shared = [...parse(files.strings).querySelectorAll('si')].map(si => si.textContent || '')
          const sheet = parse(files.sheet)
          if (sheet.querySelector('f')) throw new Error('Unexpected formula')
          return [...sheet.querySelectorAll('row')].map(row => {
            const cells: string[] = []
            for (const cell of row.querySelectorAll('c')) {
              const index = [...cell.getAttribute('r')!.replace(/\d/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1
              while (cells.length <= index) cells.push('')
              const value = cell.querySelector('v')?.textContent || ''
              const type = cell.getAttribute('t')
              cells[index] = type === 's' ? shared[Number(value)]! : type === 'inlineStr' ? cell.querySelector('is')?.textContent || '' : type === 'b' ? String(value === '1') : value
            }
            return cells
          })
        }, (() => {
          const files = unzipSync(Buffer.concat(chunks))
          expect(strFromU8(files['[Content_Types].xml']!)).toContain('spreadsheetml.sheet.main+xml')
          return { sheet: strFromU8(files['xl/worksheets/sheet1.xml']!), strings: files['xl/sharedStrings.xml'] ? strFromU8(files['xl/sharedStrings.xml']!) : '<sst/>' }
        })())
    const columns = rows[0]!
    const objects = rows.slice(1).map(row => Object.fromEntries(columns.map((key, i) => [key, row[i] ?? ''])))
    const metadata = Object.fromEntries(objects.filter(row => row.section === 'metadata').map(row => [row.metadata_key, row.metadata_value]))
    expect(metadata).toMatchObject({ exported_rows: '5000', total_matching_rows: '5001', truncated: 'true', row_limit: '5000', session_id: 'original-session', sort: format === 'csv' ? "'-started_at" : '-started_at' })
    expect(metadata).toHaveProperty('dateStart', '2026-01-01')
    expect(metadata).toHaveProperty('dateEnd', '2026-01-31')
    expect(metadata).not.toHaveProperty('dateRange')
    expect(Date.parse(metadata.generated_at!)).toBeLessThanOrEqual(generatedBefore)
    expect(objects.filter(row => row.section === 'task_entry').map(row => row.id)).toEqual(records.slice(0, 5000).map(row => row.id))
    expect(requests).toHaveLength(10)
    expect(new Set(requests.map(url => url.searchParams.get('filter'))).size).toBe(1)
    expect(requests.every(url => url.searchParams.get('sort') === '-started_at' && url.searchParams.get('filter')!.includes('session_id = "original-session"') && url.searchParams.get('filter')!.includes('started_at >=') && url.searchParams.get('filter')!.includes('started_at <='))).toBe(true)
    await expect(trigger).toBeEnabled()
    expect(downloads).toHaveLength(1)
    total = 5000
    const normal = page.waitForEvent('download')
    await start()
    await normal
    await expect(dialog).not.toBeVisible()
    expect(downloads).toHaveLength(2)
  })
}
