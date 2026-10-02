import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { buildDashboardExport, buildEntriesDetailExport, createCsvExport, createXlsxExport } from '../app/lib/export'
import { ZERO_TOTALS_ROW } from '../app/lib/totals-map'

describe('export payloads', () => {
  it('exports detailed rows after complete filter metadata without prompt text', async () => {
    const items = [{ id: 'e1', client: 'c1', work_ms: 42, prompt: 'PRIVATE', expand: { client: { name: '猫' } } }, { id: 'e2' }] as unknown as import('../app/lib/pocketbase-types').TaskEntryRecord[]
    const table = buildEntriesDetailExport({ items, filters: { search: 'needle', session_id: 's1' }, sort: '-cost', generatedAt: 'now', totalItems: 5001, rowLimit: 5000, truncated: true })
    const metadata = Object.fromEntries(table.rows.filter(r => r[0] === 'metadata').map(r => [r[1], r[2]]))
    expect(metadata).toMatchObject({ export_kind: 'entries_detail', generated_at: 'now', search: 'needle', session_id: 's1', client: '', sort: '-cost', row_limit: 5000, exported_rows: 2, total_matching_rows: 5001, truncated: true })
    const rows = table.rows.filter(r => r[0] === 'task_entry')
    expect(rows.map(r => r[table.headers.indexOf('id')])).toEqual(['e1', 'e2'])
    expect(rows[0]?.[table.headers.indexOf('client_name')]).toBe('猫')
    expect(rows[0]?.[table.headers.indexOf('work_ms')]).toBe(42)
    expect(table.rows.every(r => r.length === table.headers.length)).toBe(true)
    expect(createCsvExport(table).content).not.toContain('PRIVATE')
    expect(table.headers).not.toContain('prompt')
    const workbook = await createXlsxExport(table)
    const files = unzipSync(new Uint8Array(await workbook.content.arrayBuffer()))
    const strings = new DOMParser().parseFromString(strFromU8(files['xl/sharedStrings.xml']!), 'application/xml').documentElement.textContent
    expect(strings).toContain('entries_detail')
    expect(strings).toContain('generated_at')
    expect(strings).toContain('猫')
    expect(strings).not.toContain('PRIVATE')
    expect(buildEntriesDetailExport({ items: [], filters: {}, sort: 'id', generatedAt: 'now', totalItems: 0, rowLimit: 5000, truncated: false }).rows.every(r => r[0] === 'metadata')).toBe(true)
  })
  it('prepends deterministic summary metadata and distinguishes fallback truncation', () => {
    const snapshot = {
      period: { start: '2026-01-01', end: '2026-01-31' }, includeUnassigned: false, agent: 'pi',
      generatedAt: '2026-02-01T12:00:00.000Z',
      metadata: {
        dataSource: 'totals_endpoint' as const, clientBreakdownLimit: 200, projectBreakdownLimit: 200,
        topExpensiveLimit: 10, clientBreakdownTruncated: true, projectBreakdownTruncated: false,
        fallbackRowsTruncated: null,
      },
      totals: ZERO_TOTALS_ROW, byClient: [], byProject: [], topExpensive: [],
    }
    const table = buildDashboardExport(snapshot)
    const expected = {
      export_kind: 'dashboard_summary', generated_at: snapshot.generatedAt, data_source: 'totals_endpoint',
      period_start: '2026-01-01', period_end: '2026-01-31', include_unassigned: false, agent: 'pi',
      client_breakdown_limit: 200, project_breakdown_limit: 200, top_expensive_limit: 10,
      client_breakdown_truncated: true, project_breakdown_truncated: false, fallback_rows_truncated: 'not_applicable',
    }
    expect(Object.fromEntries(table.rows.filter(row => row[0] === 'metadata').map(row => [row[1], row[2]]))).toEqual(expected)
    expect(table.rows.slice(0, Object.keys(expected).length).every(row => row[0] === 'metadata')).toBe(true)
    expect(table.rows.every(row => row.length === table.headers.length)).toBe(true)
    const fallback = buildDashboardExport({ ...snapshot, metadata: {
      ...snapshot.metadata, dataSource: 'fallback_task_entries', clientBreakdownLimit: null, projectBreakdownLimit: null,
      clientBreakdownTruncated: false, fallbackRowsTruncated: true,
    } })
    const values = Object.fromEntries(fallback.rows.filter(row => row[0] === 'metadata').map(row => [row[1], row[2]]))
    expect(values.data_source).toBe('fallback_task_entries')
    expect(values.fallback_rows_truncated).toBe(true)
    expect(values.client_breakdown_limit).toBe('none')
    expect(createCsvExport(table).content).toContain('dashboard_summary')
    expect(fallback.rows.some(row => row[1] === 'fallback_rows_truncated')).toBe(true)
  })
  it('quotes CSV cells, preserves Unicode and line breaks, and uses deterministic CRLF', () => {
    const table = { headers: ['Name', 'Value'], rows: [['Niño, "猫"', 'a\nb\rc'], [null, 0], [false, '=SUM(A1)']] }
    const payload = createCsvExport(table)
    expect(payload).toEqual({
      content: '\uFEFF"Name","Value"\r\n"Niño, ""猫""","a\nb\rc"\r\n"","0"\r\n"false","\'=SUM(A1)"\r\n',
      mimeType: 'text/csv;charset=utf-8',
      extension: 'csv',
    })
    expect(createCsvExport(table)).toEqual(payload)
  })

  it('writes a real OOXML workbook with literal text and typed cells', async () => {
    const values = ['00123', '=1+1', '+cmd', '-cmd', '@cmd', '\t=cmd', '<script>"&\'</script>\n猫', 'Niño']
    const payload = await createXlsxExport({ headers: ['Name', 'Number', 'Boolean', 'Blank'], rows: values.map((value, i) => [value, 12.5, i % 2 === 0, i % 2 === 0 ? null : undefined]) })
    expect(payload.extension).toBe('xlsx')
    expect(payload.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const files = unzipSync(new Uint8Array(await payload.content.arrayBuffer()))
    const xml = (name: string) => new DOMParser().parseFromString(strFromU8(files[name]!), 'application/xml')
    expect(xml('[Content_Types].xml').querySelector('Override[PartName="/xl/workbook.xml"]')?.getAttribute('ContentType')).toContain('spreadsheetml.sheet.main+xml')
    expect(xml('xl/workbook.xml').querySelector('sheet')?.getAttribute('name')).toBe('Measurements')
    const sheet = xml('xl/worksheets/sheet1.xml')
    expect(sheet.querySelector('f')).toBeNull()
    const strings = [...xml('xl/sharedStrings.xml').querySelectorAll('si')].map(si => si.textContent)
    const cell = (ref: string) => sheet.querySelector(`c[r="${ref}"]`)
    for (const [i, value] of values.entries()) {
      expect(cell(`A${i + 2}`)?.getAttribute('t')).toBe('s')
      expect(strings[Number(cell(`A${i + 2}`)?.querySelector('v')?.textContent)]).toBe(value)
      expect([null, 'n']).toContain(cell(`B${i + 2}`)?.getAttribute('t'))
      expect(cell(`B${i + 2}`)?.querySelector('v')?.textContent).toBe('12.5')
      expect(cell(`C${i + 2}`)?.getAttribute('t')).toBe('b')
      expect(cell(`C${i + 2}`)?.querySelector('v')?.textContent).toBe(i % 2 === 0 ? '1' : '0')
      expect(cell(`D${i + 2}`)?.querySelector('v') ?? null).toBeNull()
    }
  })

  it('exports headers for empty tables and guards spreadsheet formula prefixes', () => {
    expect(createCsvExport({ headers: ['Only'], rows: [] }).content).toBe('\uFEFF"Only"\r\n')
    for (const value of ['+cmd', '-cmd', '@cmd', '\t=cmd', '\r=cmd', ' =cmd']) {
      expect(createCsvExport({ headers: [], rows: [[value]] }).content).toContain(`"'${value}"`)
    }
    expect(createCsvExport({ headers: [], rows: [[-12]] }).content).toContain('"-12"')
  })

  it('maps only supplied dashboard data, preserving totals, IDs, quality, and row order', () => {
    const totals = { ...ZERO_TOTALS_ROW, entries: 7, cost: 19.25, workMs: 1234, costUnknownEntries: 2 }
    const snapshot = {
      period: { start: '2026-01-01', end: '2026-01-31' },
      includeUnassigned: false,
      agent: 'pi',
      generatedAt: '2026-02-01T12:00:00.000Z',
      metadata: {
        dataSource: 'totals_endpoint' as const, clientBreakdownLimit: 200, projectBreakdownLimit: 200,
        topExpensiveLimit: 10, clientBreakdownTruncated: false, projectBreakdownTruncated: false, fallbackRowsTruncated: null,
      },
      totals,
      byClient: [{ ...totals, key: 'c1', label: 'Niño' }],
      byProject: [{ ...totals, key: 'p1', label: 'Project' }],
      topExpensive: [{ id: 'entry1', client: 'c1', project: 'p1', cost: 3, work_ms: 42, model: 'model' }],
    }
    const before = JSON.stringify(snapshot)
    const exported = buildDashboardExport(snapshot)
    const table = { ...exported, rows: exported.rows.filter(row => row[0] !== 'metadata') }
    expect(table.headers.slice(0, 8)).toEqual(['section', 'id', 'label', 'client_id', 'project_id', 'model', 'period_start', 'period_end'])
    expect(table.rows.map(row => row[0])).toEqual(['totals', 'client', 'project', 'task_entry'])
    expect(table.rows[1]?.slice(0, 3)).toEqual(['client', 'c1', 'Niño'])
    const index = (header: string) => table.headers.indexOf(header)
    expect(table.rows[0]?.[index('entries')]).toBe(7)
    expect(table.rows[0]?.[index('cost')]).toBe(19.25)
    expect(table.rows[0]?.[index('cost_unknown_entries')]).toBe(2)
    expect(table.rows[3]?.[index('work_ms')]).toBe(42)
    expect(table.rows[3]?.[index('entries')]).toBeNull()
    expect(table.rows.every(row => row.length === table.headers.length)).toBe(true)
    expect(JSON.stringify(snapshot)).toBe(before)
    expect(createCsvExport(table).content).toContain('Niño')
    expect(buildDashboardExport({ ...snapshot, byClient: [], byProject: [], topExpensive: [] }).rows.filter(row => row[0] !== 'metadata')).toHaveLength(1)
  })
})
