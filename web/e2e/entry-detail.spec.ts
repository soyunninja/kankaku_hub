import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { apiLogin, findClients, login, pbUrl, setTheme, shoot } from './helpers'

/**
 * End-to-end coverage for the redesigned entry detail sheet (see
 * app/components/entries/EntryDetailSheet.vue and app/lib/entry-detail.ts).
 * Creates one disposable task_entries row via the API (real, controlled
 * field values — segments, a multi-line prompt, cache tokens, a repo
 * path) rather than relying on the random seed, so every assertion below
 * targets deterministic content. Cleans the row up in `finally`
 * regardless of outcome.
 *
 * Each fixture's `machine` field IS its unique `runId`, so tests locate
 * their row through the explorer's own machine filter (an exact match —
 * see `buildFilter` in useEntriesExplorer.ts) instead of assuming table
 * order (sort order among same-second rows isn't a contract this suite
 * should depend on) or depending on prompt content, which one test
 * deliberately leaves empty.
 */

interface Fixture {
  entryId: string
  runId: string
  clientName: string
  projectName: string
  wallMs: number
  workMs: number
}

async function createFixtureEntry(
  request: Parameters<typeof apiLogin>[0],
  overrides: { prompt?: string } = {},
): Promise<{ token: string, fixture: Fixture }> {
  const token = await apiLogin(request)
  const { target } = await findClients(request, token)

  const projectsRes = await request.get(pbUrl(`/api/collections/projects/records?perPage=1&filter=${encodeURIComponent(`client = "${target.id}"`)}`), {
    headers: { Authorization: token },
  })
  const projectsBody = await projectsRes.json()
  const project = projectsBody.items[0]

  const runId = `e2e-detail-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const startedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + '.000Z'
  const wallMs = 9_045_270
  const workMs = 7_200_000
  const prompt = overrides.prompt ?? `${runId}\nFirst line of the prompt.\nSecond line, after a break.`

  const res = await request.post(pbUrl('/api/collections/task_entries/records'), {
    headers: { Authorization: token },
    data: {
      task_id: runId,
      client: target.id,
      project: project.id,
      task: '',
      started_at: startedAt,
      ended_at: startedAt,
      wall_ms: wallMs,
      waiting_ms: 300_000,
      work_ms: workMs,
      input: 1234,
      output: 5678,
      cache_read: 12_345,
      cache_write: 999,
      cost: 0.4321,
      segments: { review: 600_000, test: 120_000 },
      subagent_count: 2,
      runs: 3,
      turns: 9,
      status: 'interrupted',
      session_id: `${runId}-session`,
      session_name: `E2E detail sheet ${runId}`,
      // The unique lookup key `openFixture` filters by (an exact match on
      // `machine`, never a substring search) — independent of prompt
      // content, which one test deliberately leaves empty.
      machine: runId,
      model: 'e2e-model',
      prompt,
      legacy_client_label: '',
      repo_project: '/home/dev/repos/a-very-long-repository-path/that-should-be-truncated/in-the-middle',
      schema: 1,
    },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const created = await res.json()

  return {
    token,
    fixture: { entryId: created.id, runId, clientName: target.name, projectName: project.name, wallMs, workMs },
  }
}

async function deleteFixtureEntry(request: Parameters<typeof apiLogin>[0], token: string, id: string) {
  await request.delete(pbUrl(`/api/collections/task_entries/records/${id}`), { headers: { Authorization: token } })
}

/** Navigates to /entries, filters down to exactly the fixture row via the
 * machine filter (exact match on the fixture's `runId`), and opens its
 * detail sheet. */
async function openFixture(page: Page, runId: string) {
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

test.describe('entry detail sheet', () => {
  test('renders readable content — no [object Object], no raw field names, durations formatted', async ({ page, request }) => {
    test.setTimeout(60_000)
    const { token, fixture } = await createFixtureEntry(request)

    try {
      await login(page)
      await openFixture(page, fixture.runId)

      const sheet = page.locator('[data-slot="sheet-content"]')
      await expect(sheet.getByRole('link', { name: fixture.clientName })).toBeVisible()

      const sheetText = await sheet.innerText()

      expect(sheetText).not.toContain('[object Object]')
      expect(sheetText).not.toMatch(/\bcache_read\b/)
      expect(sheetText).not.toMatch(/\bcollectionId\b/)
      expect(sheetText).not.toMatch(/\bcollectionName\b/)
      expect(sheetText).not.toMatch(/\bwall_ms\b/)
      expect(sheetText).not.toMatch(/\bwork_ms\b/)
      expect(sheetText).not.toMatch(/\bexpand\b/)

      // Durations are formatted (e.g. "2h 30m"), never the raw millisecond value.
      expect(sheetText).toMatch(/\d+h|\d+m|\d+s/)
      expect(sheetText).not.toContain(String(fixture.wallMs))
      expect(sheetText).not.toContain(String(fixture.workMs))

      // Client shown by name, not by raw id.
      expect(sheetText).toContain(fixture.clientName)
      expect(sheetText).not.toContain(fixture.entryId)

      // Segments render as a tag/duration list, never the stringified object.
      expect(sheetText).toContain('review')
      expect(sheetText).toContain('test')

      // Prompt line breaks are preserved, never innerHTML'd.
      const promptPre = sheet.locator('pre')
      await expect(promptPre).toContainText('First line of the prompt.')
      await expect(promptPre).toContainText('Second line, after a break.')
    }
    finally {
      await deleteFixtureEntry(request, token, fixture.entryId)
    }
  })

  test('technical details are collapsed by default and expand by keyboard', async ({ page, request }) => {
    test.setTimeout(60_000)
    const { token, fixture } = await createFixtureEntry(request)

    try {
      await login(page)
      await openFixture(page, fixture.runId)

      const toggle = page.getByRole('button', { name: /Detalles técnicos/ })
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      const panel = page.locator('#entry-technical-details')
      await expect(panel).toBeHidden()

      // The raw record id only ever appears inside this collapsed panel.
      const sheetTextBefore = await page.locator('[data-slot="sheet-content"]').innerText()
      expect(sheetTextBefore).not.toContain(fixture.entryId)

      await toggle.focus()
      await page.keyboard.press('Enter')
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(panel).toBeVisible()
      await expect(panel).toContainText(fixture.entryId)
    }
    finally {
      await deleteFixtureEntry(request, token, fixture.entryId)
    }
  })

  test('copy button copies the record id to the clipboard', async ({ page, request, context, browserName }) => {
    test.setTimeout(60_000)
    test.skip(browserName !== 'chromium', 'clipboard permission grants are chromium-only in Playwright')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const { token, fixture } = await createFixtureEntry(request)

    try {
      await login(page)
      await openFixture(page, fixture.runId)

      await page.getByRole('button', { name: /Detalles técnicos/ }).click()
      const idRow = page.locator('#entry-technical-details').getByText(fixture.entryId)
      await expect(idRow).toBeVisible()

      const copyButtons = page.locator('#entry-technical-details button', { hasText: /Copiar/ })
      await copyButtons.first().click()
      await expect(page.locator('#entry-technical-details').getByText('¡Copiado!')).toBeVisible()

      const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
      expect(clipboardText).toBe(fixture.entryId)
    }
    finally {
      await deleteFixtureEntry(request, token, fixture.entryId)
    }
  })

  test('empty prompt shows the KANKAKU_SYNC_PROMPT note with a link to /commands', async ({ page, request }) => {
    test.setTimeout(60_000)
    const { token, fixture } = await createFixtureEntry(request, { prompt: '' })

    try {
      await login(page)
      await openFixture(page, fixture.runId)

      const sheet = page.locator('[data-slot="sheet-content"]')
      await expect(sheet.locator('pre')).toHaveCount(0)
      await expect(sheet.getByText('KANKAKU_SYNC_PROMPT')).toBeVisible()
      const link = sheet.getByRole('link', { name: /Comandos|Commands/ })
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', '/commands#config')
    }
    finally {
      await deleteFixtureEntry(request, token, fixture.entryId)
    }
  })

  test('reassignment still works end-to-end from the sheet', async ({ page, request }) => {
    test.setTimeout(60_000)
    const token = await apiLogin(request)
    const { unassigned } = await findClients(request, token)
    const { fixture } = await createFixtureEntry(request)

    try {
      await login(page)
      await openFixture(page, fixture.runId)

      const sheet = page.locator('[data-slot="sheet-content"]')
      const selects = sheet.locator('select')
      // Move it to "Sin determinar" — proves the save round-trips through
      // the real updateAssignment call. The fixture is a disposable row
      // deleted in `finally` regardless of outcome, never the seeded demo
      // data, so there is nothing to revert (contrast with
      // e2e/polish.spec.ts's bulk-assign test, which reverts seeded rows).
      // Only the client select is touched here — the project select's
      // options collapse to a placeholder plus a single "None" entry once
      // the client has no projects, both sharing the empty value, which
      // makes selecting by label ambiguous; verifying the client save is
      // what this test is actually about.
      await selects.first().selectOption({ label: unassigned.name })
      await sheet.getByRole('button', { name: 'Guardar' }).click()
      await expect(page.getByText('Guardado')).toBeVisible({ timeout: 10_000 })

      const verifyRes = await request.get(pbUrl(`/api/collections/task_entries/records/${fixture.entryId}`), { headers: { Authorization: token } })
      const verified = await verifyRes.json()
      expect(verified.client).toBe(unassigned.id)
    }
    finally {
      await deleteFixtureEntry(request, token, fixture.entryId)
    }
  })

  test('no horizontal overflow and content margin at 390px', async ({ page, request }) => {
    test.setTimeout(60_000)
    const { token, fixture } = await createFixtureEntry(request)

    try {
      await login(page)
      await page.setViewportSize({ width: 390, height: 844 })
      await openFixture(page, fixture.runId)

      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }))
      expect(scrollWidth).toBeLessThanOrEqual(innerWidth)

      const sheet = page.locator('[data-slot="sheet-content"]')
      const title = page.locator('h2', { hasText: 'E2E detail sheet' })
      const sheetBox = await sheet.boundingBox()
      const titleBox = await title.boundingBox()
      expect(sheetBox && titleBox).toBeTruthy()
      expect(titleBox!.x - sheetBox!.x).toBeGreaterThanOrEqual(16)
    }
    finally {
      await deleteFixtureEntry(request, token, fixture.entryId)
    }
  })

  test('captures docs screenshots (dark, light, mobile dark)', async ({ page, request }) => {
    test.setTimeout(60_000)
    const { token, fixture } = await createFixtureEntry(request)

    try {
      await login(page)

      for (const theme of ['dark', 'light'] as const) {
        await setTheme(page, theme)
        await openFixture(page, fixture.runId)
        await shoot(page, `entry-detail-${theme}`)
      }

      await page.setViewportSize({ width: 390, height: 844 })
      await setTheme(page, 'dark')
      await openFixture(page, fixture.runId)
      await shoot(page, 'entry-detail-mobile-dark')
    }
    finally {
      await deleteFixtureEntry(request, token, fixture.entryId)
    }
  })
})
