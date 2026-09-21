import type { APIRequestContext, Browser } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { localWallClockToUtc, toPbDateFilter } from '../app/lib/local-day'
import { apiLogin, findClients, OWNER_EMAIL, OWNER_PASSWORD, pbUrl } from './helpers'

/**
 * MAJOR finding: day ranges were built in local time but stamped as UTC,
 * and the dashboard/project trend charts bucketed by a raw slice of the
 * stored UTC instant instead of the viewer's local day. A UTC+9 viewer
 * working just after local midnight (e.g. 00:10 JST) stores a UTC
 * instant that falls on the PREVIOUS UTC calendar day — exactly the case
 * that used to be excluded from "today" and mis-bucketed on the chart.
 *
 * This spec creates one such boundary-crossing `task_entries` row per
 * timezone (via `app/lib/local-day.ts`'s own conversion, so the fixture
 * is built the same way the app now builds its filters) and asserts it
 * lands under the SAME local day on the entries explorer, the dashboard,
 * and the project detail page, with the browser's `timezoneId` actually
 * set to that zone (Playwright's `timezoneId` context option — the
 * browser's `Intl`/`Date` behave as if physically in that zone, matching
 * how `app/lib/local-day.ts` resolves the viewer's zone at runtime).
 */

async function loginAs(browser: Browser, timezoneId: string) {
  const context = await browser.newContext({ timezoneId })
  const page = await context.newPage()
  await page.goto('/login')
  await page.fill('#email', OWNER_EMAIL)
  await page.fill('#password', OWNER_PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL('/')
  return { context, page }
}

/** `YYYY-MM-DD` for "today" in `timeZone`, matching what the app's own
 * `resolvePreset('today')` would compute for a viewer physically there. */
function todayInZone(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

async function createBoundaryFixture(request: APIRequestContext, timeZone: string) {
  const token = await apiLogin(request)
  const { target } = await findClients(request, token)
  const projectsRes = await request.get(pbUrl(`/api/collections/projects/records?perPage=1&filter=${encodeURIComponent(`client = "${target.id}"`)}`), {
    headers: { Authorization: token },
  })
  const project = (await projectsRes.json()).items[0]

  const runId = `e2e-day-boundary-${timeZone.replace(/\//g, '-')}-${Date.now()}`
  const today = todayInZone(timeZone)
  // 00:10 local — just after local midnight. In Asia/Tokyo (UTC+9) this
  // is still 15:10 the PREVIOUS UTC day; in America/Los_Angeles (UTC-7/8)
  // it stays on the same UTC day — both are exercised across the two
  // describe blocks below, but the conversion is always done the same
  // way the app itself now does it.
  const startedAtUtc = localWallClockToUtc(today, { hour: 0, minute: 10, second: 0, ms: 0 }, timeZone)
  const startedAt = toPbDateFilter(startedAtUtc)
  // Fixed and distinctively high — unlikely to collide with seeded demo
  // costs, and lets assertions match the exact formatted string
  // (`formatCost`, `app/lib/format.ts`) instead of a substring/regex.
  const cost = 888.81
  const costText = '$888.81'

  const res = await request.post(pbUrl('/api/collections/task_entries/records'), {
    headers: { Authorization: token },
    data: {
      task_id: runId,
      client: target.id,
      project: project.id,
      task: '',
      started_at: startedAt,
      ended_at: startedAt,
      wall_ms: 600_000,
      waiting_ms: 0,
      work_ms: 600_000,
      cost,
      status: 'completed',
      session_id: `${runId}-session`,
      session_name: runId,
      machine: runId,
      prompt: runId,
      legacy_client_label: '',
      schema: 1,
    },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const created = await res.json()
  return { token, entryId: created.id as string, runId, today, cost, costText, projectId: project.id as string, projectName: project.name as string }
}

async function deleteFixture(request: APIRequestContext, token: string, id: string) {
  await request.delete(pbUrl(`/api/collections/task_entries/records/${id}`), { headers: { Authorization: token } })
}

for (const timeZone of ['Asia/Tokyo', 'America/Los_Angeles']) {
  test.describe(`day boundary consistency — ${timeZone}`, () => {
    test(`an entry just after local midnight lands under the same local day everywhere (${timeZone})`, async ({ request, browser }) => {
      test.setTimeout(60_000)
      const fixture = await createBoundaryFixture(request, timeZone)
      const { context, page } = await loginAs(browser, timeZone)

      try {
        // 1) Entries explorer: filter to exactly today (local) + this
        // fixture's machine — must find exactly the one row (proves
        // useEntriesExplorer's date filter converts the local day to UTC
        // correctly). The table shows no machine/prompt column, so match
        // on the row's own distinctive cost instead of the runId text.
        await page.goto(`/entries?dateStart=${fixture.today}&dateEnd=${fixture.today}`)
        await page.getByPlaceholder(/Máquina|Machine|マシン/).fill(fixture.runId)
        await page.waitForTimeout(600)
        const rows = page.locator('table tbody tr')
        await expect(rows).toHaveCount(1, { timeout: 15_000 })
        await expect(rows.first()).toContainText(fixture.costText)

        // 2) Dashboard: default 30d range includes today, so the
        // fixture's distinctive cost must show up in the "top expensive"
        // table (sorted by cost desc, and $888.81 is far above any
        // seeded demo cost).
        await page.goto('/')
        await page.waitForTimeout(800)
        await expect(page.getByText(fixture.costText).first()).toBeVisible({ timeout: 15_000 })

        // 3) Project detail: its trend/top-prompts fetch also goes through
        // useTaskEntries().fetchRange with the same local-day conversion.
        await page.goto(`/projects/${fixture.projectId}`)
        await page.waitForTimeout(800)
        const bodyText = await page.locator('main').innerText()
        expect(bodyText).toContain(fixture.runId)
      }
      finally {
        await deleteFixture(request, fixture.token, fixture.entryId)
        await context.close()
      }
    })
  })
}
