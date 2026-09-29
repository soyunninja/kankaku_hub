import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { APIRequestContext, Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

export const screenshotsDir = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', 'docs', 'screenshots')

export const OWNER_EMAIL = 'david@kankaku.local'
export const OWNER_PASSWORD = 'kankaku-dev-owner'

/** The read-only `viewer` demo account `scripts/isolated-stack.sh` creates
 * (odd/tasks/viewer-role.md T1/T2) — never present on the owner's own
 * :8090 instance, only on an isolated stack started with `--seed`. */
export const VIEWER_EMAIL = 'demo@kankaku.local'
export const VIEWER_PASSWORD = 'kankaku-demo-viewer'

/**
 * PocketBase's own absolute origin — mirrors the base-URL resolution
 * `app/plugins/pocketbase.client.ts` does client-side
 * (`NUXT_PUBLIC_PB_URL`, else `http://127.0.0.1:8090`), but re-derived
 * here from `process.env` because this Node-side test code has no
 * `useNuxtApp()`/`useRuntimeConfig()` to read it from.
 *
 * Every raw PocketBase API call from a spec (auth, seeding/cleanup
 * fixtures, etc.) MUST go through this absolute origin, never through
 * `request.post('/api/...')` relative to Playwright's `baseURL`.
 * `baseURL` is the WEB origin (e.g. `localhost:3000` under `nuxt dev`,
 * where Nuxt's dev server and PocketBase are two different ports) — a
 * relative call there silently 404s or hits the wrong server. Under the
 * single-process prod-like mode (`npm run dev`, static build served BY
 * PocketBase) both origins happen to coincide, which is exactly why this
 * class of bug can pass unnoticed in one mode and fail in the other; see
 * ESTADO.md.
 */
export function pbOrigin(): string {
  return (process.env.NUXT_PUBLIC_PB_URL || 'http://127.0.0.1:8090').replace(/\/+$/, '')
}

/** Builds an absolute PocketBase API URL from a path starting with `/api/...`. */
export function pbUrl(apiPath: string): string {
  return `${pbOrigin()}${apiPath.startsWith('/') ? '' : '/'}${apiPath}`
}

/** Authenticates as the seeded owner directly against PocketBase (not
 * through the web app) and returns the auth token, for specs that need
 * to seed/clean up fixture data via the API. */
export async function apiLogin(request: APIRequestContext): Promise<string> {
  return apiLoginAs(request, OWNER_EMAIL, OWNER_PASSWORD)
}

/** Same as `apiLogin`, for an arbitrary account (e.g. `VIEWER_EMAIL`/`VIEWER_PASSWORD`). */
export async function apiLoginAs(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(pbUrl('/api/collections/users/auth-with-password'), {
    data: { identity: email, password },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const body = await res.json()
  return body.token as string
}

/** The env var a spec must explicitly opt into before any e2e helper may
 * create/update/delete a real PocketBase record — see
 * `assertPbWritesAllowed()`. */
export const PB_WRITES_ENV_VAR = 'E2E_ALLOW_PB_WRITES'

/**
 * Write guard for every e2e helper that creates, updates, or deletes a
 * PocketBase record. MUST be the first thing such a helper does.
 *
 * PocketBase writes performed by these specs are real: without this gate
 * a stray `pnpm test:e2e` invocation (or a copy-pasted spec that forgot
 * to point `NUXT_PUBLIC_PB_URL` somewhere else) would silently create and
 * delete records against whatever PB origin `pbOrigin()` resolves to —
 * including the owner's live instance at the default 127.0.0.1:8090, an
 * accident that has already happened twice against this codebase.
 *
 * Always requires the explicit opt-in, regardless of the resolved URL
 * (belt and suspenders) — not only when that URL happens to be 8090 —
 * because a non-8090 URL is only as safe as whoever set it, and the
 * opt-in is one extra env var to set, which is cheap in CI/local scripts.
 */
export function assertPbWritesAllowed(): void {
  const url = pbOrigin()
  if (process.env[PB_WRITES_ENV_VAR] === '1') return
  throw new Error(
    `Refusing to write to PocketBase at ${url}: this e2e helper creates, `
    + `updates, or deletes real records. Set ${PB_WRITES_ENV_VAR}=1 to `
    + 'explicitly opt in — only ever against an isolated PocketBase '
    + 'instance you started yourself, never against the owner\'s live '
    + 'instance (the default http://127.0.0.1:8090).',
  )
}

/** These fixture specs may mutate only a matching isolated web/PB pair (:3002/:8092 or :3003/:8093). */
export function assertIsolatedFixtureStack(): void {
  const web = process.env.PW_BASE_URL
  const pocketbase = pbOrigin()
  const isolatedPair = (web === 'http://127.0.0.1:3002' && pocketbase === 'http://127.0.0.1:8092')
    || (web === 'http://127.0.0.1:3003' && pocketbase === 'http://127.0.0.1:8093')
  if (!isolatedPair) {
    throw new Error(`Refusing fixture writes: expected isolated :3002/:8092 or :3003/:8093, got ${web ?? '(unset)'} / ${pocketbase}`)
  }
  assertPbWritesAllowed()
}

/** Creates a disposable client record for a spec's own fixtures. Guarded
 * by `assertPbWritesAllowed()` — see its docs. */
export async function createClientRecord(
  request: APIRequestContext,
  token: string,
  data: { name: string, code: string, website?: string, [key: string]: unknown },
): Promise<{ id: string, name: string, code: string }> {
  assertPbWritesAllowed()
  const res = await request.post(pbUrl('/api/collections/clients/records'), {
    headers: { Authorization: token },
    data: { active: true, unassigned: false, ...data },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const body = await res.json()
  return { id: body.id, name: body.name, code: body.code }
}

/** Deletes a client record by id. Guarded by `assertPbWritesAllowed()` —
 * see its docs. */
export async function deleteClientRecord(request: APIRequestContext, token: string, id: string): Promise<void> {
  assertPbWritesAllowed()
  await request.delete(pbUrl(`/api/collections/clients/records/${id}`), { headers: { Authorization: token } })
}

/** Deletes every client record matching any of the given `code`s — used
 * by specs to clean up disposable fixtures they created during a test.
 * Guarded by `assertPbWritesAllowed()` — see its docs. */
export async function deleteClientsByCode(request: APIRequestContext, token: string, codes: string[]): Promise<void> {
  if (codes.length === 0) return
  assertPbWritesAllowed()
  for (const code of codes) {
    const filter = encodeURIComponent(`code="${code}"`)
    const listRes = await request.get(pbUrl(`/api/collections/clients/records?filter=${filter}`), {
      headers: { Authorization: token },
    })
    if (!listRes.ok()) continue
    const body = await listRes.json()
    const items = body.items as { id: string }[]
    for (const item of items) {
      await request.delete(pbUrl(`/api/collections/clients/records/${item.id}`), { headers: { Authorization: token } })
    }
  }
}

export interface ApiClientRecord { id: string, name: string, unassigned: boolean, active: boolean }

/** Finds the protected "Sin determinar" client and one active, assignable
 * client from the seeded demo data — the pair most fixture-driven specs
 * need (a safe assignment destination, and the unassigned bucket). */
export async function findClients(request: APIRequestContext, token: string): Promise<{ unassigned: ApiClientRecord, target: ApiClientRecord }> {
  const res = await request.get(pbUrl('/api/collections/clients/records?perPage=200'), {
    headers: { Authorization: token },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  const items = body.items as ApiClientRecord[]
  const unassigned = items.find(c => c.unassigned)
  const target = items.find(c => !c.unassigned && c.active)
  if (!unassigned || !target) throw new Error('Seed data must include an unassigned client and at least one active client')
  return { unassigned, target }
}

/**
 * Locates toast text scoped to the visible toast viewport
 * (`[data-testid="toast-viewport"]`, `app/components/ui/toast/Toaster.vue`).
 * A toast's text is now ALSO mirrored into an always-mounted
 * `sr-only` live region for screen readers (a11y finding), so a bare
 * `page.getByText(...)` matches twice and fails Playwright's strict
 * mode — every spec asserting on toast content must go through this
 * helper instead.
 */
export function toastText(page: Page, text: string | RegExp) {
  return page.locator('[data-testid="toast-viewport"]').getByText(text)
}

/** Exclude the search input, which also has role combobox while the list is open. */
export function comboboxTrigger(page: Page, name: string): Locator {
  return page.getByRole('combobox', { name, exact: true }).and(page.locator('[data-slot="combobox-trigger"]'))
}

/** Scope options to the portaled list containing this control's named search input. */
export function comboboxList(page: Page, name: string): Locator {
  const input = page.getByRole('combobox', { name, exact: true }).and(page.locator('[data-slot="command-input"]'))
  return page.locator('[data-slot="combobox-list"]').filter({ has: input })
}

/** Pick a visible catalog label from this control's list, not its private item value. */
export async function selectCombobox(trigger: Locator, label: string): Promise<void> {
  const triggerButton = trigger.and(trigger.page().locator('[data-slot="combobox-trigger"]'))
  const name = await triggerButton.getAttribute('aria-label')
  if (!name) throw new Error('Combobox trigger must have an aria-label to identify its list')
  const list = comboboxList(trigger.page(), name)
  await triggerButton.click()
  const option = list.getByRole('option', { name: label, exact: true })
  await expect(option).toBeVisible()
  await option.click()
  await expect(triggerButton).toContainText(label)
  await expect(list).toBeHidden()
}

/**
 * Entries screen key (`app/pages/entries/index.vue`): `'0'` forces flat
 * (per-entry rows), `'1'` forces grouped, and an absent key defaults to
 * grouped since 2026-09-22 (owner decision — see the page's own doc
 * comment). Tests that exercise per-entry rows — clicking a row to open
 * `EntryDetailSheet`, asserting a flat row count — must opt into flat
 * explicitly rather than relying on a default that can change again.
 *
 * Sets the key via `page.addInitScript`, so it lands before the page's
 * own `onMounted` reads it on the FIRST navigation this page performs —
 * call it before `page.goto(...)`, not after.
 */
export async function useFlatEntriesView(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('kankaku-entries-group-by-session', '0')
  })
}

export async function login(page: Page) {
  await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD)
}

/** Same as `login`, for an arbitrary account (e.g. `VIEWER_EMAIL`/`VIEWER_PASSWORD`). */
export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  await page.waitForURL('/')
}

export async function setTheme(page: Page, theme: 'dark' | 'light' | 'system') {
  await page.evaluate((t) => {
    localStorage.setItem('kankaku-color-mode', t)
  }, theme)
  await page.reload()
  await page.waitForLoadState('networkidle')
  if (theme !== 'system') {
    await expect(page.locator('html')).toHaveClass(theme)
  }
}

/**
 * Screenshots the current page for docs/screenshots/. The app shell now
 * scrolls internally (sticky, full-height sidebar next to a scrolling
 * content area — see app/layouts/default.vue), which fixes the real bug
 * where a fixed-position sidebar stopped at one viewport height on long
 * pages. That same fix means Playwright's `fullPage: true` (which
 * measures the *document's* scroll height, not an inner scroll
 * container's) would now only capture one viewport of content. So
 * instead: measure the content area's actual scrollHeight and grow the
 * viewport to fit it before shooting, then restore the viewport. At the
 * grown viewport height the `h-dvh` sidebar naturally stretches to match,
 * so it still renders full-height in the screenshot.
 */
export async function shoot(page: Page, name: string) {
  // Screenshots end up in the docs and on the public site: never include the
  // Nuxt DevTools pill that `nuxt dev` injects at the bottom of the page.
  await page.addStyleTag({ content: '#nuxt-devtools-container, nuxt-devtools-frame { display: none !important; }' })
  await page.waitForTimeout(300)
  const original = page.viewportSize()
  const contentHeight = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="scroll-area"]')
    return el ? el.scrollHeight : document.body.scrollHeight
  })
  if (original && contentHeight > original.height) {
    await page.setViewportSize({ width: original.width, height: Math.min(contentHeight + 20, 10_000) })
    await page.waitForTimeout(200)
  }
  await page.screenshot({ path: path.join(screenshotsDir, `${name}.png`) })
  if (original) {
    await page.setViewportSize(original)
  }
}
