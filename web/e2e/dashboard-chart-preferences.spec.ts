import { expect, test } from '@playwright/test'
import { DASHBOARD_PREFERENCES_KEY } from '../app/lib/dashboard-preferences'
import { login, pbOrigin } from './helpers'

test.beforeEach(async ({ page }) => {
  expect(`${process.env.PW_BASE_URL}|${pbOrigin()}`).toBe('http://127.0.0.1:3003|http://127.0.0.1:8093')
  await page.addInitScript(() => {
    localStorage.setItem('kankaku-locale', 'en')
    const errors: string[] = []
    Object.assign(window, { preferenceRejections: errors })
    window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)))
  })
})

for (const scenario of ['fresh', 'client', 'none', 'invalid', 'throws'] as const) {
  test(`dashboard preferences: ${scenario}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const requests: { group_by: string, per_page?: number, filters?: { project?: string, client?: string } }[] = []
    await page.route('**/api/kankaku/totals', async (route) => {
      const body = route.request().postDataJSON()
      requests.push(body)
      const row = { group_key: body.group_by === 'day' ? '0' : 'mockseries00001', entries: 1, work_ms: 3600000, cost: 3 }
      const groups = ['project', 'client', 'day'].includes(body.group_by) ? [row] : []
      await route.fulfill({ json: { total: row, groups, total_groups: groups.length, page: 1, total_pages: 1 } })
    })
    if (scenario === 'invalid') {
      await page.addInitScript(key => localStorage.setItem(key, '{"metric":"bad","stackBy":"client"}'), DASHBOARD_PREFERENCES_KEY)
    }
    if (scenario === 'throws') {
      await page.addInitScript((key) => {
        const get = Storage.prototype.getItem
        const set = Storage.prototype.setItem
        Storage.prototype.getItem = function (name) {
          if (name === key) throw new Error('Storage unavailable')
          return get.call(this, name)
        }
        Storage.prototype.setItem = function (name, value) {
          if (name === key) throw new Error('Storage unavailable')
          return set.call(this, name, value)
        }
      }, DASHBOARD_PREFERENCES_KEY)
    }
    await login(page)
    const chart = page.getByTestId('dashboard-time-series')
    await expect(chart.getByRole('img').first()).toBeVisible()
    await page.waitForLoadState('networkidle')
    const assertInitialization = (stack: string) => {
      expect(requests.filter(body => body.per_page === 6)).toHaveLength(stack === 'project' ? 1 : 0)
      expect(requests.filter(body => body.group_by === 'day')).toHaveLength(stack === 'project' ? 2 : 1)
    }
    assertInitialization('project')
    await expect(chart.getByRole('combobox').first()).toContainText('Work time')
    await expect(chart.getByRole('combobox').last()).toContainText('Project')
    if (scenario === 'client' || scenario === 'none' || scenario === 'throws') {
      await chart.getByRole('combobox').first().click()
      await page.getByRole('option', { name: 'Cost', exact: true }).click()
      await chart.getByRole('combobox').last().click()
      await page.getByRole('option', { name: scenario === 'client' ? 'Client' : 'No grouping', exact: true }).click()
      await expect(chart.getByRole('img').first()).toBeVisible()
      await page.waitForLoadState('networkidle')
      requests.length = 0
      await page.reload()
      await expect(chart.getByRole('img').first()).toBeVisible()
      await page.waitForLoadState('networkidle')
      assertInitialization(scenario === 'throws' ? 'project' : scenario)
      await expect(chart.getByRole('combobox').first()).toContainText(scenario === 'throws' ? 'Work time' : 'Cost')
      await expect(chart.getByRole('combobox').last()).toContainText(scenario === 'throws' ? 'Project' : scenario === 'client' ? 'Client' : 'No grouping')
    }
    expect(errors).toEqual([])
    expect(await page.evaluate(() => (window as unknown as { preferenceRejections: string[] }).preferenceRejections)).toEqual([])
  })
}
