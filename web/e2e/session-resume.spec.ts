import type { APIRequestContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { apiLogin, assertPbWritesAllowed, findClients, login, pbUrl, setTheme, useFlatEntriesView } from './helpers'
import path from 'node:path'

/**
 * End-to-end coverage for "resume session" (ADR 0024 / session-resume.ts,
 * session-aggregate.ts): the resume command block + copy button on the
 * entry detail sheet (EntryDetailSheet.vue), and the sessions list on the
 * task detail page (TaskDetailSheet.vue in page mode). Every fixture below is a
 * disposable row created directly via the API (agent: "pi", so
 * `buildResumeCommand` always resolves — see app/lib/session-resume.ts,
 * only the "pi" agent has a resume builder today), never the random seed
 * data, so assertions target deterministic content. Cleaned up in
 * `finally` regardless of outcome.
 */

// Screenshots for the orchestrator's review go under the scratchpad, never
// docs/screenshots/ (out of scope for this spec-only worker — see the
// task brief) — path fixed to this session's scratchpad directory.
const SCREENSHOTS_DIR = '/private/tmp/claude-502/-Users-baldboy-desarrollo-soyun-ninja-kankaku/97eb1bab-1ecd-4eb2-b278-134a50b1e0ca/scratchpad/screenshots'

async function shootTo(page: Page, name: string) {
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`) })
}

interface EntryFixture {
  entryId: string
  runId: string
  sessionId: string
  sessionName: string
  repoProject: string
}

async function findClientProject(request: APIRequestContext, token: string, clientId: string) {
  const res = await request.get(pbUrl(`/api/collections/projects/records?perPage=1&filter=${encodeURIComponent(`client = "${clientId}"`)}`), {
    headers: { Authorization: token },
  })
  const body = await res.json()
  return body.items[0] as { id: string, name: string }
}

async function createEntry(
  request: APIRequestContext,
  token: string,
  clientId: string,
  projectId: string,
  overrides: { taskId?: string, sessionId?: string, sessionName?: string } = {},
): Promise<EntryFixture> {
  assertPbWritesAllowed()
  const runId = `e2e-resume-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const sessionId = overrides.sessionId ?? `${runId}-session`
  const sessionName = overrides.sessionName ?? `E2E resume session ${runId}`
  const repoProject = '/home/dev/repos/e2e-resume-fixture'
  const startedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + '.000Z'

  const res = await request.post(pbUrl('/api/collections/task_entries/records'), {
    headers: { Authorization: token },
    data: {
      task_id: overrides.taskId ?? runId,
      client: clientId,
      project: projectId,
      task: '',
      started_at: startedAt,
      ended_at: startedAt,
      wall_ms: 600_000,
      waiting_ms: 60_000,
      work_ms: 540_000,
      input: 100,
      output: 200,
      cache_read: 0,
      cache_write: 0,
      cost: 0.05,
      segments: {},
      subagent_count: 0,
      runs: 1,
      turns: 1,
      status: 'completed',
      session_id: sessionId,
      session_name: sessionName,
      // The unique lookup key: filtered by exact match, same idiom as
      // entry-detail.spec.ts's `openFixture` (its `machine` filter),
      // rather than a shared literal that could collide across fixtures.
      machine: runId,
      model: 'e2e-model',
      prompt: 'resume fixture prompt',
      legacy_client_label: '',
      repo_project: repoProject,
      schema: 1,
      agent: 'pi',
    },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const created = await res.json()
  return { entryId: created.id, runId, sessionId, sessionName, repoProject }
}

async function deleteEntry(request: APIRequestContext, token: string, id: string) {
  await request.delete(pbUrl(`/api/collections/task_entries/records/${id}`), { headers: { Authorization: token } })
}

async function openEntryByMachineFilter(page: Page, runId: string) {
  // Clicks the fixture's only row to open the detail sheet — the
  // Entries screen defaults to grouped-by-session since 2026-09-22,
  // which would collapse this single entry into a session header row
  // (clicking it toggles the session instead of opening the sheet).
  await useFlatEntriesView(page)
  await page.goto('/entries')
  await page.waitForLoadState('networkidle')
  await page.getByPlaceholder('Máquina').fill(runId)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
  const rows = page.locator('table tbody tr')
  await expect(rows).toHaveCount(1)
  await rows.first().click()
  await page.waitForTimeout(300)
}

test.describe('resume session block on the entry detail sheet', () => {
  let token: string
  let clientId: string
  let projectId: string
  let fixture: EntryFixture

  test.beforeAll(async ({ request }) => {
    token = await apiLogin(request)
    const { target } = await findClients(request, token)
    clientId = target.id
    const project = await findClientProject(request, token, clientId)
    projectId = project.id
  })

  test.beforeEach(async ({ request }) => {
    fixture = await createEntry(request, token, clientId, projectId)
  })

  test.afterEach(async ({ request }) => {
    await deleteEntry(request, token, fixture.entryId)
  })

  test('renders the resume command and copies it to the clipboard', async ({ page, context, browserName }) => {
    test.setTimeout(60_000)
    test.skip(browserName !== 'chromium', 'clipboard permission grants are chromium-only in Playwright')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    await login(page)
    await openEntryByMachineFilter(page, fixture.runId)

    const sheet = page.locator('[data-slot="sheet-content"]')
    await expect(sheet.getByText('Reanudar sesión')).toBeVisible()
    // The fixture's `session_name` also drives the sheet's title (see
    // `deriveEntryTitle`), so the plain text appears twice on the page —
    // scope the check to the resume section itself, not the whole sheet.
    const session = sheet.locator('section', { has: page.getByText('Reanudar sesión') })
    await expect(session.getByText(fixture.sessionName)).toBeVisible()

    const expectedCommand = `cd '${fixture.repoProject}' && pi --session '${fixture.sessionId}'`
    const pre = sheet.locator('pre', { hasText: 'pi --session' })
    await expect(pre).toHaveText(expectedCommand)

    const copyButton = session.getByRole('button', { name: /Copiar/ })
    await copyButton.click()
    await expect(session.getByText('¡Copiado!')).toBeVisible()

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText).toBe(expectedCommand)
  })

  test('captures docs screenshots (dark, light)', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme)
      await openEntryByMachineFilter(page, fixture.runId)
      await shootTo(page, `entry-detail-resume-${theme}`)
    }
  })
})

test.describe('task detail page lists its sessions', () => {
  let token: string
  let clientId: string
  let projectId: string
  let taskId: string
  let taskTitle: string
  let entryA: EntryFixture
  let entryB: EntryFixture

  test.beforeAll(async ({ request }) => {
    token = await apiLogin(request)
    const { target } = await findClients(request, token)
    clientId = target.id
    const project = await findClientProject(request, token, clientId)
    projectId = project.id

    assertPbWritesAllowed()
    taskTitle = `E2E Resume Task ${Date.now()}`
    const taskRes = await request.post(pbUrl('/api/collections/tasks/records'), {
      headers: { Authorization: token },
      data: { title: taskTitle, project: projectId, status: 'open', external_ref: '', description: '' },
    })
    expect(taskRes.ok(), await taskRes.text()).toBeTruthy()
    const taskBody = await taskRes.json()
    taskId = taskBody.id

    const sharedSessionId = `e2e-task-session-${Date.now()}`
    entryA = await createEntry(request, token, clientId, projectId, { sessionId: sharedSessionId, sessionName: 'E2E shared session' })
    entryB = await createEntry(request, token, clientId, projectId, { sessionId: sharedSessionId, sessionName: 'E2E shared session' })

    assertPbWritesAllowed()
    for (const id of [entryA.entryId, entryB.entryId]) {
      const res = await request.patch(pbUrl(`/api/collections/task_entries/records/${id}`), {
        headers: { Authorization: token },
        data: { task: taskId },
      })
      expect(res.ok(), await res.text()).toBeTruthy()
    }
  })

  test.afterAll(async ({ request }) => {
    assertPbWritesAllowed()
    for (const id of [entryA?.entryId, entryB?.entryId]) {
      if (id) await deleteEntry(request, token, id)
    }
    if (taskId) await request.delete(pbUrl(`/api/collections/tasks/records/${taskId}`), { headers: { Authorization: token } })
  })

  async function openTaskCard(page: Page) {
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')
    const card = page.getByRole('button', { name: new RegExp(taskTitle) })
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.click()
    await expect(page).toHaveURL(`/organizacion/clientes/${clientId}/proyectos/${projectId}/tareas/${taskId}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(taskTitle)
  }

  test('lists the task session with a working resume command', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    await openTaskCard(page)

    const detail = page.locator('main')
    await expect(detail.getByText('Sesiones')).toBeVisible()
    await expect(detail.getByText('E2E shared session')).toBeVisible()
    // Two entries share the same session_id, so the session card shows a
    // single grouped row (entry count = 2), not two separate rows.
    await expect(detail.locator('li', { hasText: 'E2E shared session' })).toHaveCount(1)

    const expectedCommand = `cd '${entryA.repoProject}' && pi --session '${entryA.sessionId}'`
    const pre = detail.locator('pre', { hasText: 'pi --session' })
    await expect(pre).toHaveText(expectedCommand)
  })

  test('captures docs screenshots (dark, light)', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme)
      await openTaskCard(page)
      await shootTo(page, `task-detail-page-${theme}`)
    }
  })
})
