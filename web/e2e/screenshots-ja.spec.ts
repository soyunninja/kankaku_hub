import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { apiLogin, findClients, login, pbUrl, setTheme, shoot } from './helpers'

/**
 * Documentation screenshots for the Japanese locale (see
 * web/docs/screenshots/ and the task's own verification notes). Not part
 * of the regular regression suite's assertions — this spec's job is to
 * produce PNGs for a human (or a future agent) to look at for tofu,
 * mismatched fonts and awkward wraps, mirroring the existing
 * dashboard-{dark,light}.png / entry-detail-*.png
 * captured by e2e/smoke.spec.ts and e2e/entry-detail.spec.ts, but with
 * the UI switched to 日本語 first.
 */

async function switchToJapanese(page: Page) {
  await page.getByRole('button', { name: /language|idioma|言語/i }).click()
  await page.getByRole('menuitemradio', { name: '日本語' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
}

test('captures Japanese-locale documentation screenshots', async ({ page, request }) => {
  test.setTimeout(120_000)

  const token = await apiLogin(request)
  const { target } = await findClients(request, token)
  const projectsRes = await request.get(pbUrl(`/api/collections/projects/records?perPage=1&filter=${encodeURIComponent(`client = "${target.id}"`)}`), {
    headers: { Authorization: token },
  })
  const project = (await projectsRes.json()).items[0]

  const runId = `e2e-ja-shot-${Date.now()}`
  const startedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + '.000Z'
  const entryRes = await request.post(pbUrl('/api/collections/task_entries/records'), {
    headers: { Authorization: token },
    data: {
      task_id: runId,
      client: target.id,
      project: project.id,
      task: '',
      started_at: startedAt,
      ended_at: startedAt,
      wall_ms: 9_045_270,
      waiting_ms: 1_845_270,
      work_ms: 7_200_000,
      input: 12_345,
      output: 4_567,
      cache_read: 800_000,
      cache_write: 12_000,
      cost: 4.21,
      status: 'completed',
      session_id: `${runId}-session`,
      session_name: `E2E screenshot ${runId}`,
      machine: runId,
      model: 'e2e-model',
      prompt: `${runId}\nFirst line of the prompt.\nSecond line, after a break.`,
      legacy_client_label: '',
      repo_project: '/home/dev/repos/a-very-long-repository-path/that-should-be-truncated/in-the-middle',
      schema: 1,
    },
  })
  expect(entryRes.ok(), await entryRes.text()).toBeTruthy()
  const entry = await entryRes.json()

  try {
    await login(page)
    await switchToJapanese(page)

    await setTheme(page, 'dark')
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await shoot(page, 'dashboard-ja-dark')

    await setTheme(page, 'light')
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await shoot(page, 'dashboard-ja-light')

    await setTheme(page, 'dark')
    await page.goto('/entries')
    await page.waitForLoadState('networkidle')
    await page.getByPlaceholder('マシン').fill(runId)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(300)
    await page.locator('table tbody tr').first().click()
    await page.waitForTimeout(300)
    await shoot(page, 'entry-detail-ja-dark')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await shoot(page, 'dashboard-ja-mobile-dark')
  }
  finally {
    await request.delete(pbUrl(`/api/collections/task_entries/records/${entry.id}`), { headers: { Authorization: token } })
  }
})
