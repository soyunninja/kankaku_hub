import { expect, test } from '@playwright/test'
import { unzipSync, strFromU8 } from 'fflate'
import { apiLoginAs, comboboxTrigger, loginAs, pbOrigin, pbUrl, selectCombobox, toastText, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'

/** Decode OOXML cells in the browser's standard XML parser. */
export async function parseXlsx(page: import('@playwright/test').Page, bytes: Uint8Array): Promise<string[][]> {
  const files = unzipSync(bytes)
  expect(strFromU8(files['[Content_Types].xml']!)).toContain('spreadsheetml.sheet.main+xml')
  return page.evaluate(({ sheet, strings, workbook }) => {
    const parse = (text: string) => new DOMParser().parseFromString(text, 'application/xml')
    if (parse(workbook).querySelector('sheet')?.getAttribute('name') !== 'Measurements') throw new Error('Wrong worksheet')
    const doc = parse(sheet)
    if (doc.querySelector('f')) throw new Error('Unexpected formula')
    const shared = [...parse(strings).querySelectorAll('si')].map(si => si.textContent || '')
    return [...doc.querySelectorAll('row')].map(row => {
      const result: string[] = []
      for (const cell of row.querySelectorAll('c')) {
        const letters = cell.getAttribute('r')!.replace(/\d/g, '')
        const index = [...letters].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1
        while (result.length <= index) result.push('')
        const value = cell.querySelector('v')?.textContent || ''
        const type = cell.getAttribute('t')
        result[index] = type === 's' ? shared[Number(value)]! : type === 'inlineStr' ? cell.querySelector('is')?.textContent || '' : type === 'b' ? String(value === '1') : value
      }
      return result
    })
  }, { sheet: strFromU8(files['xl/worksheets/sheet1.xml']!), strings: files['xl/sharedStrings.xml'] ? strFromU8(files['xl/sharedStrings.xml']!) : '<sst/>', workbook: strFromU8(files['xl/workbook.xml']!) })
}

/** Quoted fields may contain delimiters, escaped quotes and physical newlines. */
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
  expect(quoted, 'CSV must close every quoted field').toBe(false)
  if (row.length || cell) rows.push([...row, cell])
  return rows
}

interface Client { id: string, name: string, active: boolean }
interface Project { id: string, name: string, client: string, active: boolean }

// Read-only viewer auth and catalog reads; synthetic detail rows never reach PB.
test('Entries exports all matching identities in CSV and XLSX across browse presentations', async ({ page, request }) => {
  test.setTimeout(90_000)
  const isolated = (process.env.PW_BASE_URL === 'http://127.0.0.1:3002' && pbOrigin() === 'http://127.0.0.1:8092')
    || (process.env.PW_BASE_URL === 'http://127.0.0.1:3003' && pbOrigin() === 'http://127.0.0.1:8093')
  if (!isolated) throw new Error('Run this read-only spec only against an isolated seeded :3002/:8092 or :3003/:8093 stack')
  const token = await apiLoginAs(request, VIEWER_EMAIL, VIEWER_PASSWORD)
  const headers = { Authorization: token }
  const clientsResponse = await request.get(pbUrl('/api/collections/clients/records?perPage=200'), { headers })
  const projectsResponse = await request.get(pbUrl('/api/collections/projects/records?perPage=200'), { headers })
  expect(clientsResponse.ok()).toBeTruthy()
  expect(projectsResponse.ok()).toBeTruthy()
  const clients = (await clientsResponse.json()).items as Client[]
  const projects = (await projectsResponse.json()).items as Project[]
  const project = projects.find(p => p.active && clients.some(c => c.active && c.id === p.client))
  expect(project, 'Isolated seed needs an active project and client').toBeDefined()
  const client = clients.find(c => c.id === project!.client)!
  const sentinel = 'PRIVATE_PROMPT_EXPORT_SENTINEL_71b94'
  const specialName = 'Session, "東京"\n<img src=x onerror="alert(1)">'
  const records = Array.from({ length: 1001 }, (_, i) => ({
    id: `export${String(i).padStart(9, '0')}`, task_id: `task-${i}`, client: client.id, project: project!.id,
    task: `task${String(i).padStart(11, '0')}`, status: 'completed',
    started_at: '2026-01-01 10:00:00.000Z', ended_at: '2026-01-01 10:01:00.000Z',
    wall_ms: 60000, work_ms: 45000, waiting_ms: 15000, cost: 0.0123,
    input: i + 1, output: 2, cache_read: 3, cache_write: 4, subagent_count: 0,
    session_id: `session-${i}`, session_name: i === 0 ? specialName : `Session ${i}`, machine: 'export-machine',
    model: 'export-model', agent: 'pi', prompt: sentinel,
    expand: { client: { name: client.name }, project: { name: project!.name }, task: { title: `Task ${i}` } },
  }))
  const exportRequests: URL[] = []
  const browseRequests: URL[] = []
  await page.route('**/api/collections/task_entries/records?*', async (route) => {
    expect(route.request().method()).toBe('GET')
    const url = new URL(route.request().url())
    const perPage = Number(url.searchParams.get('perPage'))
    const currentPage = Number(url.searchParams.get('page') || 1)
    if (perPage === 500) exportRequests.push(url)
    if (perPage === 25) browseRequests.push(url)
    // Return the sentinel even to projected requests: serialization must also exclude it.
    await route.fulfill({ json: {
      page: currentPage, perPage, totalItems: records.length, totalPages: Math.ceil(records.length / perPage),
      items: records.slice((currentPage - 1) * perPage, currentPage * perPage),
    } })
  })
  await page.addInitScript(() => {
    localStorage.setItem('kankaku-locale', 'en')
    localStorage.setItem('kankaku-entries-group-by-session', '0')
  })
  await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
  await page.goto('/entries')
  await selectCombobox(comboboxTrigger(page, 'Client'), client.name)
  await selectCombobox(comboboxTrigger(page, 'Project'), project!.name)
  await page.getByRole('button', { name: 'More filters · 0', exact: true }).click()
  await selectCombobox(comboboxTrigger(page, 'Status'), 'Completed')
  await page.getByRole('columnheader', { name: 'Started', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect.poll(() => browseRequests.at(-1)?.searchParams.get('page')).toBe('2')
  await expect(page.locator('table').first().locator('tbody tr')).toHaveCount(25)

  for (const format of ['csv', 'xlsx'] as const) {
    if (format === 'xlsx') {
      await page.getByRole('button', { name: 'Sessions', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Sessions', exact: true })).toHaveAttribute('aria-pressed', 'true')
    }
    const button = page.getByRole('button', { name: 'Export', exact: true })
    await expect(button).toBeEnabled()
    exportRequests.length = 0
    const pending = page.waitForEvent('download')
    await button.focus()
    await button.press('Enter')
    const csvItem = page.getByRole('menuitem', { name: 'CSV', exact: true })
    await expect(csvItem).toBeFocused()
    if (format === 'xlsx') {
      await csvItem.press('ArrowDown')
      await expect(page.getByRole('menuitem', { name: 'XLSX', exact: true })).toBeFocused()
    }
    await page.getByRole('menuitem', { name: format.toUpperCase(), exact: true }).press('Enter')
    const download = await pending
    const stream = await download.createReadStream()
    expect(stream).not.toBeNull()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    const content = Buffer.concat(chunks).toString('utf8')
    expect(content).not.toContain(sentinel)
    const table = format === 'csv' ? parseCsv(content) : await parseXlsx(page, Buffer.concat(chunks))
    const columns = table[0]!
    expect(columns).not.toContain('prompt')
    const rows = table.slice(1).map(row => Object.fromEntries(columns.map((key, i) => [key, row[i]])))
    const metadata = Object.fromEntries(rows.filter(r => r.section === 'metadata').map(r => [r.metadata_key, r.metadata_value]))
    expect(metadata).toMatchObject({ export_kind: 'entries_detail', client: client.id, project: project!.id,
      status: 'completed', sort: 'started_at', exported_rows: '1001', total_matching_rows: '1001', truncated: 'false', row_limit: '5000' })
    expect(Number.isNaN(Date.parse(metadata.generated_at!))).toBe(false)
    expect(download.suggestedFilename()).toBe(`entries-${metadata.generated_at!.slice(0, 10)}.${format}`)
    const details = rows.filter(r => r.section === 'task_entry')
    expect(details.map(r => r.id)).toEqual(records.map(r => r.id))
    expect(new Set(details.map(r => r.id)).size).toBe(1001)
    for (const [i, record] of records.entries()) {
      expect(details[i]).toMatchObject({ id: record.id, task_id: record.task_id, client: client.id,
        project: project!.id, session_name: record.session_name, client_name: client.name,
        project_name: project!.name, task_title: `Task ${i}`, work_ms: '45000', input: String(i + 1) })
    }
    expect(exportRequests.map(url => url.searchParams.get('page'))).toEqual(['1', '2', '3'])
    for (const url of exportRequests) {
      expect(url.searchParams.get('perPage')).toBe('500')
      expect(url.searchParams.get('sort')).toBe('started_at')
      expect(url.searchParams.get('filter')).toBe(`client = "${client.id}" && project = "${project!.id}" && status = "completed"`)
      expect(url.searchParams.get('fields')!.split(',')).not.toContain('prompt')
      expect(url.searchParams.get('fields')!.split(',')).toEqual(expect.arrayContaining(['id', 'task_id', 'expand.client.name', 'expand.project.name', 'expand.task.title']))
    }
    await expect(toastText(page, 'Exported 1001 entries (prompts excluded).').first()).toBeVisible()
  }
})
