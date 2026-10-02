import { expect, test } from '@playwright/test'
import { unzipSync, strFromU8 } from 'fflate'
import type { Readable } from 'node:stream'
import { login } from './helpers'

/** The two current-period calls end today; the comparison call ends yesterday. */
function isCurrentPeriod(body: { from?: string, to?: string, group_by?: string }, todayStart: number): boolean {
  return body.group_by === 'none' && typeof body.from === 'string' && typeof body.to === 'string'
    && Date.parse(body.to) >= todayStart
}

test('CSV export retains the successful snapshot after a new range fails to load', async ({ page }) => {
  const todayStart = new Date().setHours(0, 0, 0, 0)
  let initialPeriod: { from: string, to: string } | undefined
  let initialCost: number | undefined
  let failNewRange = false

  await page.route('**/api/kankaku/totals', async (route) => {
    const body = route.request().postDataJSON() as { from?: string, to?: string, group_by?: string }
    if (failNewRange && body.group_by === 'none'
      && body.to === initialPeriod?.to && body.from !== initialPeriod?.from) {
      // A 500 must retain A's data; a 404 would activate the fallback loader.
      await route.fulfill({ status: 500, json: { message: 'Regression test: totals unavailable' } })
      return
    }
    if (!initialPeriod && isCurrentPeriod(body, todayStart)) {
      initialPeriod = { from: body.from!, to: body.to! }
      const response = await route.fetch()
      expect(response.ok()).toBeTruthy()
      const payload = await response.json() as { total: { cost: number } }
      initialCost = payload.total.cost
      await route.fulfill({ response, json: payload })
      return
    }
    await route.continue()
  })

  await page.addInitScript(() => window.localStorage.setItem('kankaku-locale', 'en'))
  await login(page)
  const exportButton = page.getByRole('button', { name: 'Export', exact: true })
  await expect(exportButton).toBeEnabled()
  expect(initialPeriod).toBeDefined()
  const rangeButton = page.getByRole('button', { name: /\d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}/ })
  const successfulRange = (await rangeButton.innerText()).match(/(\d{4}-\d{2}-\d{2}) → (\d{4}-\d{2}-\d{2})/)!
  const [, start, end] = successfulRange
  const costKpi = page.locator('[data-slot="card"]').filter({ has: page.getByText('Cost (USD)', { exact: true }) }).getByTestId('kpi-value')
  const successfulCost = await costKpi.innerText()

  failNewRange = true
  const failedResponse = page.waitForResponse((response) => {
    if (!response.url().includes('/api/kankaku/totals') || response.request().method() !== 'POST') return false
    const body = response.request().postDataJSON() as { from?: string, to?: string, group_by?: string }
    return body.group_by === 'none' && body.to === initialPeriod?.to && body.from !== initialPeriod?.from
  })
  await rangeButton.click()
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  expect((await failedResponse).status()).toBe(500)
  await expect(rangeButton).toContainText(`${end} → ${end}`)
  expect(start).not.toBe(end)
  await expect(exportButton).toBeEnabled()
  await expect(costKpi).toHaveText(successfulCost)

  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  await page.getByRole('menuitem', { name: 'CSV', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(`dashboard-${start}-${end}.csv`)
  expect(download.suggestedFilename()).not.toBe(`dashboard-${end}-${end}.csv`)
  // Read the browser download in memory; no fixture files or PocketBase writes.
  const stream: Readable | null = await download.createReadStream()
  expect(stream).not.toBeNull()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const csv = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '')
  const [headerLine, ...rowLines] = csv.split('\r\n')
  const cells = (line: string) => line.slice(1, -1).split('","')
  const headers = cells(headerLine!)
  const rows = rowLines.filter(Boolean).map(cells)
  const sectionIndex = headers.indexOf('section')
  const idIndex = headers.indexOf('id')
  const labelIndex = headers.indexOf('label')
  const metadata = Object.fromEntries(rows.filter(row => row[sectionIndex] === 'metadata').map(row => [row[idIndex], row[labelIndex]]))
  expect(metadata.export_kind).toBe('dashboard_summary')
  expect(metadata.data_source).toBe('totals_endpoint')
  expect(metadata.period_start).toBe(start)
  expect(metadata.period_end).toBe(end)
  expect(metadata.client_breakdown_limit).toBe('200')
  expect(metadata.project_breakdown_limit).toBe('200')
  expect(metadata.top_expensive_limit).toBe('10')
  expect(metadata.fallback_rows_truncated).toBe('not_applicable')
  expect(['true', 'false']).toContain(metadata.client_breakdown_truncated)
  expect(['true', 'false']).toContain(metadata.project_breakdown_truncated)
  expect(Number.isNaN(Date.parse(metadata.generated_at!))).toBe(false)
  const totals = rows.find(row => row[sectionIndex] === 'totals' && row[idIndex] === '')!
  expect(totals).toBeDefined()
  expect(totals[headers.indexOf('period_start')]).toBe(start)
  expect(totals[headers.indexOf('period_end')]).toBe(end)
  expect(Number(totals[headers.indexOf('cost')])).toBe(initialCost)

  const xlsxPending = page.waitForEvent('download')
  await exportButton.click()
  await page.getByRole('menuitem', { name: 'XLSX', exact: true }).click()
  const xlsx = await xlsxPending
  expect(xlsx.suggestedFilename()).toBe(`dashboard-${start}-${end}.xlsx`)
  const xlsxChunks: Buffer[] = []
  for await (const chunk of (await xlsx.createReadStream())!) xlsxChunks.push(Buffer.from(chunk))
  const files = unzipSync(Buffer.concat(xlsxChunks))
  expect(strFromU8(files['[Content_Types].xml']!)).toContain('spreadsheetml.sheet.main+xml')
  const values = await page.evaluate(({ sheet, strings }) => {
    const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml')
    const shared = [...parse(strings).querySelectorAll('si')].map(si => si.textContent || '')
    const doc = parse(sheet)
    if (doc.querySelector('f')) throw new Error('Unexpected formula')
    return [...doc.querySelectorAll('row')].map(row => [...row.querySelectorAll('c')].map(cell => {
      const value = cell.querySelector('v')?.textContent || ''
      return cell.getAttribute('t') === 's' ? shared[Number(value)] : value
    }))
  }, { sheet: strFromU8(files['xl/worksheets/sheet1.xml']!), strings: strFromU8(files['xl/sharedStrings.xml']!) })
  expect(values).toContainEqual(expect.arrayContaining(['metadata', 'period_start', start]))
  expect(values).toContainEqual(expect.arrayContaining(['metadata', 'period_end', end]))
  expect(values.find(row => row[0] === 'totals')).toContain(String(initialCost))
})

test('an older dashboard range cannot replace the newer cost KPI', async ({ page }) => {
  const staleCost = 9_876_543.21
  const todayStart = new Date().setHours(0, 0, 0, 0)
  const dayMs = 24 * 60 * 60 * 1000
  let releaseOld!: () => void
  const oldReleased = new Promise<void>((resolve) => { releaseOld = resolve })
  let signalOldReady!: () => void
  const oldReady = new Promise<void>((resolve) => { signalOldReady = resolve })
  let oldIntercepted = false

  await page.route('**/api/kankaku/totals', async (route) => {
    const body = route.request().postDataJSON() as { from?: string, to?: string, group_by?: string }
    const isInitial30d = isCurrentPeriod(body, todayStart)
      && Date.parse(body.from!) < todayStart - 20 * dayMs
    if (!oldIntercepted && isInitial30d) {
      oldIntercepted = true
      // Fetch the real response first; only its current total is changed.
      // The first load remains pending while Today is free to complete.
      const response = await route.fetch()
      const payload = await response.json() as { total: { cost: number } }
      signalOldReady()
      await oldReleased
      await route.fulfill({ response, json: { ...payload, total: { ...payload.total, cost: staleCost } } })
      return
    }
    await route.continue()
  })

  try {
    await page.addInitScript(() => window.localStorage.setItem('kankaku-locale', 'en'))
    await login(page)
    await oldReady
    const todayResponse = page.waitForResponse((response) => {
      if (!response.url().includes('/api/kankaku/totals') || response.request().method() !== 'POST') return false
      const body = response.request().postDataJSON() as { from?: string, to?: string, group_by?: string }
      return isCurrentPeriod(body, todayStart) && Date.parse(body.from!) >= todayStart
    })
    const todayChart = page.waitForResponse((response) => {
      if (!response.url().includes('/api/kankaku/totals') || response.request().method() !== 'POST') return false
      const body = response.request().postDataJSON() as { group_by?: string, day_boundaries?: string[] }
      return body.group_by === 'day' && body.day_boundaries?.length === 2
    })

    await page.getByRole('button', { name: /\d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}/ }).click()
    await page.getByRole('button', { name: 'Today', exact: true }).click()
    const newer = await todayResponse
    expect(newer.ok()).toBeTruthy()
    const { total } = await newer.json() as { total: { cost: number } }
    const expectedCost = new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: 2,
      maximumFractionDigits: Math.abs(total.cost) >= 1 ? 2 : 4,
    }).format(total.cost)
    expect(total.cost).not.toBe(staleCost)
    expect((await todayChart).ok()).toBeTruthy()
    const costKpi = page.locator('[data-slot="card"]').filter({ has: page.getByText('Cost (USD)', { exact: true }) }).getByTestId('kpi-value')
    await expect(costKpi).toHaveText(expectedCost)

    releaseOld()
    // Network idle waits for the released response AND any chart request
    // started by its load(), rather than asserting before Vue applies it.
    await page.waitForLoadState('networkidle')
    await expect(costKpi).toHaveText(expectedCost)
  }
  finally {
    releaseOld()
  }
})
