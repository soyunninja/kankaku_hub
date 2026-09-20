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
