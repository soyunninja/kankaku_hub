import { expect, test } from '@playwright/test'
import { loginAs, pbOrigin, VIEWER_EMAIL, VIEWER_PASSWORD } from './helpers'

// Read-only viewer, synthetic responses, isolated stacks only.
for (const failure of ['list', 'grouped', 'fallback', 'catalog', 'agent'] as const) {
  test(`${failure} failure retries the current Entries view without rejected promises`, async ({ page }) => {
    expect(['http://127.0.0.1:3002|http://127.0.0.1:8092', 'http://127.0.0.1:3003|http://127.0.0.1:8093']).toContain(`${process.env.PW_BASE_URL}|${pbOrigin()}`)
    await page.addInitScript((grouped) => {
      localStorage.setItem('kankaku-locale', 'en')
      localStorage.setItem('kankaku-entries-group-by-session', grouped ? '1' : '0')
      Object.assign(window, { recoveryRejections: [] as string[] })
      window.addEventListener('unhandledrejection', event => {
        (window as unknown as { recoveryRejections: string[] }).recoveryRejections.push(String(event.reason))
      })
    }, failure === 'grouped' || failure === 'fallback')
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let recover = false
    let entriesActive = false
    const requests: string[] = []
    await page.route('**/api/kankaku/totals', async (route) => {
      const body = route.request().postDataJSON()
      const target = entriesActive && ((body.group_by === 'session' && body.per_page === 25 && ['grouped', 'fallback'].includes(failure)) || (body.group_by === 'agent' && failure === 'agent'))
      if (target) requests.push(JSON.stringify(body))
      if (target && (!recover || failure === 'fallback')) {
        await route.fulfill({ status: failure === 'fallback' ? 404 : 503, json: { message: 'Unavailable' } })
        return
      }
      await route.fulfill({ json: { total: {}, groups: [], total_groups: 0, page: 1, total_pages: 1 } })
    })
    await page.route('**/api/collections/*/records?**', async (route) => {
      const url = new URL(route.request().url())
      const target = entriesActive && ((url.pathname.includes('/task_entries/') && url.searchParams.get('perPage') === '25' && ['list', 'fallback'].includes(failure)) || (url.pathname.includes('/projects/') && failure === 'catalog'))
      if (target) requests.push(url.search)
      if (target && !recover) {
        await route.fulfill({ status: 503, json: { message: 'Unavailable' } })
        return
      }
      await route.fulfill({ json: { page: 1, perPage: 25, totalItems: 0, totalPages: 1, items: [] } })
    })
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
    entriesActive = true
    await page.goto('/entries')
    const alert = page.getByRole('alert').filter({ hasText: 'Could not load entries.' })
    await expect(alert).toBeVisible()
    await expect(page.locator('table')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled()
    const first = [...requests]
    requests.length = 0
    recover = true
    await alert.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled()
    await expect(alert).toHaveCount(0)
    await expect(page.locator('table').first()).toBeVisible()
    // A retry reprobes grouped totals before silently falling back on 404.
    expect(requests).toEqual(first)
    expect(errors).toEqual([])
    expect(await page.evaluate(() => (window as unknown as { recoveryRejections: string[] }).recoveryRejections)).toEqual([])
  })
}

test('stale list failure cannot replace a newer grouped success', async ({ page }) => {
  expect(['http://127.0.0.1:3002|http://127.0.0.1:8092', 'http://127.0.0.1:3003|http://127.0.0.1:8093']).toContain(`${process.env.PW_BASE_URL}|${pbOrigin()}`)
  await page.addInitScript(() => {
    localStorage.setItem('kankaku-locale', 'en')
    localStorage.setItem('kankaku-entries-group-by-session', '0')
    Object.assign(window, { recoveryRejections: [] as string[] })
    window.addEventListener('unhandledrejection', event => {
      (window as unknown as { recoveryRejections: string[] }).recoveryRejections.push(String(event.reason))
    })
  })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let active = false
  let pending = false
  let release = () => {}
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/collections/task_entries/records?**', async (route) => {
    if (active && new URL(route.request().url()).searchParams.get('perPage') === '25') {
      pending = true
      await gate
      await route.fulfill({ status: 503, json: { message: 'Old failure' } })
    }
    else await route.fulfill({ json: { page: 1, totalItems: 0, totalPages: 1, items: [] } })
  })
  await page.route('**/api/kankaku/totals', route => route.fulfill({ json: { total: {}, groups: [], total_groups: 0, page: 1, total_pages: 1 } }))
  try {
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD)
    active = true
    await page.goto('/entries')
    await expect.poll(() => pending).toBe(true)
    await page.getByRole('switch', { name: 'Group by session' }).click()
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled()
    release()
    await page.waitForLoadState('networkidle')
    // The app shell always mounts an empty announcement alert.
    await expect(page.getByRole('alert').filter({ hasText: 'Could not load entries.' })).toHaveCount(0)
    await expect(page.locator('table').first()).toBeVisible()
    expect(errors).toEqual([])
    expect(await page.evaluate(() => (window as unknown as { recoveryRejections: string[] }).recoveryRejections)).toEqual([])
  }
  finally { release() }
})
