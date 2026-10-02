import { expect, test } from '@playwright/test'
import { apiLogin, login, pbOrigin, pbUrl } from './helpers'

interface SeedEntry { id: string, session_id: string, started_at: string, model: string, status: string }

const statusTone: Record<string, string> = { completed: 'bg-success', aborted: 'bg-destructive', interrupted: 'bg-warning' }

// Reads existing isolated seed data only; no fixture creation or PocketBase writes.
test('Entries compact dates, lean grouped/flat tables and validated ISO-backed filters', async ({ page, request }) => {
  test.setTimeout(90_000)
  const isolatedStack = (process.env.PW_BASE_URL === 'http://127.0.0.1:3002' && pbOrigin() === 'http://127.0.0.1:8092')
    || (process.env.PW_BASE_URL === 'http://127.0.0.1:3003' && pbOrigin() === 'http://127.0.0.1:8093')
  if (!isolatedStack) {
    throw new Error('Run this read-only spec only against an isolated :3002/:8092 or :3003/:8093 stack')
  }
  await page.route('**/api/collections/*/records**', async route => {
    expect(route.request().method()).toBe('GET')
    await route.continue()
  })
  const token = await apiLogin(request)
  const response = await request.get(pbUrl('/api/collections/task_entries/records?perPage=100&sort=-started_at'), { headers: { Authorization: token } })
  expect(response.ok()).toBeTruthy()
  const entries = (await response.json()).items as SeedEntry[]
  const seed = entries.find(e => e.session_id && e.model)
  expect(seed, 'Isolated seed needs an entry with a session and model').toBeDefined()
  const entry = seed!
  const sessionResponse = await request.get(pbUrl('/api/collections/task_entries/records'), {
    headers: { Authorization: token },
    params: { perPage: '200', sort: '-started_at', filter: `session_id = "${entry.session_id}"` },
  })
  expect(sessionResponse.ok()).toBeTruthy()
  const sessionEntries = (await sessionResponse.json()).items as SeedEntry[]
  expect(sessionEntries.length).toBeGreaterThan(0)
  const modelRowIndex = sessionEntries.findIndex(e => e.model)
  expect(modelRowIndex).toBeGreaterThanOrEqual(0)

  await login(page)
  await page.goto(`/entries?session_id=${encodeURIComponent(entry.session_id)}`)
  const expected = await page.evaluate((instants) => instants.map((instant) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant.replace(' ', 'T')))
    const get = (type: string) => parts.find(p => p.type === type)!.value
    return { timestamp: `${get('year')}/${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`, day: `${get('year')}/${get('month')}/${get('day')}` }
  }), sessionEntries.map(e => e.started_at))
  const [year, month, day] = expected[0]!.day.split('/')
  const bounds = await page.evaluate(([y, m, d]) => ({
    start: new Date(Number(y), Number(m) - 1, Number(d)).toISOString().replace('T', ' ').slice(0, 23),
    end: new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999).toISOString().replace('T', ' ').slice(0, 23),
  }), [`20${year}`, month!, day!] as const)
  await page.locator('#entries-date-range').click()
  const start = page.getByRole('textbox', { name: 'Inicio', exact: true })
  const end = page.getByRole('textbox', { name: 'Fin', exact: true })
  await expect(start).toHaveAttribute('placeholder', 'YY/MM/DD')
  await expect(start).toHaveAttribute('inputmode', 'numeric')
  await expect(start).toHaveAttribute('maxlength', '8')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="session-group-row"]').first()).toBeVisible()
  const outer = page.locator('table').first()
  await expect(outer.locator('thead tr').first().locator('th')).toHaveCount(10)
  const session = page.locator('[data-testid="session-group-row"]').first()
  await expect(session.locator('td').first()).toHaveText(expected.at(-1)!.timestamp)
  await page.waitForLoadState('networkidle')
  const expander = session.getByRole('button', { name: 'Entradas de la sesión' })
  // A session deep link already expands its sole group after loading.
  if (await expander.getAttribute('aria-expanded') !== 'true') await expander.click()
  await expect(expander).toHaveAttribute('aria-expanded', 'true')
  const nested = page.locator('[data-testid="session-group-entries"] table')
  await expect(nested.locator('thead th')).toHaveCount(4)
  await expect(nested.getByRole('columnheader', { name: 'Modelo' })).toHaveCount(0)
  const rows = nested.locator('tbody tr')
  await expect(rows.first().locator('td').first()).toHaveText(expected[0]!.timestamp)
  await expect(rows.first().locator('td')).toHaveCount(4)
  await expect(rows.first().locator('td').nth(1).locator('[data-slot="badge"]')).toHaveClass(new RegExp(statusTone[sessionEntries[0]!.status]!))
  await rows.nth(modelRowIndex).locator('td').first().click()
  await expect(page.locator('[data-slot="sheet-content"]')).toContainText(sessionEntries[modelRowIndex]!.model)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Entradas', exact: true }).click()
  await expect(outer.locator('thead tr').first().locator('th')).toHaveCount(8)
  await expect(outer.getByRole('columnheader', { name: 'Modelo' })).toHaveCount(0)
  const flatRows = outer.locator('tbody tr').filter({ hasText: expected[0]!.timestamp })
  await expect(flatRows.first()).toBeVisible()
  await expect(flatRows.first().locator('td')).toHaveCount(8)
  await expect(flatRows.first().locator('td').nth(4).locator('[data-slot="badge"]')).toHaveClass(new RegExp(statusTone[sessionEntries[0]!.status]!))
  await page.waitForLoadState('networkidle')

  const fetches: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/collections/task_entries/records?')) fetches.push(r.url())
  })
  await page.locator('#entries-date-range').click()
  await start.fill('26/02/30') // impossible day: leave the applied filter untouched
  await start.press('Enter')
  await expect(start).toHaveAttribute('aria-invalid', 'true')
  await expect(start).toHaveAttribute('aria-describedby', 'entries-date-start-error')
  await expect(page.locator('#entries-date-start-error')).toContainText('AA/MM/DD')
  await expect(flatRows.first()).toBeVisible()
  expect(fetches).toHaveLength(0)
  await start.fill('26/02') // incomplete date also cannot reach the API
  await start.blur()
  await expect(start).toHaveAttribute('aria-invalid', 'true')
  expect(fetches).toHaveLength(0)

  await start.fill(expected[0]!.day)
  await start.press('Enter')
  await expect(start).toHaveAttribute('aria-invalid', 'false')
  await expect.poll(() => fetches.length).toBeGreaterThan(0)
  expect(decodeURIComponent(fetches.at(-1)!)).toContain(bounds.start)
  await expect(flatRows.first()).toBeVisible()
  const beforeEnd = fetches.length
  await end.fill(expected[0]!.day)
  await end.blur()
  await expect(end).toHaveAttribute('aria-invalid', 'false')
  await expect.poll(() => fetches.length).toBeGreaterThan(beforeEnd)
  expect(decodeURIComponent(fetches.at(-1)!)).toContain(bounds.end)
  const beforeClear = fetches.length
  await start.fill('')
  await start.press('Enter')
  await expect(start).toHaveValue('')
  await expect.poll(() => fetches.length).toBeGreaterThan(beforeClear)
  const beforeCalendar = fetches.length
  await page.getByRole('button', { name: /abrir calendario para inicio/i }).click()
  const calendar = page.locator('[data-slot="calendar"]')
  await expect(calendar).toBeVisible()
  // Placeholder tracks the last applied day; select it via the real keyboard-operable grid.
  const calendarDay = calendar.getByRole('gridcell', { name: new RegExp(`\\b${Number(day)}\\b`) }).first().getByRole('button')
  await calendarDay.focus()
  await calendarDay.press('Enter')
  await expect(start).toHaveValue(expected[0]!.day)
  await expect(calendar).toBeHidden()
  await expect.poll(() => fetches.length).toBeGreaterThan(beforeCalendar)
  expect(decodeURIComponent(fetches.at(-1)!)).toContain(bounds.start)
  const beforeVisibleClear = fetches.length
  await page.getByRole('button', { name: /borrar fin/i }).click()
  await expect(end).toHaveValue('')
  await expect.poll(() => fetches.length).toBeGreaterThan(beforeVisibleClear)
  await page.goto(`/entries?session_id=${encodeURIComponent(entry.session_id)}&dateStart=20${year}-${month}-${day}`)
  await page.locator('#entries-date-range').click()
  await expect(start).toHaveValue(expected[0]!.day)
})
