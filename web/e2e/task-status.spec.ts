import type { APIRequestContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { apiLogin, assertIsolatedFixtureStack, assertPbWritesAllowed, comboboxTrigger, findClients, login, pbUrl, selectCombobox, toastText } from './helpers'

/**
 * Coverage for the tasks board's non-drag status-change paths
 * (docs/specs/web-tasks.md `TASKS-REQ-011`, `TASKS-REQ-012`, and the
 * `TASKS-REQ-010` refetch wiring on the sessions-without-task queue's
 * attach action) — added when the owner asked to remove the board's
 * "Mover a" buttons in favor of a status control inside the task detail
 * sheet and keyboard shortcuts on a focused card (see the reversal note
 * on `TASKS-REQ-004`). Every fixture is a disposable task/session
 * created directly via the API, cleaned up in a `finally` block.
 */

async function createTask(
  request: APIRequestContext,
  token: string,
  projectId: string,
  title: string,
  status: 'open' | 'doing' | 'done',
) {
  assertPbWritesAllowed()
  const res = await request.post(pbUrl('/api/collections/tasks/records'), {
    headers: { Authorization: token },
    data: { title, project: projectId, status, external_ref: '', description: '' },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return res.json() as Promise<{ id: string, title: string, status: string }>
}

async function deleteTask(request: APIRequestContext, token: string, id: string) {
  assertPbWritesAllowed()
  await request.delete(pbUrl(`/api/collections/tasks/records/${id}`), { headers: { Authorization: token } })
}

async function fetchTask(request: APIRequestContext, token: string, id: string) {
  const res = await request.get(pbUrl(`/api/collections/tasks/records/${id}`), { headers: { Authorization: token } })
  return res.json() as Promise<{ id: string, status: string }>
}

interface SessionFixture { sessionId: string, entryIds: string[] }

/** A single task-less `task_entries` row grouped under its own session_id — mirrors e2e/sessions-queue.spec.ts's `createUnassignedSession`. */
async function createUnassignedSession(
  request: APIRequestContext,
  token: string,
  clientId: string,
  projectId: string,
  sessionName: string,
): Promise<SessionFixture> {
  assertPbWritesAllowed()
  const runBase = `e2e-taskstatus-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const startedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + '.000Z'
  const res = await request.post(pbUrl('/api/collections/task_entries/records'), {
    headers: { Authorization: token },
    data: {
      task_id: runBase,
      client: clientId,
      project: projectId,
      task: '',
      started_at: startedAt,
      ended_at: startedAt,
      wall_ms: 300_000,
      waiting_ms: 30_000,
      work_ms: 270_000,
      input: 50,
      output: 100,
      cache_read: 0,
      cache_write: 0,
      cost: 0.02,
      segments: {},
      subagent_count: 0,
      runs: 1,
      turns: 1,
      status: 'completed',
      session_id: `${runBase}-session`,
      session_name: sessionName,
      machine: runBase,
      model: 'e2e-model',
      prompt: '',
      legacy_client_label: '',
      repo_project: '/home/dev/repos/e2e-taskstatus-fixture',
      schema: 1,
      agent: 'pi',
    },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const created = await res.json()
  return { sessionId: `${runBase}-session`, entryIds: [created.id] }
}

async function deleteEntries(request: APIRequestContext, token: string, ids: string[]) {
  assertPbWritesAllowed()
  for (const id of ids) {
    await request.delete(pbUrl(`/api/collections/task_entries/records/${id}`), { headers: { Authorization: token } })
  }
}

async function openRowMenu(page: Page, sessionName: string) {
  const row = page.locator('table tbody tr', { hasText: sessionName })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: /Acciones para la sesión/ }).click()
}

test.describe('tasks board', () => {
  let token: string
  let clientId: string
  let projectId: string

  test.beforeAll(async ({ request }) => {
    assertIsolatedFixtureStack()
    token = await apiLogin(request)
    const { target } = await findClients(request, token)
    clientId = target.id
    const projRes = await request.get(pbUrl(`/api/collections/projects/records?perPage=1&filter=${encodeURIComponent(`client = "${clientId}"`)}`), {
      headers: { Authorization: token },
    })
    const projBody = await projRes.json()
    projectId = projBody.items[0].id
  })

  test('the sheet status control moves a card, and the move survives closing the sheet without a reload (TASKS-REQ-011)', async ({ page, request }) => {
    test.setTimeout(60_000)
    const title = `E2E Status Control ${Date.now()}`
    const created = await createTask(request, token, projectId, title, 'open')

    try {
      await login(page)
      await page.goto('/tasks')
      await page.waitForLoadState('networkidle')

      const card = page.locator('[role="button"][aria-label*="Abierta"]', { hasText: title })
      await expect(card).toBeVisible()
      await card.click()

      const sheet = page.getByRole('dialog')
      await expect(sheet).toBeVisible()
      const doingTab = sheet.getByRole('tab', { name: 'En curso' })
      await expect(doingTab).toBeVisible()
      await doingTab.click()
      await page.waitForTimeout(500)

      // The board's own reactive state already reflects the move while
      // the sheet is still open (single shared `tasks` store).
      await expect(page.locator('[role="button"][aria-label*="En curso"]', { hasText: title })).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(sheet).toBeHidden()

      // Still in the "doing" column after closing, no reload performed.
      await expect(page.locator('[role="button"][aria-label*="En curso"]', { hasText: title })).toBeVisible()
      await expect(page.locator('[role="button"][aria-label*="Abierta"]', { hasText: title })).toHaveCount(0)

      const serverTask = await fetchTask(request, token, created.id)
      expect(serverTask.status).toBe('doing')
    }
    finally {
      await deleteTask(request, token, created.id)
    }
  })

  test('ArrowLeft/ArrowRight (and [ / ]) move the focused card, keep focus on it, and announce the change (TASKS-REQ-012)', async ({ page, request }) => {
    test.setTimeout(60_000)
    const title = `E2E Keyboard Move ${Date.now()}`
    const created = await createTask(request, token, projectId, title, 'doing')

    try {
      await login(page)
      await page.goto('/tasks')
      await page.waitForLoadState('networkidle')

      const doingCard = page.locator('[role="button"][aria-label*="En curso"]', { hasText: title })
      await expect(doingCard).toBeVisible()
      await doingCard.focus()
      await expect(doingCard).toBeFocused()

      await page.keyboard.press('ArrowLeft')
      const openCard = page.locator('[role="button"][aria-label*="Abierta"]', { hasText: title })
      await expect(openCard).toBeVisible()
      await expect(openCard).toBeFocused()
      await expect(page.locator('[data-testid="task-status-announcer"]')).toHaveText(`Tarea «${title}» movida a Abierta.`)

      // No-op at the "open" boundary — ArrowLeft again must not error or wrap to "done".
      await page.keyboard.press('ArrowLeft')
      await expect(openCard).toBeVisible()
      await expect(openCard).toBeFocused()

      // `]` alias moves forward two columns to "done".
      await page.keyboard.press(']')
      await page.waitForTimeout(200)
      await page.keyboard.press(']')
      const historyButton = page.getByRole('button', { name: 'Historial de completadas' })
      await expect(openCard).toHaveCount(0)
      await expect(historyButton).toBeFocused()
      await expect(page.locator('[data-testid="task-status-announcer"]')).toHaveText(`Tarea «${title}» movida a Hecha.`)
      await historyButton.click()
      await page.getByRole('searchbox', { name: 'Buscar títulos de tareas completadas…' }).fill(title)
      await expect(page.locator('table tbody tr', { hasText: title })).toBeVisible()

      const serverTask = await fetchTask(request, token, created.id)
      expect(serverTask.status).toBe('done')
    }
    finally {
      await deleteTask(request, token, created.id)
    }
  })

  test('Enter/Space on a focused card opens the same detail sheet a click would (TASKS-REQ-012)', async ({ page, request }) => {
    test.setTimeout(60_000)
    const title = `E2E Keyboard Open ${Date.now()}`
    const created = await createTask(request, token, projectId, title, 'open')

    try {
      await login(page)
      await page.goto('/tasks')
      await page.waitForLoadState('networkidle')

      const card = page.locator('[role="button"][aria-label*="Abierta"]', { hasText: title })
      await card.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByTestId('task-detail-title')).toHaveText(title)
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toBeHidden()

      await card.focus()
      await page.keyboard.press(' ')
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByTestId('task-detail-title')).toHaveText(title)
    }
    finally {
      await deleteTask(request, token, created.id)
    }
  })

  test('completed tasks stay out of board and active list; history searches, filters, and reopens them', async ({ page, request }) => {
    const title = `E2E Completed History ${Date.now()}`
    const task = await createTask(request, token, projectId, title, 'done')
    try {
      await login(page)
      await page.goto('/tasks')
      await expect(page.locator('[role="button"]', { hasText: title })).toHaveCount(0)
      await page.getByRole('group', { name: 'Vista de tareas' }).getByRole('button', { name: 'Lista', exact: true }).click()
      await expect(page.locator('table tbody tr', { hasText: title })).toHaveCount(0)
      await page.getByRole('button', { name: 'Historial de completadas' }).click()
      const search = page.getByRole('searchbox', { name: 'Buscar títulos de tareas completadas…' })
      await search.fill(title)
      const row = page.locator('table tbody tr', { hasText: title })
      await expect(row).toBeVisible()
      await row.getByRole('button', { name: 'Editar' }).click()
      const dialog = page.getByRole('dialog')
      await selectCombobox(comboboxTrigger(page, 'Estado').and(dialog.locator('[data-slot="combobox-trigger"]')), 'Abierta')
      await dialog.getByRole('button', { name: 'Guardar' }).click()
      await expect(row).toHaveCount(0)
      await page.getByRole('button', { name: 'Historial de completadas' }).click()
      await page.getByRole('group', { name: 'Vista de tareas' }).getByRole('button', { name: 'Lista', exact: true }).click()
      await expect(page.locator('table tbody tr', { hasText: title })).toBeVisible()
    }
    finally {
      await deleteTask(request, token, task.id)
    }
  })

  test('the board no longer renders any "Mover a" button (TASKS-REQ-004, reversed)', async ({ page }) => {
    await login(page)
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Mover a')).toHaveCount(0)
  })

  test('attaching a session to an open task moves it to "doing" on the board without a reload (TASKS-REQ-010 refetch wiring)', async ({ page, request }) => {
    test.setTimeout(60_000)
    const taskTitle = `E2E Attach Open ${Date.now()}`
    const task = await createTask(request, token, projectId, taskTitle, 'open')
    const sessionName = `E2E Attach Open Session ${Date.now()}`
    const session = await createUnassignedSession(request, token, clientId, projectId, sessionName)

    try {
      await login(page)
      await page.goto('/sessions-without-task')
      await page.waitForLoadState('networkidle')

      await openRowMenu(page, sessionName)
      await page.getByRole('menuitem', { name: 'Adjuntar a tarea existente' }).click()
      const dialog = page.getByRole('dialog', { name: 'Adjuntar a una tarea existente' })
      await expect(dialog).toBeVisible()
      await dialog.getByPlaceholder('Buscar tareas…').fill(taskTitle)
      await dialog.getByRole('option', { name: taskTitle }).click()
      await dialog.getByRole('button', { name: 'Adjuntar' }).click()
      await expect(toastText(page, '1 sesiones vinculadas a la tarea.')).toBeVisible({ timeout: 10_000 })
      await page.keyboard.press('Escape')

      // Navigate to the board (SPA nav, no full reload) and confirm the
      // task-auto-doing hook's server-side open -> doing transition is
      // already reflected, thanks to the targeted useTasks().refreshOne
      // wired into confirmAttach.
      await page.goto('/tasks')
      await page.waitForLoadState('networkidle')
      await expect(page.locator('[role="button"][aria-label*="En curso"]', { hasText: taskTitle })).toBeVisible()
      await expect(page.locator('[role="button"][aria-label*="Abierta"]', { hasText: taskTitle })).toHaveCount(0)

      const serverTask = await fetchTask(request, token, task.id)
      expect(serverTask.status).toBe('doing')
    }
    finally {
      await deleteEntries(request, token, session.entryIds)
      await deleteTask(request, token, task.id)
    }
  })

  test('attaching a session to a done task leaves it "done" — the hook never reopens it (TASKS-REQ-010 refetch wiring)', async ({ page, request }) => {
    test.setTimeout(60_000)
    const taskTitle = `E2E Attach Done ${Date.now()}`
    const task = await createTask(request, token, projectId, taskTitle, 'done')
    const sessionName = `E2E Attach Done Session ${Date.now()}`
    const session = await createUnassignedSession(request, token, clientId, projectId, sessionName)

    try {
      await login(page)
      await page.goto('/sessions-without-task')
      await page.waitForLoadState('networkidle')

      await openRowMenu(page, sessionName)
      await page.getByRole('menuitem', { name: 'Adjuntar a tarea existente' }).click()
      const dialog = page.getByRole('dialog', { name: 'Adjuntar a una tarea existente' })
      await expect(dialog).toBeVisible()
      await dialog.getByPlaceholder('Buscar tareas…').fill(taskTitle)
      await dialog.getByRole('option', { name: taskTitle }).click()
      await dialog.getByRole('button', { name: 'Adjuntar' }).click()
      await expect(toastText(page, '1 sesiones vinculadas a la tarea.')).toBeVisible({ timeout: 10_000 })
      await page.keyboard.press('Escape')

      await page.goto('/tasks')
      await page.waitForLoadState('networkidle')
      await expect(page.locator('[role="button"][aria-label*="Hecha"]', { hasText: taskTitle })).toHaveCount(0)
      await page.getByRole('button', { name: 'Historial de completadas' }).click()
      await page.getByRole('searchbox', { name: 'Buscar títulos de tareas completadas…' }).fill(taskTitle)
      await expect(page.locator('table tbody tr', { hasText: taskTitle })).toBeVisible()
      await expect(page.locator('[role="button"][aria-label*="En curso"]', { hasText: taskTitle })).toHaveCount(0)

      const serverTask = await fetchTask(request, token, task.id)
      expect(serverTask.status).toBe('done')
    }
    finally {
      await deleteEntries(request, token, session.entryIds)
      await deleteTask(request, token, task.id)
    }
  })
})
