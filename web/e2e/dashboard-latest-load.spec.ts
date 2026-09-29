import { expect, test } from '@playwright/test'
import { login } from './helpers'

/** The two current-period calls end today; the comparison call ends yesterday. */
function isCurrentPeriod(body: { from?: string, to?: string, group_by?: string }, todayStart: number): boolean {
  return body.group_by === 'none' && typeof body.from === 'string' && typeof body.to === 'string'
    && Date.parse(body.to) >= todayStart
}

test('an older dashboard range cannot replace the newer cost KPI', async ({ page }) => {
  const staleCost = 9_876_543.21
  const todayStart = new Date().setHours(0, 0, 0, 0)
  const dayMs = 24 * 60 * 60 * 1000
  let releaseOld!: () => void
  const oldReleased = new Promise<void>((resolve) => { releaseOld = resolve })
  let signalOldReady!: () => void
  const oldReady = new Promise<void>((resolve) => { signalOldReady = resolve })
  let oldIntercepted = false

  await page.route('**/api/kankaku/totals', async (route) => {
    const body = route.request().postDataJSON() as { from?: string, to?: string, group_by?: string }
    const isInitial30d = isCurrentPeriod(body, todayStart)
      && Date.parse(body.from!) < todayStart - 20 * dayMs
    if (!oldIntercepted && isInitial30d) {
      oldIntercepted = true
      // Fetch the real response first; only its current total is changed.
      // The first load remains pending while Today is free to complete.
      const response = await route.fetch()
      const payload = await response.json() as { total: { cost: number } }
      signalOldReady()
      await oldReleased
      await route.fulfill({ response, json: { ...payload, total: { ...payload.total, cost: staleCost } } })
      return
    }
    await route.continue()
  })

  try {
    await page.addInitScript(() => window.localStorage.setItem('kankaku-locale', 'en'))
    await login(page)
    await oldReady
    const todayResponse = page.waitForResponse((response) => {
      if (!response.url().includes('/api/kankaku/totals') || response.request().method() !== 'POST') return false
      const body = response.request().postDataJSON() as { from?: string, to?: string, group_by?: string }
      return isCurrentPeriod(body, todayStart) && Date.parse(body.from!) >= todayStart
    })
    const todayChart = page.waitForResponse((response) => {
      if (!response.url().includes('/api/kankaku/totals') || response.request().method() !== 'POST') return false
      const body = response.request().postDataJSON() as { group_by?: string, day_boundaries?: string[] }
      return body.group_by === 'day' && body.day_boundaries?.length === 2
    })

    await page.getByRole('button', { name: /\d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}/ }).click()
    await page.getByRole('button', { name: 'Today', exact: true }).click()
    const newer = await todayResponse
    expect(newer.ok()).toBeTruthy()
    const { total } = await newer.json() as { total: { cost: number } }
    const expectedCost = new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: 2,
      maximumFractionDigits: Math.abs(total.cost) >= 1 ? 2 : 4,
    }).format(total.cost)
    expect(total.cost).not.toBe(staleCost)
    expect((await todayChart).ok()).toBeTruthy()
    const costKpi = page.locator('[data-slot="card"]').filter({ has: page.getByText('Cost (USD)', { exact: true }) }).getByTestId('kpi-value')
    await expect(costKpi).toHaveText(expectedCost)

    releaseOld()
    // Network idle waits for the released response AND any chart request
    // started by its load(), rather than asserting before Vue applies it.
    await page.waitForLoadState('networkidle')
    await expect(costKpi).toHaveText(expectedCost)
  }
  finally {
    releaseOld()
  }
})
