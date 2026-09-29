import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('unassigned queue shows a load error and recovers on retry', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('kankaku-locale', 'en'))
  await login(page)

  let failedOnce = false
  let matchingRequests = 0
  await page.route('**/api/kankaku/totals', async (route) => {
    const request = route.request()
    if (request.method() !== 'POST') {
      await route.continue()
      return
    }
    const body = request.postDataJSON() as { group_by?: string }
    if (body.group_by !== 'legacy_label') {
      await route.continue()
      return
    }
    matchingRequests++
    if (!failedOnce) {
      failedOnce = true
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Service unavailable' }) })
      return
    }
    await route.continue()
  })

  await page.goto('/unassigned')
  const loadError = page.getByRole('alert').filter({ hasText: 'Could not load unassigned entries.' })
  await expect(loadError).toBeVisible()
  const retry = page.getByRole('button', { name: 'Retry' })
  await expect(retry).toBeVisible()
  await expect(page.getByText('No entries waiting to be assigned.')).toHaveCount(0)
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0)
  expect(failedOnce).toBe(true)
  expect(matchingRequests).toBe(1)

  await retry.click()
  await expect(loadError).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Legacy label' })).toBeVisible()
  expect(matchingRequests).toBeGreaterThanOrEqual(2)
})

test('unassigned 404 totals fallback recovers when its first entries request fails', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('kankaku-locale', 'en'))
  await login(page)

  let totalsRequests = 0
  await page.route('**/api/kankaku/totals', async (route) => {
    const request = route.request()
    if (request.method() !== 'POST' || (request.postDataJSON() as { group_by?: string }).group_by !== 'legacy_label') {
      await route.continue()
      return
    }
    totalsRequests++
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not found' }) })
  })

  let fallbackRequests = 0
  await page.route('**/api/collections/task_entries/records?**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() !== 'GET'
      || url.pathname !== '/api/collections/task_entries/records'
      || !/^client = "[^"]+"$/.test(url.searchParams.get('filter') ?? '')
      || url.searchParams.get('perPage') !== '2000') {
      await route.continue()
      return
    }
    fallbackRequests++
    if (fallbackRequests === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Service unavailable' }) })
      return
    }
    await route.continue()
  })

  await page.goto('/unassigned')
  const loadError = page.getByRole('alert').filter({ hasText: 'Could not load unassigned entries.' })
  await expect(loadError).toBeVisible()
  const retry = page.getByRole('button', { name: 'Retry' })
  await expect(retry).toBeVisible()
  await expect(page.getByText('No entries waiting to be assigned.')).toHaveCount(0)
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0)
  expect(totalsRequests).toBe(1)
  expect(fallbackRequests).toBe(1)

  await retry.click()
  await expect(loadError).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Legacy label' })).toBeVisible()
  expect(totalsRequests).toBeGreaterThanOrEqual(2)
  expect(fallbackRequests).toBeGreaterThanOrEqual(2)
})
