import { expect, test } from '@playwright/test'

// Read-only checks against the existing dev server, without auth or fixtures.
test.use({ baseURL: 'http://localhost:3000' })

test('same-origin development API health returns PocketBase JSON', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/^application\/json\b/)
  expect(await response.json()).toEqual({ message: 'API is healthy.', code: 200, data: {} })
})
