import type { APIRequestContext } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { apiLogin, assertPbWritesAllowed, findClients, login, pbUrl } from './helpers'

/**
 * End-to-end coverage for the Engram session narrative feature
 * (odd/tasks/engram-narrative.md): when the hub operator configures an
 * Engram daemon, each session's title becomes its Engram Goal (or first
 * prompt) instead of the plain marker label, and an expanded session row
 * shows the summary/prompt text. Without Engram configured, every screen
 * must render byte-for-byte as before this feature.
 *
 * ---------------------------------------------------------------------
 * HOW THE PARENT RUNS THIS SPEC
 * ---------------------------------------------------------------------
 *
 * Test 1 ("without Engram") runs against the ordinary isolated e2e
 * stack, same as every other spec in this directory — it assumes
 * `KANKAKU_ENGRAM_URL` is UNSET on that PocketBase process (the normal
 * case unless the operator explicitly configured it).
 *
 * Test 2 ("with Engram") is gated behind `E2E_ENGRAM=1` and requires TWO
 * extra things running before `pnpm test:e2e` starts:
 *
 *   1. The fake Engram daemon, with exactly these two session ids so its
 *      canned responses line up with what this spec creates below:
 *
 *        FAKE_ENGRAM_SESSIONS=e2e-engram-summary-session,e2e-engram-prompt-session \
 *          node e2e/fixtures/fake-engram.mjs
 *
 *      (Listens on 127.0.0.1:7438 by default — override with
 *      FAKE_ENGRAM_PORT if 7438 is taken.)
 *
 *   2. PocketBase itself started with `KANKAKU_ENGRAM_URL=http://127.0.0.1:7438`
 *      (and optionally `KANKAKU_ENGRAM_TIMEOUT_SECONDS`) pointed at the
 *      fake daemon above — on the ISOLATED stack only (PB 8092 / Nuxt
 *      3002 per this repo's e2e convention), never the owner's live
 *      :8090/:3000.
 *
 *   Full example:
 *
 *     FAKE_ENGRAM_SESSIONS=e2e-engram-summary-session,e2e-engram-prompt-session \
 *       node e2e/fixtures/fake-engram.mjs &
 *     KANKAKU_ENGRAM_URL=http://127.0.0.1:7438 <start the isolated PocketBase> &
 *     E2E_ENGRAM=1 E2E_ALLOW_PB_WRITES=1 PW_BASE_URL=http://localhost:3002 \
 *       NUXT_PUBLIC_PB_URL=http://127.0.0.1:8092 pnpm test:e2e engram-narrative
 */

const ENGRAM_SUMMARY_SESSION_ID = 'e2e-engram-summary-session'
const ENGRAM_PROMPT_SESSION_ID = 'e2e-engram-prompt-session'

interface EntryOverrides {
  sessionId: string
  sessionName: string
  machine: string
  task?: string
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
  const startedAtDate = new Date()
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
      work_ms: 270_000,
      input: 50,
      output: 100,
      cache_read: 0,
      cache_write: 0,
      cost: 0.02,
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
      repo_project: '/home/dev/repos/e2e-engram-narrative-fixture',
      schema: 1,
      agent: 'pi',
    },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const created = await res.json()
  return created.id as string
}

async function deleteEntries(request: APIRequestContext, token: string, ids: string[]) {
  if (ids.length === 0) return
  assertPbWritesAllowed()
  for (const id of ids) {
    await request.delete(pbUrl(`/api/collections/task_entries/records/${id}`), { headers: { Authorization: token } })
  }
}

test.describe('engram narrative: without Engram configured', () => {
  test.skip(process.env.E2E_ENGRAM === '1', 'this test needs a PocketBase WITHOUT KANKAKU_ENGRAM_URL; the E2E_ENGRAM=1 stack has it set')

  test('grouped entries rows and the sessions-without-task queue are unchanged; Settings shows not-configured', async ({ page, request, context }) => {
    test.setTimeout(60_000)
    const token = await apiLogin(request)
    const { target } = await findClients(request, token)
    const projectsRes = await request.get(pbUrl(`/api/collections/projects/records?perPage=1&filter=${encodeURIComponent(`client = "${target.id}"`)}`), {
      headers: { Authorization: token },
    })
    const project = (await projectsRes.json()).items[0]

    const runBase = `e2e-engram-none-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const sessionId = `${runBase}-session`
    const sessionName = `E2E No-Engram Session ${runBase}`

    const ids: string[] = []
    try {
      ids.push(await createEntry(request, token, target.id, project.id, runBase, { sessionId, sessionName, machine: runBase }))

      await context.clearCookies()
      await login(page)

      // Settings: the "Engram" card shows the not-configured state.
      await page.goto('/settings')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText('Engram no está configurado para este hub.')).toBeVisible()

      // Entries, grouped by session (the default): the session row shows
      // no original-label second line and no narrative block — exactly
      // like entries-grouped.spec.ts's baseline.
      await page.goto('/entries')
      await page.waitForLoadState('networkidle')
      await page.getByPlaceholder('Máquina').fill(runBase)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)

      const sessionRow = page.locator('[data-testid="session-group-row"]').first()
      await expect(sessionRow).toBeVisible()
      await expect(sessionRow.getByText(sessionName, { exact: false })).toBeVisible()
      await expect(page.locator('[data-testid="session-original-label"]')).toHaveCount(0)

      const toggle = sessionRow.getByRole('button', { name: 'Entradas de la sesión' })
      await toggle.click()
      await expect(page.locator('[data-testid="session-group-entries"]')).toBeVisible()
      await expect(page.locator('[data-testid="session-narrative"]')).toHaveCount(0)

      // Sessions-without-task queue: title cell is the plain session
      // name, no original-label second line either.
      await page.goto('/sessions-without-task')
      await page.waitForLoadState('networkidle')
      const queueRow = page.locator('table tbody tr', { hasText: sessionName })
      await expect(queueRow).toBeVisible()
      await expect(page.locator('[data-testid="session-original-label"]')).toHaveCount(0)
    }
    finally {
      await deleteEntries(request, token, ids)
    }
  })
})

test.describe('engram narrative: with Engram configured', () => {
  test.skip(process.env.E2E_ENGRAM !== '1', 'requires E2E_ENGRAM=1, the fake Engram daemon and KANKAKU_ENGRAM_URL on the isolated stack — see this file\'s header comment')

  test('summary and prompt-only sessions show their Engram narrative on entries and the queue', async ({ page, request, context }) => {
    test.setTimeout(60_000)
    const token = await apiLogin(request)
    const { target } = await findClients(request, token)
    const projectsRes = await request.get(pbUrl(`/api/collections/projects/records?perPage=1&filter=${encodeURIComponent(`client = "${target.id}"`)}`), {
      headers: { Authorization: token },
    })
    const project = (await projectsRes.json()).items[0]

    const runBase = `e2e-engram-with-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const summarySessionName = `E2E Engram Summary ${runBase}`
    const promptSessionName = `E2E Engram Prompt ${runBase}`

    const ids: string[] = []
    try {
      ids.push(await createEntry(request, token, target.id, project.id, runBase, {
        sessionId: ENGRAM_SUMMARY_SESSION_ID, sessionName: summarySessionName, machine: runBase,
      }))
      ids.push(await createEntry(request, token, target.id, project.id, runBase, {
        sessionId: ENGRAM_PROMPT_SESSION_ID, sessionName: promptSessionName, machine: runBase,
      }))

      await context.clearCookies()
      await login(page)

      // Settings: reachable, since the fake daemon answers /health.
      await page.goto('/settings')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText('Conectado')).toBeVisible()

      // Entries, grouped by session, scoped to this fixture run.
      await page.goto('/entries')
      await page.waitForLoadState('networkidle')
      await page.getByPlaceholder('Máquina').fill(runBase)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      const summaryRow = page.locator('[data-testid="session-group-row"]', { hasText: `E2E goal for ${ENGRAM_SUMMARY_SESSION_ID}` })
      await expect(summaryRow).toBeVisible({ timeout: 10_000 })
      // The title cell shows the Engram goal as the title, and today's
      // marker label (the session name) as the muted original-label line.
      await expect(summaryRow.locator('[data-testid="session-original-label"]')).toContainText(summarySessionName)

      await summaryRow.getByRole('button', { name: 'Entradas de la sesión' }).click()
      const narrativeBlock = page.locator('[data-testid="session-narrative"]').first()
      await expect(narrativeBlock).toBeVisible()
      await expect(narrativeBlock.getByText(/did things/)).toBeVisible()

      const promptRow = page.locator('[data-testid="session-group-row"]', { hasText: `E2E first prompt for ${ENGRAM_PROMPT_SESSION_ID}` })
      await expect(promptRow).toBeVisible({ timeout: 10_000 })
      await expect(promptRow.locator('[data-testid="session-original-label"]')).toContainText(promptSessionName)

      // Sessions-without-task queue: the summary session's title cell is
      // its Engram goal too.
      await page.goto('/sessions-without-task')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(`E2E goal for ${ENGRAM_SUMMARY_SESSION_ID}`)).toBeVisible({ timeout: 10_000 })
    }
    finally {
      await deleteEntries(request, token, ids)
    }
  })
})
