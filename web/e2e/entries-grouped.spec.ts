import type { APIRequestContext } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { apiLogin, assertPbWritesAllowed, findClients, login, pbUrl } from './helpers'

/**
 * End-to-end coverage for the Entries screen's new default: grouped by
 * session, server-backed (`app/pages/entries/index.vue`,
 * `app/lib/entries-session-filters.ts`, `useSessions().fetchSessionTotalsForEntries`)
 * — see `odd/tasks/entries-grouped-by-session.md`.
 *
 * Fixture entries are disposable rows created directly via the API,
 * never the random seed data, cleaned up in `finally` regardless of
 * outcome — same convention as `e2e/session-features.spec.ts`.
 */

interface EntryOverrides {
  sessionId: string
  sessionName: string
  machine: string
  startedAtOffsetMs?: number
  workMs?: number
  cost?: number
}

async function createEntry(
  request: APIRequestContext,
  token: string,
  clientId: string,
  projectId: string,
  runBase: string,
  overrides: EntryOverrides,
): Promise<string> {
  assertPbWritesAllowed()
  const startedAtDate = new Date(Date.now() + (overrides.startedAtOffsetMs ?? 0))
  const startedAt = `${startedAtDate.toISOString().replace('T', ' ').slice(0, 19)}.000Z`
  const res = await request.post(pbUrl('/api/collections/task_entries/records'), {
    headers: { Authorization: token },
    data: {
      task_id: `${runBase}-${Math.floor(Math.random() * 1e6)}`,
      client: clientId,
      project: projectId,
      task: '',
      started_at: startedAt,
      ended_at: startedAt,
      wall_ms: 300_000,
      waiting_ms: 30_000,
      work_ms: overrides.workMs ?? 270_000,
      input: 50,
      output: 100,
      cache_read: 0,
      cache_write: 0,
      cost: overrides.cost ?? 0.02,
      cost_quality: 'measured',
      segments: {},
      subagent_count: 0,
      runs: 1,
      turns: 1,
      status: 'completed',
      session_id: overrides.sessionId,
      session_name: overrides.sessionName,
      machine: overrides.machine,
      model: 'e2e-model',
      thinking_level: '',
      prompt: `${runBase} prompt`,
      legacy_client_label: '',
      repo_project: '/home/dev/repos/e2e-entries-grouped-fixture',
      schema: 1,
      agent: 'pi',
    },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const created = await res.json()
  return created.id as string
}

async function deleteEntries(request: APIRequestContext, token: string, ids: string[]) {
  assertPbWritesAllowed()
  for (const id of ids) {
    await request.delete(pbUrl(`/api/collections/task_entries/records/${id}`), { headers: { Authorization: token } })
  }
}

test.describe('entries: grouped by session (server-backed, default)', () => {
  test('fresh browser opens grouped; a session row shows count/time/cost; expanding shows its entries; switching to flat shows per-entry rows', async ({ page, request, context }) => {
    test.setTimeout(90_000)
    const token = await apiLogin(request)
    const { target } = await findClients(request, token)
    const projectsRes = await request.get(pbUrl(`/api/collections/projects/records?perPage=1&filter=${encodeURIComponent(`client = "${target.id}"`)}`), {
      headers: { Authorization: token },
    })
    const project = (await projectsRes.json()).items[0]

    const runBase = `e2e-grouped-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const sessionId = `${runBase}-session`
    const sessionName = `E2E Grouped Session ${runBase}`

    const ids: string[] = []
    try {
      ids.push(await createEntry(request, token, target.id, project.id, runBase, {
        sessionId, sessionName, machine: runBase, startedAtOffsetMs: -60_000, workMs: 120_000, cost: 0.01,
      }))
      ids.push(await createEntry(request, token, target.id, project.id, runBase, {
        sessionId, sessionName, machine: runBase, startedAtOffsetMs: 0, workMs: 150_000, cost: 0.02,
      }))

      ids.push(await createEntry(request, token, target.id, project.id, runBase, {
        sessionId: `${runBase}-other-session`,
        sessionName: `E2E Other Session ${runBase}`,
        machine: runBase,
        startedAtOffsetMs: -30_000,
      }))

      // Fresh browser: no `kankaku-entries-group-by-session` key yet — the
      // new default is grouped (no cookie/localStorage carries over, and
      // this context has never visited the app before `login`).
      await context.clearCookies()
      await login(page)
      await page.goto('/entries')
      await page.waitForLoadState('networkidle')

      // Scope to just this fixture via the (still-enabled-in-grouped-mode)
      // machine filter.
      await page.getByPlaceholder('Máquina').fill(runBase)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)

      await expect(page.getByRole('switch', { name: 'Agrupar por sesión' })).toHaveAttribute('data-state', 'checked')

      // The primary grouped mode has its own header/columns (Inicio | Sesión
      // | Cliente | Proyecto | Tarea | Agente | Entradas | Tiempo | Coste),
      // each a real column — not a colspan-ed summary blob. Agente lives
      // here (a session always has one agent), not on the nested table.
      await expect(page.getByRole('columnheader', { name: 'Sesión', exact: true })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Tarea', exact: true })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Agente', exact: true })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Entradas', exact: true })).toBeVisible()

      const groupHeaders = page.locator('[data-testid="session-group-row"]')
      await expect(groupHeaders).toHaveCount(2)
      // Engram can replace the visible name, but the accessible full ID
      // remains stable and identifies the target independently of row order.
      const targetMarker = page.getByRole('button', { name: `Sesión: ${sessionId} —` })
      const sessionRow = groupHeaders.filter({ has: targetMarker })
      await expect(sessionRow).toHaveCount(1)
      await expect(sessionRow.getByRole('button', { name: `Sesión: ${sessionId} —` })).toBeVisible()

      // Entries count is its own right-aligned cell, no "N entradas" label.
      const entriesCountCell = sessionRow.locator('[data-testid="session-entries-count"]')
      await expect(entriesCountCell).toHaveText('2')
      await expect(entriesCountCell).toHaveClass(/text-right/)

      // work_ms sum: 120_000 + 150_000 = 270_000ms = 4m 30s.
      await expect(sessionRow.getByText(/4[m]/)).toBeVisible()
      // cost sum: 0.01 + 0.02 = 0.03.
      await expect(sessionRow.getByText(/0[.,]03/)).toBeVisible()

      // The model/quality/search filters (unsupported by the totals
      // contract) are disabled while grouped.
      await expect(page.getByPlaceholder('Modelo')).toBeDisabled()

      // Expand: a nested table of this session's entries appears, with its
      // own (narrower) header — no Sesión/Cliente/Proyecto columns, since
      // the parent row already said those.
      const toggle = sessionRow.getByRole('button', { name: 'Entradas de la sesión' })
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')

      const nestedArea = page.locator('[data-testid="session-group-entries"]')
      await expect(nestedArea.locator('table')).toHaveCount(1)
      await expect(nestedArea.getByRole('columnheader', { name: 'Estado', exact: true })).toBeVisible()
      await expect(nestedArea.getByRole('columnheader', { name: 'Sesión', exact: true })).toHaveCount(0)
      await expect(nestedArea.getByRole('columnheader', { name: 'Cliente', exact: true })).toHaveCount(0)
      await expect(nestedArea.getByRole('columnheader', { name: 'Agente', exact: true })).toHaveCount(0)

      const entryRows = nestedArea.locator('tbody tr').filter({ hasText: 'Completado' })
      await expect(entryRows).toHaveCount(2, { timeout: 10_000 })

      // Collapse again: the nested table disappears.
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await expect(page.locator('[data-testid="session-group-entries"]')).toHaveCount(0)

      // Selecting the marker filters AND loads nested entries. Repeated
      // selection ensures open, while the explicit chevron still collapses.
      const marker = sessionRow.getByRole('button', { name: `Sesión: ${sessionId} —` })
      await marker.click()
      await expect(groupHeaders).toHaveCount(1)
      await expect(sessionRow).toHaveCount(1)
      await expect(page.getByRole('button', { name: 'Quitar filtro de sesión', exact: true })).toBeVisible()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(entryRows).toHaveCount(2)
      await marker.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await toggle.click()
      await expect(nestedArea).toHaveCount(0)
      await marker.click()
      await expect(entryRows).toHaveCount(2)

      // Switch to flat: per-entry rows, no group header, model filter
      // enabled again.
      await page.getByRole('switch', { name: 'Agrupar por sesión' }).click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)
      await expect(groupHeaders).toHaveCount(0)
      await expect(page.locator('table tbody tr')).toHaveCount(2)
      await expect(page.getByPlaceholder('Modelo')).toBeEnabled()
    }
    finally {
      await deleteEntries(request, token, ids)
    }
  })
})
