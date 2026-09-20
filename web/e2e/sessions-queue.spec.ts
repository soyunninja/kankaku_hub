import type { APIRequestContext, Page } from '@playwright/test'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { apiLogin, assertPbWritesAllowed, findClients, login, pbUrl, setTheme } from './helpers'

/**
 * End-to-end coverage for the "sessions without a task" queue (ADR 0024,
 * app/pages/sessions-without-task/index.vue): convert a session into a
 * new task, attach a session to an existing task, and ignore a session.
 * Every fixture is a disposable, uniquely-named session created directly
 * via the API — task-less (`task: ""`) entries sharing one `session_id`
 * — never the random seed data, cleaned up in `afterAll` regardless of
 * outcome.
 */

const SCREENSHOTS_DIR = '/private/tmp/claude-502/-Users-baldboy-desarrollo-soyun-ninja-kankaku/97eb1bab-1ecd-4eb2-b278-134a50b1e0ca/scratchpad/screenshots'

async function shootTo(page: Page, name: string) {
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`) })
}

interface SessionFixture {
  sessionId: string
  sessionName: string
  entryIds: string[]
}

async function createUnassignedSession(
  request: APIRequestContext,
  token: string,
  clientId: string,
  projectId: string,
  sessionName: string,
  entryCount = 1,
): Promise<SessionFixture> {
  assertPbWritesAllowed()
  const runBase = `e2e-queue-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const sessionId = `${runBase}-session`
  const entryIds: string[] = []

  for (let i = 0; i < entryCount; i++) {
    const startedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + '.000Z'
    const res = await request.post(pbUrl('/api/collections/task_entries/records'), {
      headers: { Authorization: token },
      data: {
        task_id: `${runBase}-${i}`,
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
        session_id: sessionId,
        session_name: sessionName,
        machine: runBase,
        model: 'e2e-model',
        prompt: '',
        legacy_client_label: '',
        repo_project: '/home/dev/repos/e2e-queue-fixture',
        schema: 1,
        agent: 'pi',
      },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const created = await res.json()
    entryIds.push(created.id)
  }

  return { sessionId, sessionName, entryIds }
}

async function deleteEntries(request: APIRequestContext, token: string, ids: string[]) {
  assertPbWritesAllowed()
  for (const id of ids) {
    await request.delete(pbUrl(`/api/collections/task_entries/records/${id}`), { headers: { Authorization: token } })
  }
}

async function fetchEntry(request: APIRequestContext, token: string, id: string) {
  const res = await request.get(pbUrl(`/api/collections/task_entries/records/${id}`), { headers: { Authorization: token } })
  return res.json()
}

async function findTaskByTitle(request: APIRequestContext, token: string, title: string) {
  const res = await request.get(pbUrl(`/api/collections/tasks/records?perPage=1&sort=-created&filter=${encodeURIComponent(`title = "${title}"`)}`), {
    headers: { Authorization: token },
  })
  const body = await res.json()
  return body.items[0] as { id: string, title: string } | undefined
}

async function openRowMenu(page: Page, sessionName: string) {
  const row = page.locator('table tbody tr', { hasText: sessionName })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: /Acciones para la sesión/ }).click()
}

test.describe('sessions-without-task queue', () => {
  let token: string
  let clientId: string
  let projectId: string

  test.beforeAll(async ({ request }) => {
    token = await apiLogin(request)
    const { target } = await findClients(request, token)
    clientId = target.id
    const projRes = await request.get(pbUrl(`/api/collections/projects/records?perPage=1&filter=${encodeURIComponent(`client = "${clientId}"`)}`), {
      headers: { Authorization: token },
    })
    const projBody = await projRes.json()
    projectId = projBody.items[0].id
  })

  test('converting a session creates a task and reassigns every entry, then it leaves the queue', async ({ page, request }) => {
    test.setTimeout(60_000)
    const sessionName = `E2E Queue Convert ${Date.now()}`
    const session = await createUnassignedSession(request, token, clientId, projectId, sessionName, 2)
    let createdTaskId: string | undefined

    try {
      await login(page)
      await page.goto('/sessions-without-task')
      await page.waitForLoadState('networkidle')

      await openRowMenu(page, sessionName)
      await page.getByRole('menuitem', { name: 'Convertir en tarea' }).click()

      const dialog = page.getByRole('dialog', { name: 'Convertir sesión en tarea' })
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('#sq-title')).toHaveValue(sessionName)

      await dialog.getByRole('button', { name: 'Crear tarea' }).click()
      await expect(page.getByText(`Tarea «${sessionName}» creada a partir de la sesión.`)).toBeVisible({ timeout: 10_000 })

      await expect(page.locator('table tbody tr', { hasText: sessionName })).toHaveCount(0)

      const task = await findTaskByTitle(request, token, sessionName)
      expect(task, 'a task named after the session must have been created').toBeTruthy()
      createdTaskId = task!.id

      for (const id of session.entryIds) {
        const entry = await fetchEntry(request, token, id)
        expect(entry.task).toBe(createdTaskId)
      }
    }
    finally {
      await deleteEntries(request, token, session.entryIds)
      if (createdTaskId) await request.delete(pbUrl(`/api/collections/tasks/records/${createdTaskId}`), { headers: { Authorization: token } })
    }
  })

  test('attaching a session to an existing task reassigns every entry, then it leaves the queue', async ({ page, request }) => {
    test.setTimeout(60_000)
    const existingTaskTitle = `E2E Queue Existing Task ${Date.now()}`
    assertPbWritesAllowed()
    const taskRes = await request.post(pbUrl('/api/collections/tasks/records'), {
      headers: { Authorization: token },
      data: { title: existingTaskTitle, project: projectId, status: 'open', external_ref: '', description: '' },
    })
    expect(taskRes.ok(), await taskRes.text()).toBeTruthy()
    const existingTask = await taskRes.json()

    const sessionName = `E2E Queue Attach ${Date.now()}`
    const session = await createUnassignedSession(request, token, clientId, projectId, sessionName, 1)

    try {
      await login(page)
      await page.goto('/sessions-without-task')
      await page.waitForLoadState('networkidle')

      await openRowMenu(page, sessionName)
      await page.getByRole('menuitem', { name: 'Adjuntar a tarea existente' }).click()

      const dialog = page.getByRole('dialog', { name: 'Adjuntar a una tarea existente' })
      await expect(dialog).toBeVisible()
      await dialog.getByPlaceholder('Buscar tareas…').fill(existingTaskTitle)
      await dialog.getByRole('option', { name: existingTaskTitle }).click()
      await dialog.getByRole('button', { name: 'Adjuntar' }).click()

      await expect(page.getByText('1 sesiones vinculadas a la tarea.')).toBeVisible({ timeout: 10_000 })
      await expect(dialog.getByText('Hecho: 1 vinculadas, 0 fallidas.')).toBeVisible()
      // Leave the result dialog open rather than closing it — the row's
      // removal from the queue table is already optimistic/synchronous
      // (see confirmAttach's `removeSessions(movedIds)`), and the
      // dialog's own "Cerrar" text is ambiguous with the portal's X
      // close button (both share the same accessible name).
      await page.keyboard.press('Escape')

      await expect(page.locator('table tbody tr', { hasText: sessionName })).toHaveCount(0)

      for (const id of session.entryIds) {
        const entry = await fetchEntry(request, token, id)
        expect(entry.task).toBe(existingTask.id)
      }
    }
    finally {
      await deleteEntries(request, token, session.entryIds)
      await request.delete(pbUrl(`/api/collections/tasks/records/${existingTask.id}`), { headers: { Authorization: token } })
    }
  })

  test('ignoring a session removes it from the queue permanently, without creating a task', async ({ page, request }) => {
    test.setTimeout(60_000)
    const sessionName = `E2E Queue Ignore ${Date.now()}`
    const session = await createUnassignedSession(request, token, clientId, projectId, sessionName, 1)

    try {
      await login(page)
      await page.goto('/sessions-without-task')
      await page.waitForLoadState('networkidle')

      await openRowMenu(page, sessionName)
      await page.getByRole('menuitem', { name: 'Ignorar' }).click()

      await expect(page.getByText('¿Ignorar esta sesión?')).toBeVisible()
      await page.getByRole('button', { name: 'Confirmar' }).click()

      await expect(page.getByText('1 sesiones ignoradas.')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('table tbody tr', { hasText: sessionName })).toHaveCount(0)

      // Not just optimistic removal: reload and confirm it stays gone,
      // backed by the `ignored_sessions` collection (D6-adjacent guard —
      // see useSessions.fetchUnassignedSessions's ignored-ids exclusion).
      await page.reload()
      await page.waitForLoadState('networkidle')
      await expect(page.locator('table tbody tr', { hasText: sessionName })).toHaveCount(0)

      const ignoredRes = await request.get(pbUrl(`/api/collections/ignored_sessions/records?filter=${encodeURIComponent(`session_id = "${session.sessionId}"`)}`), {
        headers: { Authorization: token },
      })
      const ignoredBody = await ignoredRes.json()
      expect(ignoredBody.totalItems).toBe(1)

      const task = await findTaskByTitle(request, token, sessionName)
      expect(task, 'ignoring a session must never create a task').toBeFalsy()

      for (const id of session.entryIds) {
        const entry = await fetchEntry(request, token, id)
        expect(entry.task).toBe('')
      }
    }
    finally {
      await deleteEntries(request, token, session.entryIds)
      assertPbWritesAllowed()
      const ignoredRes = await request.get(pbUrl(`/api/collections/ignored_sessions/records?filter=${encodeURIComponent(`session_id = "${session.sessionId}"`)}`), {
        headers: { Authorization: token },
      })
      const ignoredBody = await ignoredRes.json()
      for (const item of ignoredBody.items ?? []) {
        await request.delete(pbUrl(`/api/collections/ignored_sessions/records/${item.id}`), { headers: { Authorization: token } })
      }
    }
  })

  test('captures docs screenshots (dark, light, 390px mobile)', async ({ page, request }) => {
    test.setTimeout(60_000)
    const sessionName = `E2E Queue Screenshot ${Date.now()}`
    const session = await createUnassignedSession(request, token, clientId, projectId, sessionName, 1)

    try {
      await login(page)

      for (const theme of ['dark', 'light'] as const) {
        await setTheme(page, theme)
        await page.goto('/sessions-without-task')
        await page.waitForLoadState('networkidle')
        await expect(page.locator('table tbody tr', { hasText: sessionName })).toBeVisible()
        await shootTo(page, `sessions-queue-${theme}`)
      }

      await page.setViewportSize({ width: 390, height: 844 })
      await setTheme(page, 'dark')
      await page.goto('/sessions-without-task')
      await page.waitForLoadState('networkidle')
      await expect(page.locator('table tbody tr', { hasText: sessionName })).toBeVisible()
      await shootTo(page, 'sessions-queue-mobile-390')
    }
    finally {
      await deleteEntries(request, token, session.entryIds)
    }
  })
})
