import type { APIRequestContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { apiLogin, assertPbWritesAllowed, findClients, login, pbUrl } from './helpers'

/**
 * End-to-end coverage for three related features added together:
 *  (i)   the entries table's per-row session marker, the session filter
 *        chip it drives, and the "Group by session" toggle
 *        (app/pages/entries/index.vue, app/components/entries/SessionMarker.vue,
 *        app/lib/entries-session-group.ts);
 *  (ii)  the task detail sheet's per-session "show all entries" disclosure,
 *        including entries of that session belonging to another task or
 *        to no task at all (app/components/tasks/TaskDetailSheet.vue,
 *        app/lib/session-entries.ts);
 *  (iii) the `thinking_level` reasoning-effort label in the entry detail
 *        sheet (app/lib/thinking-level.ts).
 *
 * Every fixture is a disposable row/task created directly via the API,
 * never the random seed data, cleaned up in `finally` regardless of
 * outcome — same convention as e2e/entry-detail.spec.ts and
 * e2e/sessions-queue.spec.ts.
 */

interface EntryOverrides {
  task?: string
  sessionId: string
  sessionName: string
  model?: string
  thinkingLevel?: string
  startedAtOffsetMs?: number
  costQuality?: 'measured' | 'estimated' | 'unknown'
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
      task: overrides.task ?? '',
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
      cost_quality: overrides.costQuality ?? 'measured',
      segments: {},
      subagent_count: 0,
      runs: 1,
      turns: 1,
      status: 'completed',
      session_id: overrides.sessionId,
      session_name: overrides.sessionName,
      machine: runBase,
      model: overrides.model ?? 'e2e-model',
      thinking_level: overrides.thinkingLevel ?? '',
      prompt: `${runBase} prompt`,
      legacy_client_label: '',
      repo_project: '/home/dev/repos/e2e-session-features-fixture',
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

async function createTask(request: APIRequestContext, token: string, projectId: string, title: string) {
  assertPbWritesAllowed()
  const res = await request.post(pbUrl('/api/collections/tasks/records'), {
    headers: { Authorization: token },
    data: { title, project: projectId, status: 'open', external_ref: '', description: '' },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return res.json() as Promise<{ id: string, title: string }>
}

async function deleteTask(request: APIRequestContext, token: string, id: string) {
  assertPbWritesAllowed()
  await request.delete(pbUrl(`/api/collections/tasks/records/${id}`), { headers: { Authorization: token } })
}

test.describe('entries: session marker, filter chip, group by session', () => {
  test('marker is visible, clicking it filters to the session and shows a chip, and grouping produces header rows that survive reload', async ({ page, request }) => {
    test.setTimeout(90_000)
    const token = await apiLogin(request)
    const { target } = await findClients(request, token)
    const projectsRes = await request.get(pbUrl(`/api/collections/projects/records?perPage=1&filter=${encodeURIComponent(`client = "${target.id}"`)}`), {
      headers: { Authorization: token },
    })
    const project = (await projectsRes.json()).items[0]

    const runBase = `e2e-marker-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const uniqueModel = `${runBase}-model`
    const sessionOneId = `${runBase}-session-one`
    const sessionOneName = `E2E Marker Session One ${runBase}`
    const sessionTwoId = `${runBase}-session-two`
    const sessionTwoName = `E2E Marker Session Two ${runBase}`

    const ids: string[] = []
    try {
      ids.push(await createEntry(request, token, target.id, project.id, runBase, {
        sessionId: sessionOneId, sessionName: sessionOneName, model: uniqueModel, startedAtOffsetMs: -60_000,
      }))
      ids.push(await createEntry(request, token, target.id, project.id, runBase, {
        sessionId: sessionOneId, sessionName: sessionOneName, model: uniqueModel, startedAtOffsetMs: -30_000,
      }))
      ids.push(await createEntry(request, token, target.id, project.id, runBase, {
        sessionId: sessionTwoId, sessionName: sessionTwoName, model: uniqueModel, startedAtOffsetMs: 0,
      }))

      await login(page)
      await page.goto('/entries')
      await page.waitForLoadState('networkidle')
      await page.getByPlaceholder('Modelo').fill(uniqueModel)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)

      const rows = page.locator('table tbody tr')
      await expect(rows).toHaveCount(3)

      // Marker: visible, labelled with the session name, exposes the full
      // session id via its accessible name.
      const markerOne = page.getByRole('button', { name: new RegExp(sessionOneName) }).first()
      await expect(markerOne).toBeVisible()
      await expect(markerOne).toHaveAccessibleName(new RegExp(sessionOneId))

      // Click it: filters the list down to that session and shows a
      // removable chip.
      await markerOne.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)
      await expect(rows).toHaveCount(2)
      const chip = page.getByText(`Sesión: ${sessionOneName}`)
      await expect(chip).toBeVisible()

      // Remove the chip: back to all 3 (model filter still applied).
      await page.getByRole('button', { name: 'Quitar filtro de sesión' }).click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)
      await expect(rows).toHaveCount(3)
      await expect(chip).toHaveCount(0)

      // Group by session: two header rows (2 groups), one showing "2"
      // entries and one showing "1".
      await page.getByRole('switch', { name: 'Agrupar por sesión' }).click()
      await page.waitForTimeout(300)
      const groupHeaders = page.locator('th[scope="colgroup"]')
      await expect(groupHeaders).toHaveCount(2)
      await expect(page.getByText('2 entradas')).toBeVisible()
      await expect(page.getByText('1 entradas')).toBeVisible()

      // Survives reload: the toggle choice is persisted (localStorage),
      // so re-applying the same model filter after a full reload shows
      // grouped header rows again without re-clicking the toggle.
      await page.reload()
      await page.waitForLoadState('networkidle')
      await page.getByPlaceholder('Modelo').fill(uniqueModel)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)
      await expect(page.getByRole('switch', { name: 'Agrupar por sesión' })).toHaveAttribute('data-state', 'checked')
      await expect(page.locator('th[scope="colgroup"]')).toHaveCount(2)
    }
    finally {
      await deleteEntries(request, token, ids)
    }
  })
})

test.describe('task detail sheet: expand a session to see all its entries', () => {
  test('lists every entry of the session, newest first, with a "no task"/"other task" badge when applicable', async ({ page, request }) => {
    test.setTimeout(90_000)
    const token = await apiLogin(request)
    const { target } = await findClients(request, token)
    const projectsRes = await request.get(pbUrl(`/api/collections/projects/records?perPage=1&filter=${encodeURIComponent(`client = "${target.id}"`)}`), {
      headers: { Authorization: token },
    })
    const project = (await projectsRes.json()).items[0]

    const runBase = `e2e-sessentries-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const sessionId = `${runBase}-session`
    const sessionName = `E2E Session Entries ${runBase}`

    const taskA = await createTask(request, token, project.id, `E2E Session Entries Task A ${runBase}`)
    const taskB = await createTask(request, token, project.id, `E2E Session Entries Task B ${runBase}`)
    const entryIds: string[] = []

    try {
      // Created FIRST on purpose: the hub's task-inheritance hook gives a
      // new task-less entry the task its session is already attached to, so
      // a genuinely unassigned row of this session has to exist before any
      // assigned one does. `startedAtOffsetMs` alone decides display order.
      entryIds.push(await createEntry(request, token, target.id, project.id, runBase, {
        sessionId, sessionName, task: '', startedAtOffsetMs: -30_000,
      }))
      entryIds.push(await createEntry(request, token, target.id, project.id, runBase, {
        sessionId, sessionName, task: taskA.id, startedAtOffsetMs: -60_000,
      }))
      entryIds.push(await createEntry(request, token, target.id, project.id, runBase, {
        sessionId, sessionName, task: taskB.id, startedAtOffsetMs: 0,
      }))

      await login(page)
      await page.goto('/tasks')
      await page.waitForLoadState('networkidle')

      // The `task-auto-doing` PocketBase hook promotes a task to "doing"
      // as soon as a task_entries row references it — our fixture entries
      // do exactly that, so taskA is found under "En curso", not "Abierta".
      const card = page.locator('[role="button"]', { hasText: taskA.title })
      await expect(card).toBeVisible()
      await card.click()

      const sheet = page.getByRole('dialog')
      await expect(sheet).toBeVisible()

      const sessionLi = sheet.locator('li', { hasText: sessionName }).first()
      await expect(sessionLi).toBeVisible()

      const toggle = sessionLi.getByRole('button', { name: 'Entradas de la sesión' })
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')

      const entryRows = sessionLi.locator('[data-testid="session-entry-row"]')
      await expect(entryRows).toHaveCount(3, { timeout: 10_000 })

      await expect(sessionLi.getByText('Sin tarea')).toBeVisible()
      await expect(sessionLi.getByText(`Otra tarea: ${taskB.title}`)).toBeVisible()
    }
    finally {
      await deleteEntries(request, token, entryIds)
      await deleteTask(request, token, taskA.id)
      await deleteTask(request, token, taskB.id)
    }
  })
})

test.describe('entry detail: reasoning effort (thinking_level)', () => {
  async function openFixture(page: Page, runId: string) {
    await page.goto('/entries')
    await page.waitForLoadState('networkidle')
    await page.getByPlaceholder('Máquina').fill(runId)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(300)
    const rows = page.locator('table tbody tr')
    await expect(rows).toHaveCount(1)
    // Click the "Started" cell, not the row's bounding-box center — see
    // the identical comment in e2e/entry-detail.spec.ts's `openFixture`:
    // the row also contains the session marker button, which `@click.stop`s.
    await rows.first().locator('td').first().click()
    await page.waitForTimeout(300)
  }

  test('shows the translated effort label when thinking_level is set, and nothing when it is not', async ({ page, request }) => {
    test.setTimeout(60_000)
    const token = await apiLogin(request)
    const { target } = await findClients(request, token)
    const projectsRes = await request.get(pbUrl(`/api/collections/projects/records?perPage=1&filter=${encodeURIComponent(`client = "${target.id}"`)}`), {
      headers: { Authorization: token },
    })
    const project = (await projectsRes.json()).items[0]

    const runBase = `e2e-effort-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const withEffortRun = `${runBase}-with`
    const withoutEffortRun = `${runBase}-without`
    const ids: string[] = []

    try {
      ids.push(await createEntry(request, token, target.id, project.id, withEffortRun, {
        sessionId: `${runBase}-s1`, sessionName: 'E2E Effort With', model: 'gpt-6', thinkingLevel: 'high',
      }))
      ids.push(await createEntry(request, token, target.id, project.id, withoutEffortRun, {
        sessionId: `${runBase}-s2`, sessionName: 'E2E Effort Without', model: 'gpt-6', thinkingLevel: '',
      }))

      await login(page)

      await openFixture(page, withEffortRun)
      const sheetWith = page.locator('[data-slot="sheet-content"]')
      await expect(sheetWith.getByText('Esfuerzo: alto')).toBeVisible()
      await page.keyboard.press('Escape')

      await openFixture(page, withoutEffortRun)
      const sheetWithout = page.locator('[data-slot="sheet-content"]')
      await expect(sheetWithout.getByText(/Esfuerzo/)).toHaveCount(0)
    }
    finally {
      await deleteEntries(request, token, ids)
    }
  })
})
