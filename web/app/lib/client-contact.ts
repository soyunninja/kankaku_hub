/**
 * Pure helpers for the clients form's four optional contact fields
 * (`website`, `contact_email`, `contact_phone`, `notes`). No Nuxt/i18n
 * calls here on purpose — same rule as `app/lib/format.ts`, so this stays
 * importable from plain Vitest.
 */

const SAFE_URL_SCHEMES = new Set(['http:', 'https:'])

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value)
  }
  catch {
    return null
  }
}

/**
 * Normalizes a website value typed without a scheme, e.g. `example.com`
 * -> `https://example.com`. Leaves an already-schemed value untouched
 * (including a non-http one, so validation can reject it explicitly
 * instead of this function silently "fixing" it into something else) and
 * an empty/whitespace-only value as `''`. Meant for an `@blur` handler,
 * not live on every keystroke.
 */
export function normalizeWebsiteUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  // Any `scheme:` prefix (not just `http(s)://`) counts as "already has a
  // scheme" — this must NOT prepend `https://` in front of e.g.
  // `javascript:alert(1)`, which would otherwise turn an unsafe value
  // into something that accidentally parses as a (still unsafe, but
  // differently shaped) URL. isValidWebsiteUrl/isSafeLinkUrl reject
  // anything that isn't http(s) regardless.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

/** Empty is valid (the field is optional); otherwise requires a parseable `http(s)` URL with a host. */
export function isValidWebsiteUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  const url = tryParseUrl(trimmed)
  return url !== null && SAFE_URL_SCHEMES.has(url.protocol) && url.hostname.length > 0
}

/**
 * Whether a stored URL string is safe to render as a clickable link.
 * Only `http:`/`https:` pass — this is what keeps a `javascript:`,
 * `data:`, or any other scheme stored in `website` (e.g. by a future
 * import, or by hand-editing the DB) from ever becoming an `href`.
 */
export function isSafeLinkUrl(value: string): boolean {
  const url = tryParseUrl(value.trim())
  return url !== null && SAFE_URL_SCHEMES.has(url.protocol) && url.hostname.length > 0
}

/**
 * Strips the scheme (and a bare trailing `/`) for compact display, e.g.
 * `https://example.com/` -> `example.com`. Returns the trimmed input
 * unchanged when it isn't a parseable URL — callers should gate rendering
 * with `isSafeLinkUrl` first.
 */
export function displayUrlWithoutScheme(value: string): string {
  const trimmed = value.trim()
  const url = tryParseUrl(trimmed)
  if (!url) return trimmed
  const path = url.pathname === '/' ? '' : url.pathname
  return `${url.host}${path}${url.search}${url.hash}`
}

// Deliberately permissive (mirrors the shape PocketBase's EmailField
// itself accepts closely enough for inline UX) — PocketBase remains the
// source of truth; see `mapPocketBaseFieldErrors` below for surfacing its
// actual verdict.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Empty is valid (the field is optional); otherwise a plausible `local@domain.tld` shape. */
export function isValidEmail(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  return EMAIL_PATTERN.test(trimmed)
}

/** Phone numbers are intentionally free-form (no country/format enforced) — only trims. */
export function normalizePhone(value: string): string {
  return value.trim()
}

interface PocketBaseFieldError {
  code?: string
  message?: string
}

/** Shape of a PocketBase SDK `ClientResponseError`, as far as this helper cares. */
export interface PocketBaseErrorLike {
  data?: {
    data?: Record<string, PocketBaseFieldError | undefined>
  }
}

/**
 * Maps a PocketBase `ClientResponseError`'s field-level validation errors
 * to a flat `{ field: message }` record for inline form errors. See
 * `docs/contract.md` ("What a unique-violation response actually looks
 * like") for the exact response shape this reads
 * (`error.data.data.<field>.message`).
 */
export function mapPocketBaseFieldErrors(error: unknown): Record<string, string> {
  const fieldErrors = (error as PocketBaseErrorLike | undefined)?.data?.data
  if (!fieldErrors || typeof fieldErrors !== 'object') return {}

  const result: Record<string, string> = {}
  for (const [field, info] of Object.entries(fieldErrors)) {
    if (info && typeof info.message === 'string' && info.message) {
      result[field] = info.message
    }
  }
  return result
}
