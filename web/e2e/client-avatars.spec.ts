import type { APIRequestContext } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { apiLogin, login, pbUrl } from './helpers'

/**
 * Client favicon avatars: the ClientAvatar/ClientName components, the
 * owner-only refresh-icon flow, and the client detail sheet's header
 * layout/focus fixes. Runs against an isolated PocketBase instance
 * started with `KANKAKU_FAVICON_ALLOW_PRIVATE=1` (see ESTADO.md /
 * docs/specs/client-favicons.md) plus a tiny local HTTP fixture server
 * (started separately — see the task's own verification notes) so the
 * refresh route's outcomes are fully deterministic:
 *
 * - `E2E Fixture Client` — `website` points at the fixture server's `/`,
 *   which serves a real, tiny, valid PNG favicon -> `{ ok: true }`.
 * - `E2E Unreachable Client` — `website` points at a local port with
 *   nothing listening -> `{ ok: false, reason: "fetch_failed" }`.
 *
 * Both are created once in `beforeAll` (disposable, deleted in
 * `afterAll`) rather than through the seed data, so these assertions
 * never depend on — or pollute — the demo clients.
 */

const FIXTURE_ORIGIN = process.env.E2E_FAVICON_FIXTURE_ORIGIN || 'http://127.0.0.1:8099'
const UNREACHABLE_ORIGIN = process.env.E2E_FAVICON_UNREACHABLE_ORIGIN || 'http://127.0.0.1:8098'

interface CreatedClient { id: string, name: string, code: string }

async function createClient(request: APIRequestContext, token: string, data: { name: string, code: string, website: string }): Promise<CreatedClient> {
  const res = await request.post(pbUrl('/api/collections/clients/records'), {
    headers: { Authorization: token },
    data: { ...data, active: true, unassigned: false },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const body = await res.json()
  return { id: body.id, name: body.name, code: body.code }
}

async function deleteClient(request: APIRequestContext, token: string, id: string) {
  await request.delete(pbUrl(`/api/collections/clients/records/${id}`), { headers: { Authorization: token } })
}

async function refreshFaviconViaApi(request: APIRequestContext, token: string, id: string) {
  const res = await request.post(pbUrl(`/api/kankaku/clients/${id}/favicon/refresh`), { headers: { Authorization: token } })
  expect(res.ok(), await res.text()).toBeTruthy()
  return res.json() as Promise<{ ok: boolean, reason?: string }>
}

let token: string
let fixtureClient: CreatedClient
let unreachableClient: CreatedClient
let fixtureClientWithFavicon: CreatedClient

test.beforeAll(async ({ request }) => {
  token = await apiLogin(request)
  const suffix = Date.now()
  fixtureClient = await createClient(request, token, { name: `E2E Avatar Fixture ${suffix}`, code: `e2e-avatar-fixture-${suffix}`, website: `${FIXTURE_ORIGIN}/` })
  unreachableClient = await createClient(request, token, { name: `E2E Avatar Unreachable ${suffix}`, code: `e2e-avatar-unreachable-${suffix}`, website: `${UNREACHABLE_ORIGIN}/` })
  fixtureClientWithFavicon = await createClient(request, token, { name: `E2E Avatar Broken Image ${suffix}`, code: `e2e-avatar-broken-${suffix}`, website: `${FIXTURE_ORIGIN}/` })
  const result = await refreshFaviconViaApi(request, token, fixtureClientWithFavicon.id)
  expect(result.ok, 'the fixture server must yield a real favicon for the broken-image test to be meaningful').toBe(true)
})

test.afterAll(async ({ request }) => {
  for (const c of [fixtureClient, unreachableClient, fixtureClientWithFavicon]) {
    if (c) await deleteClient(request, token, c.id)
  }
})

test.describe('client avatars render across the app', () => {
  test('the clients list shows an avatar per row, falling back to initials with no favicon', async ({ page }) => {
    await login(page)
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')

    const avatars = page.locator('[data-testid="client-avatar"]')
    expect(await avatars.count()).toBeGreaterThan(0)

    // Seed demo clients (other than the fixture-with-favicon one) have no
    // favicon at all — they must render the initials fallback, not an
    // <img>, and never a broken-image icon.
    const row = page.locator('tr', { hasText: 'Acme' }).first()
    const avatar = row.locator('[data-testid="client-avatar"]').first()
    await expect(avatar).toHaveAttribute('data-avatar-state', 'initials')
    expect(await avatar.locator('img').count()).toBe(0)
  })

  test('shows an avatar in the dashboard client breakdown table', async ({ page }) => {
    await login(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const table = page.locator('[data-testid="breakdown-by-client"]')
    await expect(table.locator('[data-testid="client-avatar"]').first()).toBeVisible()
  })

  test('shows an avatar in the projects list client column', async ({ page }) => {
    await login(page)
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('table tbody [data-testid="client-avatar"]').first()).toBeVisible()
  })

  test('shows an avatar in the entries list client column', async ({ page }) => {
    await login(page)
    await page.goto('/entries')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('table tbody [data-testid="client-avatar"]').first()).toBeVisible()
  })

  test('shows an avatar in the command palette client results', async ({ page }) => {
    await login(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const combobox = page.getByRole('dialog').getByRole('combobox')
    await expect(async () => {
      if (!(await page.getByRole('dialog').isVisible())) await page.keyboard.press('ControlOrMeta+k')
      await expect(combobox).toBeFocused({ timeout: 1000 })
    }).toPass({ timeout: 10_000 })

    await combobox.fill('Acme')
    await expect(page.locator('#palette-listbox [data-testid="client-avatar"]').first()).toBeVisible()
  })
})

test.describe('client avatar broken-image fallback', () => {
  test('falls back to initials when the favicon image request is blocked', async ({ page }) => {
    // Block only PocketBase's file-download route so the rest of the
    // page loads normally — a deterministic way to simulate "the image
    // failed to load" without relying on a real broken URL. The URL
    // `pb.files.getURL` builds uses the record's `collectionId` (e.g.
    // `pbc_2442875294`), not the collection name `clients` — verified
    // against a real generated URL, not assumed.
    await page.route('**/api/files/**', route => route.abort())

    await login(page)
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')

    const row = page.locator('tr', { hasText: fixtureClientWithFavicon.name })
    await expect(row).toBeVisible()
    const avatar = row.locator('[data-testid="client-avatar"]').first()

    // @error on the <img> flips the component back to the initials
    // fallback — never a broken-image icon left on screen.
    await expect(avatar).toHaveAttribute('data-avatar-state', 'initials', { timeout: 10_000 })
    expect(await avatar.locator('img').count()).toBe(0)
  })
})

/**
 * The clients table row's `@click` opens the detail sheet, but the
 * website/contact/actions cells stop propagation (see
 * `app/pages/clients/index.vue`) so a click landing on the row's
 * geometric center (Playwright's default) can land on one of those
 * cells and silently do nothing — verified against this exact page.
 * Clicking the first cell (the name column, no `.stop`) is what
 * `e2e/client-contact.spec.ts` already does for the same reason.
 */
async function openClientRow(page: import('@playwright/test').Page, name: string) {
  const row = page.locator('tr', { hasText: name }).first()
  await expect(row).toBeVisible()
  await row.locator('td').first().click()
  await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible()
  // The sheet slides in over `duration-500` (see SheetContent.vue) —
  // wait for that transform to settle before reading any geometry,
  // otherwise a mid-slide transform makes bounding-box assertions
  // meaningless (same technique as e2e/client-contact.spec.ts).
  await page.waitForTimeout(600)
}

test.describe('favicon refresh button', () => {
  async function openDetailFor(page: import('@playwright/test').Page, name: string) {
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')
    await openClientRow(page, name)
  }

  test('a successful fetch shows a spinner, then a success toast, and the avatar updates', async ({ page }) => {
    await login(page)
    await openDetailFor(page, fixtureClient.name)

    const button = page.locator('[data-testid="favicon-refresh-button"]')
    await expect(button).toBeVisible()
    await button.click()

    // Synchronous state (faviconRefreshing = true) is set before the
    // first await in onRefreshFavicon, so this is reliably observable
    // immediately after the click dispatches, before the fixture
    // server's (fast, local) response comes back.
    await expect(page.locator('[data-testid="favicon-refresh-icon"]')).toHaveClass(/animate-spin/)

    await expect(page.getByText('Icono actualizado.')).toBeVisible({ timeout: 10_000 })
    const avatar = page.locator('[data-slot="sheet-content"] [data-testid="client-avatar"]').first()
    await expect(avatar).toHaveAttribute('data-avatar-state', 'image', { timeout: 10_000 })
  })

  test('a fetch failure shows an explanatory toast and clears any icon', async ({ page }) => {
    await login(page)
    await openDetailFor(page, unreachableClient.name)

    await page.locator('[data-testid="favicon-refresh-button"]').click()
    await expect(page.getByText('No se pudo contactar con la web del cliente.')).toBeVisible({ timeout: 10_000 })

    const avatar = page.locator('[data-slot="sheet-content"] [data-testid="client-avatar"]').first()
    await expect(avatar).toHaveAttribute('data-avatar-state', 'initials')
  })

  test('the button is absent for the protected unassigned client', async ({ page }) => {
    await login(page)
    await openDetailFor(page, 'Sin determinar')
    await expect(page.locator('[data-testid="favicon-refresh-button"]')).toHaveCount(0)
  })
})

test.describe('client detail sheet header layout', () => {
  test('the status badge sits to the right of the name, vertically centered, at desktop and 390px', async ({ page }) => {
    await login(page)

    for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size)
      await page.goto('/clients')
      await page.waitForLoadState('networkidle')
      await openClientRow(page, fixtureClient.name)

      const name = page.locator('[data-testid="detail-client-name"]')
      const badge = page.locator('[data-testid="detail-client-status-badge"]')
      await expect(name).toBeVisible()
      await expect(badge).toBeVisible()

      const nameBox = await name.boundingBox()
      const badgeBox = await badge.boundingBox()
      expect(nameBox && badgeBox, `at ${size.width}px both the name and badge must have a bounding box`).toBeTruthy()

      // Badge sits to the right of the name.
      expect(badgeBox!.x, `at ${size.width}px the badge must be to the right of the name`).toBeGreaterThanOrEqual(nameBox!.x + nameBox!.width - 1)

      // Vertical centers within ~6px of each other.
      const nameCenterY = nameBox!.y + nameBox!.height / 2
      const badgeCenterY = badgeBox!.y + badgeBox!.height / 2
      expect(Math.abs(nameCenterY - badgeCenterY), `at ${size.width}px the badge must be vertically centered with the name`).toBeLessThanOrEqual(6)

      // Never pushed off-screen.
      expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(size.width)
    }
  })

  test('the protected client keeps its lock indicator next to the badge', async ({ page }) => {
    await login(page)
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')
    await openClientRow(page, 'Sin determinar')
    await expect(page.locator('[data-slot="sheet-content"] svg[class*="lucide-lock"]').first()).toBeVisible()
  })
})

test.describe('client detail sheet focus', () => {
  test('initial focus lands on the sheet title, not the website link, and the link ring hugs its text', async ({ page }) => {
    await login(page)
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')
    await openClientRow(page, 'Cajamar')

    const focusedTestId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
    expect(focusedTestId).toBe('detail-client-name')

    // The focused element's own box must be the (truncated) title's box,
    // not a full-width box spanning the sheet — this is the regression
    // the block-level website link used to cause.
    const nameBox = await page.locator('[data-testid="detail-client-name"]').boundingBox()
    const sheetBox = await page.locator('[data-slot="sheet-content"]').boundingBox()
    expect(nameBox && sheetBox).toBeTruthy()
    expect(nameBox!.width, 'the focused title must not span the full sheet width').toBeLessThan(sheetBox!.width * 0.9)

    // The website link itself is inline-flex, so its own box hugs the
    // link text rather than stretching full width.
    const link = page.locator('[data-slot="sheet-content"] a', { hasText: 'cajamar.es' })
    const linkBox = await link.boundingBox()
    expect(linkBox).toBeTruthy()
    expect(linkBox!.width, 'the website link must hug its text, not span the sheet').toBeLessThan(sheetBox!.width * 0.9)
  })
})

test.describe('mobile viewport (390px)', () => {
  test('clients page and detail sheet never overflow horizontally', async ({ page }) => {
    await login(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(200)

    let overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth)

    await openClientRow(page, fixtureClient.name)
    await page.waitForTimeout(200)

    overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
    expect(overflow.scrollWidth, 'the open detail sheet must not overflow the 390px viewport').toBeLessThanOrEqual(overflow.innerWidth)
  })
})
