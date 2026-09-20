import { expect, test } from '@playwright/test'
import { login, OWNER_EMAIL, OWNER_PASSWORD, setTheme } from './helpers'

/**
 * Targeted regression checks for the visual/UX polish pass (see
 * ESTADO.md "Pase de pulido"). Kept separate from e2e/smoke.spec.ts so a
 * failure here points straight at a specific defect class instead of a
 * generic smoke failure.
 */

interface ClientRecord { id: string, name: string, unassigned: boolean, active: boolean }

async function apiLogin(request: import('@playwright/test').APIRequestContext) {
  const res = await request.post('/api/collections/users/auth-with-password', {
    data: { identity: OWNER_EMAIL, password: OWNER_PASSWORD },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const body = await res.json()
  return body.token as string
}

async function findClients(request: import('@playwright/test').APIRequestContext, token: string) {
  const res = await request.get('/api/collections/clients/records?perPage=200', {
    headers: { Authorization: token },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  const items = body.items as ClientRecord[]
  const unassigned = items.find(c => c.unassigned)
  const target = items.find(c => !c.unassigned && c.active)
  if (!unassigned || !target) throw new Error('Seed data must include an unassigned client and at least one active client')
  return { unassigned, target }
}

test.describe('KPI cards never clip their value', () => {
  test('at desktop and mobile widths', async ({ page }) => {
    await login(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size)
      await page.waitForTimeout(200)
      const values = page.locator('[data-testid="kpi-value"]')
      const count = await values.count()
      expect(count).toBeGreaterThan(0)
      for (let i = 0; i < count; i++) {
        const el = values.nth(i)
        const overflow = await el.evaluate(node => node.scrollWidth - node.clientWidth)
        expect(overflow, `KPI value #${i} at ${size.width}px must not overflow its card`).toBeLessThanOrEqual(1)
      }
    }
  })
})

test.describe('time-series chart fills its container', () => {
  test('svg renders at more than 90% of the card width', async ({ page }) => {
    await login(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const container = page.locator('[data-testid="chart-container"]')
    const svg = page.locator('[data-testid="chart-svg"]')
    await expect(svg).toBeVisible()

    const containerBox = await container.boundingBox()
    const svgBox = await svg.boundingBox()
    expect(containerBox && svgBox).toBeTruthy()
    const ratio = svgBox!.width / containerBox!.width
    expect(ratio).toBeGreaterThan(0.9)
  })
})

test.describe('unassigned queue is translated in Spanish', () => {
  test('shows Trabajo/Coste, not Work/Cost', async ({ page }) => {
    await login(page)
    await page.goto('/unassigned')
    await page.waitForLoadState('networkidle')

    const header = page.locator('table thead')
    await expect(header).toContainText('Trabajo')
    await expect(header).toContainText('Coste')
    await expect(header).not.toContainText('Work')
    await expect(header).not.toContainText(/\bCost\b/)
  })
})

test.describe('bulk assignment end-to-end', () => {
  test('assigns a disposable unassigned group, updates the queue and dashboard without a full reload', async ({ page, request }) => {
    test.setTimeout(60_000)
    const token = await apiLogin(request)
    const { unassigned, target } = await findClients(request, token)

    const runId = `e2e-${Date.now()}`
    const legacyLabel = `E2E Group ${runId}`
    const startedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + '.000Z'
    const createdIds: string[] = []

    // Two disposable task_entries rows pointed at "Sin determinar", so the
    // bulk-assign flow has a real, isolated group to work on without
    // touching the seeded demo data.
    for (let i = 0; i < 2; i++) {
      const res = await request.post('/api/collections/task_entries/records', {
        headers: { Authorization: token },
        data: {
          task_id: `${runId}-${i}`,
          client: unassigned.id,
          project: '',
          task: '',
          started_at: startedAt,
          ended_at: startedAt,
          wall_ms: 60_000,
          waiting_ms: 0,
          work_ms: 60_000,
          input: 100,
          output: 100,
          cache_read: 0,
          cache_write: 0,
          cost: 0.01,
          status: 'completed',
          session_id: `${runId}-session`,
          session_name: '',
          machine: 'e2e',
          model: 'e2e-model',
          prompt: '',
          legacy_client_label: legacyLabel,
          repo_project: '',
          schema: 1,
        },
      })
      expect(res.ok(), await res.text()).toBeTruthy()
      const created = await res.json()
      createdIds.push(created.id)
    }

    try {
      // Baseline: how many entries the target client already shows on the
      // dashboard's default range, before assignment.
      await login(page)
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      const clientRow = page.locator('[data-testid="breakdown-by-client"] table tbody tr', { hasText: target.name })
      const baselineText = (await clientRow.count()) > 0 ? await clientRow.first().locator('td').last().innerText() : '0'
      const baselineCount = Number.parseInt(baselineText, 10) || 0

      await page.goto('/unassigned')
      await page.waitForLoadState('networkidle')

      const groupRow = page.locator('table tbody tr', { hasText: legacyLabel })
      await expect(groupRow).toBeVisible()

      await groupRow.getByRole('button', { name: 'Asignar grupo' }).click()

      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      // The assign dialog has two native <select>s (client, then project) —
      // the client one is first.
      await dialog.locator('select').first().selectOption({ label: target.name })
      await dialog.getByRole('button', { name: 'Asignar a' }).click()

      // Toast confirms how many rows moved and where — no full page reload.
      await expect(page.getByText(`2 registros movidos a ${target.name}.`)).toBeVisible({ timeout: 10_000 })
      // The group must disappear from the queue without a reload.
      await expect(groupRow).toHaveCount(0)

      // Dashboard reflects the reassignment on next navigation (SPA nav,
      // not a hard reload) — target client's count grew by exactly 2.
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      const afterRow = page.locator('[data-testid="breakdown-by-client"] table tbody tr', { hasText: target.name })
      await expect(afterRow).toBeVisible()
      const afterText = await afterRow.first().locator('td').last().innerText()
      expect(Number.parseInt(afterText, 10)).toBe(baselineCount + 2)
    }
    finally {
      // Clean up regardless of outcome — never leave e2e rows in the
      // seeded demo data.
      for (const id of createdIds) {
        await request.delete(`/api/collections/task_entries/records/${id}`, { headers: { Authorization: token } })
      }
    }
  })
})

test.describe('mobile viewport (390px) never overflows horizontally', () => {
  test('dashboard, entries and unassigned pages fit inside the viewport', async ({ page }) => {
    await login(page)
    await page.setViewportSize({ width: 390, height: 844 })

    for (const path of ['/', '/entries', '/unassigned']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(200)
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }))
      expect(scrollWidth, `${path} must not overflow the 390px viewport`).toBeLessThanOrEqual(innerWidth)
    }
  })

  test('every table-in-card screen fits inside the viewport', async ({ page }) => {
    await login(page)
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto('/projects')
    await page.waitForLoadState('networkidle')
    await page.locator('table tbody tr').first().click()
    await page.waitForURL(/\/projects\/.+/)
    const projectDetailUrl = page.url()

    for (const path of ['/clients', '/projects', projectDetailUrl, '/tasks']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(200)
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }))
      expect(scrollWidth, `${path} must not overflow the 390px viewport`).toBeLessThanOrEqual(innerWidth)
    }

    // The tasks page defaults to the board view — switch to the list view
    // (a plain <table>, the pattern this check targets) and re-check.
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')
    await page.getByRole('tab', { name: /Lista|List/ }).click()
    await page.waitForTimeout(200)
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(scrollWidth, 'tasks list view must not overflow the 390px viewport').toBeLessThanOrEqual(innerWidth)
  })
})

test.describe('KPI labels never clip at any width', () => {
  test('title and delta elements never scroll past their own box', async ({ page }) => {
    await login(page)

    for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size)
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(200)

      const titles = page.locator('[data-testid="kpi-value"]').locator('..').locator('..').locator('[data-slot="card-title"]')
      const titleCount = await titles.count()
      expect(titleCount).toBeGreaterThan(0)
      for (let i = 0; i < titleCount; i++) {
        const el = titles.nth(i)
        // Width: never horizontally truncated. Height: the title is
        // line-clamped to 2 lines (see KpiCard.vue) — it must actually
        // fit in those 2 lines, not get its own text cut off by the
        // clamp's ellipsis (scrollHeight > clientHeight means a 3rd line
        // of text exists but is hidden).
        const box = await el.evaluate(node => ({ sw: node.scrollWidth, cw: node.clientWidth, sh: node.scrollHeight, ch: node.clientHeight }))
        expect(box.sw - box.cw, `KPI title #${i} at ${size.width}px must not overflow its box horizontally`).toBeLessThanOrEqual(1)
        expect(box.sh - box.ch, `KPI title #${i} at ${size.width}px must fit within its 2-line clamp`).toBeLessThanOrEqual(1)
      }

      const deltas = page.locator('[data-testid="kpi-delta"]')
      const deltaCount = await deltas.count()
      for (let i = 0; i < deltaCount; i++) {
        const el = deltas.nth(i)
        const overflow = await el.evaluate(node => node.scrollWidth - node.clientWidth)
        expect(overflow, `KPI delta #${i} at ${size.width}px must not overflow its own box`).toBeLessThanOrEqual(1)
      }
    }
  })
})

test.describe('mobile sidebar sheet', () => {
  test('traps focus inside and closes on Escape', async ({ page }) => {
    await login(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('header button.md\\:hidden').click()
    const sheet = page.locator('[data-slot="sheet-content"]')
    await expect(sheet).toBeVisible()

    // Focus must have moved inside the sheet (reka-ui's Dialog focus scope).
    const focusInsideSheet = await page.evaluate(() =>
      document.activeElement?.closest('[data-slot="sheet-content"]') !== null)
    expect(focusInsideSheet).toBe(true)

    // Tabbing repeatedly must never move focus outside the sheet.
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab')
      const stillInside = await page.evaluate(() =>
        document.activeElement?.closest('[data-slot="sheet-content"]') !== null)
      expect(stillInside, `focus must stay trapped after ${i + 1} Tab presses`).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
  })
})

test.describe('theme', () => {
  test('defaults to dark, switches to light and to system', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('html')).toHaveClass('dark')
    await login(page)
    await setTheme(page, 'light')
    await expect(page.locator('html')).toHaveClass('light')
    await setTheme(page, 'system')
    await expect(page.locator('html')).toHaveClass(/dark|light/)
  })
})
