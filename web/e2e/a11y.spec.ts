import type { APIRequestContext } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { apiLogin, assertPbWritesAllowed, findClients, login, pbUrl, toastText } from './helpers'

/**
 * MINOR/MAJOR a11y findings from the 2026-09-21 independent review:
 *
 * - Every icon-only interactive element across the app must have an
 *   accessible name (finding 6) — swept here via Playwright's aria
 *   snapshot on every main authenticated screen, rather than hand-listing
 *   the ones already fixed (per-row checkboxes, pagination, the mobile
 *   nav toggle, ...), so a future regression on ANY screen fails this
 *   test, not just the ones named in the finding.
 * - Toasts must be announced to screen readers via an always-mounted
 *   live region, not just a visually-appearing card (finding 5) —
 *   verified with an accessibility-tree assertion after a real bulk
 *   action (bulk-ignore on the sessions-without-task queue).
 */

const ROUTES = [
  '/', '/clients', '/projects', '/tasks', '/unassigned',
  '/sessions-without-task', '/entries', '/commands', '/settings',
]

/**
 * Parses Playwright's YAML-ish `page.ariaSnapshot()` output for bare
 * `button`/`link` nodes with no quoted accessible name — e.g. `- button`
 * or `- button [ref=e12]`, as opposed to a named `- button "Save"`.
 * Returns the offending lines (trimmed) for a readable failure message.
 */
function namelessInteractiveLines(snapshot: string): string[] {
  return snapshot
    .split('\n')
    .filter(line => /^\s*-\s+(button|link)\b/.test(line))
    .filter(line => !/^\s*-\s+(button|link)\s+"/.test(line))
    .map(line => line.trim())
}

test.describe('every interactive element has an accessible name', () => {
  for (const route of ROUTES) {
    test(`no nameless icon-only button/link on ${route}`, async ({ page }) => {
      await login(page)
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)
      const snapshot = await page.ariaSnapshot()
      const offending = namelessInteractiveLines(snapshot)
      expect(offending, `nameless interactive element(s) on ${route}:\n${offending.join('\n')}`).toEqual([])
    })
  }
})

async function createIgnorableSession(request: APIRequestContext, token: string, clientId: string, projectId: string) {
  assertPbWritesAllowed()
  const runId = `e2e-a11y-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const startedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + '.000Z'
  const res = await request.post(pbUrl('/api/collections/task_entries/records'), {
    headers: { Authorization: token },
    data: {
      task_id: runId,
      client: clientId,
      project: projectId,
      task: '',
      started_at: startedAt,
      ended_at: startedAt,
      wall_ms: 60_000,
      waiting_ms: 0,
      work_ms: 60_000,
      cost: 0.01,
      status: 'completed',
      session_id: `${runId}-session`,
      session_name: runId,
      machine: 'e2e-a11y',
      prompt: '',
      legacy_client_label: '',
      repo_project: '',
      schema: 1,
    },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const created = await res.json()
  return { entryId: created.id as string, sessionId: `${runId}-session`, sessionName: runId }
}

test.describe('toast live region', () => {
  test('a bulk action toast is present in the accessibility tree via the polite live region', async ({ page, request }) => {
    test.setTimeout(30_000)
    const token = await apiLogin(request)
    const { target } = await findClients(request, token)
    const projectsRes = await request.get(pbUrl(`/api/collections/projects/records?perPage=1&filter=${encodeURIComponent(`client = "${target.id}"`)}`), {
      headers: { Authorization: token },
    })
    const project = (await projectsRes.json()).items[0]
    const fixture = await createIgnorableSession(request, token, target.id, project.id)

    try {
      await login(page)
      await page.goto('/sessions-without-task')
      await page.waitForLoadState('networkidle')

      const row = page.locator('table tbody tr', { hasText: fixture.sessionName })
      await expect(row).toBeVisible({ timeout: 15_000 })
      await row.getByRole('checkbox').click()
      await page.getByRole('button', { name: 'Ignorar selección' }).click()
      await page.getByRole('button', { name: 'Confirmar' }).click()

      // The toast's text must be reachable through the polite live
      // region (role="status", aria-live="polite") — not just visible in
      // the (aria-hidden-from-nothing, but not the announcement source)
      // toast card. `getByRole('status')` matches the live region
      // specifically since it is the only `role="status"` element.
      await expect(page.getByRole('status')).toContainText('1 sesiones ignoradas.', { timeout: 10_000 })
      // The visible toast card shows the same text too (toastText helper
      // scopes to the card, not the live region).
      await expect(toastText(page, '1 sesiones ignoradas.')).toBeVisible()
    }
    finally {
      await request.delete(pbUrl(`/api/collections/task_entries/records/${fixture.entryId}`), { headers: { Authorization: token } })
      // Bulk-ignore also writes an `ignored_sessions` row — clean it up so
      // this fixture session doesn't stay permanently excluded from the
      // queue for any later run against the same seeded client/project.
      const ignoredRes = await request.get(pbUrl(`/api/collections/ignored_sessions/records?perPage=1&filter=${encodeURIComponent(`session_id = "${fixture.sessionId}"`)}`), {
        headers: { Authorization: token },
      })
      const ignoredBody = await ignoredRes.json().catch(() => ({ items: [] }))
      for (const item of ignoredBody.items ?? []) {
        await request.delete(pbUrl(`/api/collections/ignored_sessions/records/${item.id}`), { headers: { Authorization: token } })
      }
    }
  })
})
