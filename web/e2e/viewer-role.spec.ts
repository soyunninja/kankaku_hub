import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { apiLoginAs, login, loginAs, pbUrl, useFlatEntriesView, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'

/**
 * e2e coverage for the read-only `viewer` role (odd/tasks/viewer-role.md
 * T2, migration `1758300021_viewer_role_and_write_rules.js`, ADR 0029).
 *
 * `demo@kankaku.local` / `kankaku-demo-viewer` is the account
 * `scripts/isolated-stack.sh --seed` creates — this spec assumes it (and
 * the owner account `login()` uses) already exist on whatever stack
 * `PW_BASE_URL`/`NUXT_PUBLIC_PB_URL` point at. It must NEVER run against
 * the owner's live :8090/:3000/pb_data (the account almost certainly does
 * not exist there, and this spec makes real, unauthorized-by-design write
 * attempts against the API).
 *
 * RUN (against an isolated stack — see docs/runbooks/local-development.md
 * "Demo instance"):
 *   scripts/isolated-stack.sh up /tmp/kankaku-viewer-e2e --seed
 *   PW_BASE_URL=http://127.0.0.1:<web-port> \
 *   NUXT_PUBLIC_PB_URL=http://127.0.0.1:<pb-port> \
 *   pnpm --dir web test:e2e viewer-role
 *
 * Every page below gates its write controls with `data-testid="write-action"`
 * on the control's root (button, dialog trigger area, row-actions cell,
 * checkbox column, …) — see app/lib/roles.ts and each page's own gating.
 */

const WRITE_ACTION = '[data-testid="write-action"]'

const GATED_PAGES = ['/clients', '/projects', '/tasks', '/sessions-without-task', '/unassigned'] as const

async function gotoAndSettle(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
}

test.describe('viewer role — dashboard and header', () => {
  test('viewer logs in, sees the dashboard with data, and the read-only badge', async ({ page }) => {
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // "with data": at least one KPI/summary card actually rendered, not
    // just the page shell / an error state.
    await expect(page.locator('[data-slot="card"]').first()).toBeVisible()

    await expect(page.locator('[data-testid="read-only-badge"]')).toBeVisible()
  })

  test('owner sees no read-only badge', async ({ page }) => {
    await login(page)
    await expect(page.locator('[data-testid="read-only-badge"]')).toHaveCount(0)
  })
})

test.describe('viewer role — no write controls on data pages', () => {
  for (const path of GATED_PAGES) {
    test(`viewer sees zero write-action controls on ${path}`, async ({ page }) => {
      await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
      await gotoAndSettle(page, path)
      await expect(page.locator(WRITE_ACTION)).toHaveCount(0)
    })

    test(`owner sees at least one write-action control on ${path}`, async ({ page }) => {
      await login(page)
      await gotoAndSettle(page, path)
      await expect(page.locator(WRITE_ACTION).first()).toBeVisible()
    })
  }
})

test.describe('viewer role — entry assignment sheet', () => {
  test('viewer sees the entry detail sheet as read-only, no task select or save', async ({ page }) => {
    await useFlatEntriesView(page)
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
    await gotoAndSettle(page, '/entries')

    const row = page.locator('table tbody tr').first()
    await expect(row).toBeVisible()
    await row.click()

    // The sheet opened (its title is focused/visible) and shows no write
    // controls: neither the assignment selects nor any other gated action.
    await expect(page.locator('[data-testid="entry-task-select"]')).toHaveCount(0)
    await expect(page.locator(WRITE_ACTION)).toHaveCount(0)
  })

  test('owner sees the assignment selects and save in the entry detail sheet', async ({ page }) => {
    await useFlatEntriesView(page)
    await login(page)
    await gotoAndSettle(page, '/entries')

    const row = page.locator('table tbody tr').first()
    await expect(row).toBeVisible()
    await row.click()

    await expect(page.locator('[data-testid="entry-task-select"]')).toBeVisible()
    await expect(page.locator(WRITE_ACTION).first()).toBeVisible()
  })
})

test.describe('viewer role — the server rejects viewer writes', () => {
  test('a viewer token cannot create a task_entries record', async ({ request }) => {
    const token = await apiLoginAs(request, VIEWER_EMAIL, VIEWER_PASSWORD)
    const res = await request.post(pbUrl('/api/collections/task_entries/records'), {
      headers: { Authorization: token },
      data: {
        task_id: `e2e-viewer-role-${Date.now()}`,
        client: '',
        project: '',
        task: '',
        started_at: new Date().toISOString().replace('T', ' ').slice(0, 19) + '.000Z',
        ended_at: new Date().toISOString().replace('T', ' ').slice(0, 19) + '.000Z',
        wall_ms: 1000,
        waiting_ms: 0,
        work_ms: 1000,
        input: 0,
        output: 0,
        cache_read: 0,
        cache_write: 0,
        cost: 0,
        status: 'completed',
        session_id: `e2e-viewer-role-${Date.now()}`,
        session_name: '',
        machine: 'e2e',
        model: '',
      },
    })
    expect(res.ok()).toBe(false)
    expect(res.status()).toBe(400)
  })

  test('a viewer token cannot create a client', async ({ request }) => {
    const token = await apiLoginAs(request, VIEWER_EMAIL, VIEWER_PASSWORD)
    const res = await request.post(pbUrl('/api/collections/clients/records'), {
      headers: { Authorization: token },
      data: { name: 'e2e-viewer-role-client', code: `e2e-viewer-${Date.now()}`, active: true, unassigned: false },
    })
    expect(res.ok()).toBe(false)
    expect(res.status()).toBe(400)
  })
})
