import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Both screens must show the PocketBase URL the app really talks to, never the
// web's own origin: in `nuxt dev` those differ (3000 vs 8090), and the
// commands page offers it as a copyable KANKAKU_PB_URL.
test('settings and commands show the real hub URL', async ({ page }) => {
  await login(page)
  const real = await page.evaluate(() => String((window as unknown as { useNuxtApp: () => { $pb: { baseURL: string } } }).useNuxtApp().$pb.baseURL).replace(/\/+$/, ''))

  await page.goto('/settings')
  await expect(page.getByText(real, { exact: true })).toBeVisible()

  await page.goto('/commands')
  await expect(page.getByText(`KANKAKU_PB_URL="${real}"`).or(page.getByText(`KANKAKU_PB_URL=${real}`)).first()).toBeVisible()
})
