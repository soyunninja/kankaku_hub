import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { apiLogin, deleteClientsByCode, login, setTheme } from './helpers'

// Cleans up the disposable clients this spec creates, so a leftover long
// generated name/code never inflates the clients table's columns across
// test runs. Talks directly to PocketBase (never through the app's own
// baseURL — see the note in helpers.ts) via the centralized `pbUrl()` /
// `deleteClientsByCode()` helpers, never a locally hardcoded origin —
// this spec used to default to its own `PB_URL` (a different port than
// helpers.ts's `pbOrigin()`), which is exactly the kind of scatter that
// has caused accidental writes to the owner's live database before.
const createdClientCodes: string[] = []

test.afterEach(async ({ request }) => {
  const codes = createdClientCodes.splice(0, createdClientCodes.length)
  if (codes.length === 0) return
  const token = await apiLogin(request)
  await deleteClientsByCode(request, token, codes)
})

/**
 * The official shadcn-vue SheetContent carries no padding of its own
 * (only SheetHeader/SheetFooter do — see
 * app/components/ui/sheet/SheetContent.vue), so any page that puts body
 * content directly inside a <SheetContent> must wrap it in its own padded
 * container or the content touches the sheet's edges. Asserts that the
 * sheet's first content element sits at least 16px from the sheet's left
 * edge, regardless of viewport width or theme.
 */
async function expectSheetContentIsPadded(page: Page) {
  const sheet = page.locator('[data-slot="sheet-content"]')
  await expect(sheet).toBeVisible()
  // The sheet slides in over `duration-500` (see SheetContent.vue); wait
  // for that transform animation to settle before reading geometry,
  // otherwise the mid-slide transform makes it meaningless.
  await page.waitForTimeout(600)

  // The direct child of SheetContent is the padded/scrollable wrapper
  // (`px-6 ...`) added on top of the official SheetContent, which itself
  // has no padding. A padding-left/right on that wrapper shifts its
  // CHILDREN inward, not its own box (padding is inside the border box) —
  // so read the computed style directly rather than comparing bounding
  // boxes, which would just measure the same left edge as its parent.
  const wrapper = sheet.locator(':scope > div').first()
  const paddingLeft = await wrapper.evaluate(el => Number.parseFloat(getComputedStyle(el).paddingLeft))
  expect(paddingLeft, 'the sheet body wrapper must have left padding of at least 16px').toBeGreaterThanOrEqual(16)

  // Cross-check with real rendered geometry: the first actual content
  // element (grandchild of SheetContent) must sit well inside the sheet's
  // own left edge.
  const sheetBox = await sheet.boundingBox()
  const firstContentBox = await wrapper.locator(':scope > *').first().boundingBox()
  expect(sheetBox, 'sheet must have a bounding box').not.toBeNull()
  expect(firstContentBox, 'first content element must have a bounding box').not.toBeNull()
  const leftOffset = firstContentBox!.x - sheetBox!.x
  expect(leftOffset, 'the first content element must be padded at least 16px from the sheet\'s left edge').toBeGreaterThanOrEqual(16)
}

/**
 * End-to-end coverage for the clients "contact" fields (website,
 * contact_email, contact_phone, notes) added to CATMGMT-REQ-006..009 (see
 * docs/specs/web-catalog-management.md). Drives everything through the UI
 * (no direct `/api/...` calls) because in `nuxt dev` mode the dev server's
 * own SPA fallback answers any unmatched path with 200 + HTML, not
 * PocketBase's JSON — see the CI-facing note in playwright.config.ts /
 * e2e/helpers.ts. All assertions therefore go through what the owner
 * actually sees.
 */

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
}

test('creating a client with all four contact fields shows them in the list and detail sheet', async ({ page }) => {
  await login(page)
  await page.goto('/clients')
  await page.waitForLoadState('networkidle')

  const suffix = uniqueSuffix()
  const name = `E2E Contact Client ${suffix}`
  const code = `e2e-contact-${suffix}`
  createdClientCodes.push(code)

  await page.getByRole('button', { name: /nuevo cliente|new client/i }).click()
  await expect(page.locator('#c-name')).toBeVisible()

  await page.fill('#c-name', name)
  await page.fill('#c-code', code)
  // Typed without a scheme — the @blur handler must normalize it.
  await page.fill('#c-website', 'example-e2e.test')
  await page.locator('#c-website').blur()
  await expect(page.locator('#c-website')).toHaveValue('https://example-e2e.test')

  await page.fill('#c-contact-email', 'owner@example-e2e.test')
  await page.fill('#c-contact-phone', '  +34 600 111 222  ')
  await page.fill('#c-notes', 'First line of notes.\nSecond line of notes.')

  await page.getByRole('button', { name: /^guardar$|^save$/i }).click()

  // Dialog closes on a successful save.
  await expect(page.locator('#c-name')).toBeHidden()

  const row = page.locator('table tbody tr', { hasText: name })
  await expect(row).toBeVisible()
  // Website, email and phone are not shown in the table anymore — only in
  // the detail sheet and the edit dialog. Notes are never shown inline in
  // the table either — only an indicator icon next to the name.
  await expect(row).not.toContainText('example-e2e.test')
  await expect(row).not.toContainText('owner@example-e2e.test')
  await expect(row).not.toContainText('First line of notes')

  // Open the detail sheet from the row and check website (as an external
  // link, without its scheme), email (mailto: link), phone (tel: link,
  // trimmed) and notes all render there, with the notes' line break
  // preserved (plain text, not v-html).
  await row.locator('td').first().click()
  const sheet = page.locator('[data-slot="sheet-content"]')
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText(name)
  await expect(sheet.getByRole('link', { name: 'example-e2e.test', exact: true })).toBeVisible()
  await expect(sheet.getByRole('link', { name: 'owner@example-e2e.test' })).toHaveAttribute('href', 'mailto:owner@example-e2e.test')
  await expect(sheet.getByRole('link', { name: '+34 600 111 222' })).toHaveAttribute('href', 'tel:+34 600 111 222')

  const notesText = await sheet.locator('p.whitespace-pre-wrap').first().textContent()
  expect(notesText).toContain('First line of notes.')
  expect(notesText).toContain('Second line of notes.')
  expect(notesText).toMatch(/First line of notes\.\s*\nSecond line of notes\./)

  await page.keyboard.press('Escape')
})

test('editing a client preserves and updates contact fields', async ({ page }) => {
  await login(page)
  await page.goto('/clients')
  await page.waitForLoadState('networkidle')

  const suffix = uniqueSuffix()
  const name = `E2E Edit Client ${suffix}`
  const code = `e2e-edit-${suffix}`
  createdClientCodes.push(code)

  await page.getByRole('button', { name: /nuevo cliente|new client/i }).click()
  await page.fill('#c-name', name)
  await page.fill('#c-code', code)
  await page.fill('#c-website', 'https://before-edit.test')
  await page.fill('#c-contact-email', 'before@example.test')
  await page.getByRole('button', { name: /^guardar$|^save$/i }).click()
  await expect(page.locator('#c-name')).toBeHidden()

  const row = page.locator('table tbody tr', { hasText: name })
  await row.getByRole('button', { name: /^editar$|^edit$/i }).click()

  // Pre-filled with the existing values.
  await expect(page.locator('#c-website')).toHaveValue('https://before-edit.test')
  await expect(page.locator('#c-contact-email')).toHaveValue('before@example.test')

  await page.fill('#c-website', 'after-edit.test')
  await page.locator('#c-website').blur()
  await page.fill('#c-contact-email', 'after@example.test')
  await page.getByRole('button', { name: /^guardar$|^save$/i }).click()
  await expect(page.locator('#c-name')).toBeHidden()

  // Website and email are no longer shown in the table — open the detail
  // sheet and check the updated values render there instead.
  await row.locator('td').first().click()
  const sheet = page.locator('[data-slot="sheet-content"]')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('link', { name: 'after-edit.test', exact: true })).toBeVisible()
  await expect(sheet.getByRole('link', { name: 'after@example.test' })).toBeVisible()
})

test('invalid email and invalid website show inline errors and block submit', async ({ page }) => {
  await login(page)
  await page.goto('/clients')
  await page.waitForLoadState('networkidle')

  const suffix = uniqueSuffix()

  await page.getByRole('button', { name: /nuevo cliente|new client/i }).click()
  await page.fill('#c-name', `E2E Invalid Client ${suffix}`)
  await page.fill('#c-code', `e2e-invalid-${suffix}`)
  // Already has a scheme (javascript:), so normalizeWebsiteUrl leaves it
  // untouched — validation must still reject it (never a clickable link).
  await page.fill('#c-website', 'javascript:alert(1)')
  await page.fill('#c-contact-email', 'not-an-email')

  await page.getByRole('button', { name: /^guardar$|^save$/i }).click()

  // Dialog stays open — client-side validation blocked the submit.
  await expect(page.locator('#c-name')).toBeVisible()
  await expect(page.getByText(/introduce una url válida|enter a valid url/i)).toBeVisible()
  await expect(page.getByText(/introduce un email válido|enter a valid email/i)).toBeVisible()

  await page.keyboard.press('Escape')
})

test('Sin determinar stays protected: edit/archive controls are disabled', async ({ page }) => {
  await login(page)
  await page.goto('/clients')
  await page.waitForLoadState('networkidle')

  const row = page.locator('table tbody tr', { hasText: /sin determinar/i })
  await expect(row).toBeVisible()
  await expect(row.getByRole('button', { name: /^editar$|^edit$/i })).toBeDisabled()
  await expect(row.getByRole('button', { name: /^archivar$|^archive$/i })).toBeDisabled()
})

test('clients screen has no horizontal page overflow at 390px', async ({ page }) => {
  await login(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/clients')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'the clients page must not cause the document to scroll horizontally at 390px').toBeLessThanOrEqual(1)
})

test('at 1280px the row actions (archive/edit) are visible without scrolling the table', async ({ page }) => {
  await login(page)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/clients')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)

  const viewport = page.viewportSize()!
  const archiveButton = page.locator('table tbody tr').first().getByRole('button', { name: /^archivar$|^reactivar$|^archive$|^unarchive$/i })
  await expect(archiveButton).toBeVisible()
  const box = await archiveButton.boundingBox()
  expect(box, 'archive button must have a bounding box').not.toBeNull()
  expect(box!.x + box!.width, 'the archive button must be fully within the 1280px viewport, not scrolled off to the right').toBeLessThanOrEqual(viewport.width)
})

test.describe('sheet body is padded (not glued to the edges)', () => {
  for (const width of [1280, 390]) {
    for (const theme of ['dark', 'light'] as const) {
      test(`clients detail sheet at ${width}px, ${theme} theme`, async ({ page }) => {
        await login(page)
        await setTheme(page, theme)
        await page.setViewportSize({ width, height: width === 390 ? 844 : 720 })
        await page.goto('/clients')
        await page.waitForLoadState('networkidle')

        const row = page.locator('table tbody tr').first()
        await row.locator('td').first().click()
        await expectSheetContentIsPadded(page)
      })

      test(`entries detail sheet at ${width}px, ${theme} theme`, async ({ page }) => {
        await login(page)
        await setTheme(page, theme)
        await page.setViewportSize({ width, height: width === 390 ? 844 : 720 })
        await page.goto('/entries')
        await page.waitForLoadState('networkidle')

        const row = page.locator('table tbody tr').first()
        await row.locator('td').first().click()
        await expectSheetContentIsPadded(page)
      })
    }
  }
})
