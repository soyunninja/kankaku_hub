import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Settings must show the PocketBase URL the app really talks to, never the
// web's own origin: in `nuxt dev` those differ (3000 vs 8090).
test('settings shows the real hub URL and the kankaku website', async ({ page }) => {
  await login(page)
  const real = await page.evaluate(() => String((window as unknown as { useNuxtApp: () => { $pb: { baseURL: string } } }).useNuxtApp().$pb.baseURL).replace(/\/+$/, ''))

  await page.goto('/settings')
  await expect(page.getByText(real, { exact: true })).toBeVisible()
  const website = page.getByRole('link', { name: 'kankaku.io' })
  await expect(website).toBeVisible()
  await expect(website).toHaveAttribute('href', 'https://kankaku.io')
  await expect(website).toHaveAttribute('target', '_blank')
  await expect(website).toHaveAttribute('rel', 'noopener noreferrer')
})
