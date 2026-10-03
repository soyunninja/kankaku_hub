import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { loginAs, pbOrigin, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'

for (const timezoneId of ['Asia/Tokyo', 'America/Los_Angeles']) {
  test(`Dashboard and project display local-midnight measurement — ${timezoneId}`, async ({ browser }, testInfo) => {
    expect(process.env.PW_BASE_URL).toBe('http://127.0.0.1:3003')
    expect(pbOrigin()).toBe('http://127.0.0.1:8093')
    const context = await browser.newContext({ timezoneId, viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    const mutations: string[] = []
    const queries: { kind: string, filter: string, from: string, to: string }[] = []
    const prompt = `fictional-local-midnight-${timezoneId.replaceAll('/', '-')}`
    let fixture: { id: string, client: string, project: string, started_at: string, cost: number, work_ms: number, model: string, prompt: string } | undefined
    let expected: { from: string, to: string } | undefined
    await context.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const allowedPost = request.method() === 'POST' && (/\/auth-(with-password|refresh)$/.test(path) || path === '/api/kankaku/totals' || path === '/api/realtime')
      if (path.includes('/work_records/')) throw new Error('Raw work records are outside this measurement test')
      if (request.method() !== 'GET' && !allowedPost) {
        mutations.push(`${request.method()} ${path}`)
        await route.abort()
        throw new Error(`Forbidden business mutation: ${request.method()} ${path}`)
      }
      await route.continue()
    })
    await page.route('**/api/collections/task_entries/records?*', async route => {
      const url = new URL(route.request().url())
      const fields = url.searchParams.get('fields')
      const kind = fields === 'id,client,project,cost,work_ms,model' ? 'dashboard' : fields === 'id,prompt,cost,started_at' ? 'project' : undefined
      if (!fixture || !kind) { await route.continue(); return }
      expect(route.request().method()).toBe('GET')
      expect(url.searchParams.get('page')).toBe('1')
      expect(url.searchParams.get('perPage')).toBe('10')
      expect(url.searchParams.get('sort')).toBe('-cost')
      const filter = url.searchParams.get('filter') || ''
      const from = filter.match(/started_at >= "([^"]+)"/)?.[1]
      const to = filter.match(/started_at <= "([^"]+)"/)?.[1]
      expect({ from, to }).toEqual(expected)
      expect(fixture.started_at >= from! && fixture.started_at <= to!).toBe(true)
      if (kind === 'project') expect(filter).toContain(`project = "${fixture.project}"`)
      else expect(filter).not.toContain('project =')
      queries.push({ kind, filter, from: from!, to: to! })
      await route.fulfill({ json: { page: 1, perPage: 10, totalItems: 1, totalPages: 1, items: [fixture] } })
    })
    await page.addInitScript(() => localStorage.setItem('kankaku-locale', 'en'))
    try {
      const projectsResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/collections/projects/records' && response.request().method() === 'GET')
      await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
      const response = await projectsResponse
      expect(response.ok()).toBe(true)
      const projects = (await response.json()).items as { id: string, client: string, name: string }[]
      const project = projects[0]!
      expect(project?.id).toBeTruthy()
      const dates = await page.evaluate(() => {
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
        const pb = (date: Date) => date.toISOString().replace('T', ' ')
        return { started_at: pb(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 10)), from: pb(start), to: pb(end) }
      })
      expected = { from: dates.from, to: dates.to }
      fixture = { id: 'boundaryaaaaaaa', client: project.client, project: project.id, started_at: dates.started_at, cost: 888.81, work_ms: 600000, model: 'fictional-boundary-model', prompt }
      await page.goto('/')
      await expect(page.locator('main h1')).toBeVisible()
      const expensive = page.locator('table tbody tr').filter({ hasText: 'fictional-boundary-model' })
      await expect(expensive).toHaveCount(1)
      await expect(expensive).toContainText('$888.81')
      await expect(expensive).toContainText(project.name)
      await page.screenshot({ path: testInfo.outputPath('dashboard-midnight.png') })
      await page.goto(`/projects/${project.id}`)
      await expect(page.locator('main h1')).toHaveText(project.name)
      const promptRow = page.locator('table tbody tr').filter({ hasText: prompt })
      await expect(promptRow).toHaveCount(1)
      await expect(promptRow).toContainText('$888.81')
      expect(queries.map(query => query.kind)).toEqual(['dashboard', 'project'])
      expect(mutations).toEqual([])
      await page.screenshot({ path: testInfo.outputPath('project-midnight.png') })
      await writeFile(testInfo.outputPath('midnight-display.json'), JSON.stringify({ timezoneId, started_at: dates.started_at, queries, mutations }, null, 2))
    }
    finally { await context.close() }
  })

  test(`Entries default and explicit local-day bounds — ${timezoneId}`, async ({ browser }) => {
    expect(process.env.PW_BASE_URL).toBe('http://127.0.0.1:3003')
    expect(pbOrigin()).toBe('http://127.0.0.1:8093')
    const context = await browser.newContext({ timezoneId })
    const page = await context.newPage()
    const reads: URL[] = []
    const totals: Record<string, unknown>[] = []
    let boundaryEntry: { id: string, started_at: string, session_name: string, session_id: string, cost: number, status: string, work_ms: number } | undefined
    await context.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const allowedPost = request.method() === 'POST' && (/\/auth-(with-password|refresh)$/.test(path) || path === '/api/kankaku/totals' || path === '/api/realtime')
      if (request.method() !== 'GET' && !allowedPost) {
        await route.abort()
        throw new Error(`Forbidden business mutation: ${request.method()} ${path}`)
      }
      await route.continue()
    })
    await page.route('**/api/collections/task_entries/records?*', async route => {
      expect(route.request().method()).toBe('GET')
      const url = new URL(route.request().url())
      if (url.searchParams.get('perPage') === '25') reads.push(url)
      const filter = url.searchParams.get('filter') || ''
      const from = filter.match(/started_at >= "([^"]+)"/)?.[1]
      const to = filter.match(/started_at <= "([^"]+)"/)?.[1]
      const items = boundaryEntry && (!from || boundaryEntry.started_at >= from) && (!to || boundaryEntry.started_at <= to) ? [boundaryEntry] : []
      await route.fulfill({ json: { page: 1, totalItems: items.length, totalPages: 1, items } })
    })
    await page.route('**/api/kankaku/totals', async route => {
      const body = route.request().postDataJSON()
      if (body.group_by === 'session' && body.per_page === 25) totals.push(body)
      await route.fulfill({ json: { groups: [], total: {}, total_groups: 0, total_pages: 1 } })
    })
    await page.addInitScript(() => {
      localStorage.setItem('kankaku-locale', 'en')
      if (localStorage.getItem('kankaku-entries-group-by-session') === null) localStorage.setItem('kankaku-entries-group-by-session', '0')
    })
    try {
      await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
      const started_at = await page.evaluate(() => {
        const now = new Date()
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 10).toISOString().replace('T', ' ')
      })
      boundaryEntry = { id: 'boundaryaaaaaaa', started_at, session_name: 'Local midnight boundary', session_id: 'boundary-session', cost: 888.81, status: 'completed', work_ms: 600000 }
      await page.goto('/entries')
      await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled()
      const expected = await page.evaluate(() => {
        const end = new Date()
        const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 29)
        const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        return { start: day(start), end: day(end), from: new Date(`${day(start)}T00:00:00`).toISOString().replace('T', ' '), to: new Date(`${day(end)}T23:59:59.999`).toISOString().replace('T', ' ') }
      })
      await expect(page.locator('table tbody tr')).toHaveCount(1)
      await expect(page.locator('table tbody tr')).toContainText('$888.81')
      expect(reads.length).toBeGreaterThan(0)
      for (const url of reads) {
        expect(url.searchParams.get('filter')).toContain(`started_at >= "${expected.from}"`)
        expect(url.searchParams.get('filter')).toContain(`started_at <= "${expected.to}"`)
      }
      await page.getByRole('button', { name: 'Sessions', exact: true }).click()
      await expect.poll(() => totals.length).toBe(1)
      expect(totals[0]).toMatchObject({ from: expected.from, to: expected.to })
      await page.goto(`/entries?dateStart=${expected.end}&dateEnd=${expected.end}`)
      await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled()
      const dayBounds = await page.evaluate(day => ({ from: new Date(`${day}T00:00:00`).toISOString().replace('T', ' '), to: new Date(`${day}T23:59:59.999`).toISOString().replace('T', ' ') }), expected.end)
      await expect.poll(() => totals.at(-1)?.from).toBe(dayBounds.from)
      expect(totals.at(-1)).toMatchObject(dayBounds)
      await expect(page.locator('#entries-date-range')).toHaveAccessibleName(`Date range: ${expected.end} → ${expected.end}`)
      await page.getByRole('button', { name: 'Entries', exact: true }).click()
      await expect(page.locator('table tbody tr')).toHaveCount(1)
      await expect(page.locator('table tbody tr')).toContainText('$888.81')
      await page.goto(`/entries?dateEnd=${expected.start}`)
      await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled()
      await expect(page.getByTestId('entries-pagination-count')).toHaveText('0')
    }
    finally { await context.close() }
  })
}
