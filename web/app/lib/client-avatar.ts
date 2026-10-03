/**
 * Pure helpers for ClientAvatar/ClientName: deterministic initials and
 * background color derived from a client, plus the cache-busted favicon
 * URL helper. No Nuxt/DOM/PocketBase-SDK calls here on purpose — same
 * rule as `app/lib/client-contact.ts` and `app/lib/format.ts`, so this
 * stays importable from plain Vitest.
 */

/**
 * Up to two uppercase initials derived from a client name, deterministic
 * given the same input (one initial per word, first two words). Falls
 * back to `'?'` for an empty/whitespace-only name.
 */
export function clientInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const initials = words
    .slice(0, 2)
    .map(word => [...word][0]?.toUpperCase() ?? '')
    .join('')
  return initials || '?'
}

// ---------------------------------------------------------------------
// Deterministic background color
// ---------------------------------------------------------------------

/**
 * The five accent hues the app already uses for chart series
 * (`--chart-1`..`--chart-5` in `app/assets/css/tailwind.css`) are reused
 * here as the avatar palette instead of inventing new colors, so an
 * avatar reads as part of the same design system as the dashboard's
 * charts. `avatarColorVar` returns a `var(--chart-N)` reference (not a
 * hardcoded hex), so `ClientAvatar.vue` stays theme-aware automatically —
 * both the light and dark values of each `--chart-N` token were verified
 * for contrast against `--avatar-foreground`, see
 * `CHART_OKLCH_BY_THEME`/`avatarForegroundContrast` below and
 * `client-avatar.test.ts`.
 */
export const AVATAR_PALETTE_SIZE = 5

/** Deterministic (non-cryptographic) string hash: the same client id
 * always maps to the same palette index, spread reasonably evenly across
 * a small palette. */
function hashToIndex(value: string, size: number): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % size
}

/** `var(--chart-N)` for the accent color this client id maps to. */
export function avatarColorVar(clientId: string): string {
  const index = hashToIndex(clientId, AVATAR_PALETTE_SIZE)
  return `var(--chart-${index + 1})`
}

/**
 * The CSS custom property `ClientAvatar.vue` uses as the initials'
 * foreground color: a fixed near-black, declared once on `:root` in
 * `tailwind.css` and deliberately NOT overridden under `.dark` (see that
 * file). Unlike `--foreground` (which flips to near-white in dark mode),
 * this must stay dark in both themes because every `--chart-N` avatar
 * background is mid-to-high lightness in both themes too — see
 * `avatarForegroundContrast`.
 */
export const AVATAR_FOREGROUND_VAR = 'var(--avatar-foreground)'

// ---------------------------------------------------------------------
// Contrast verification (oklch -> linear sRGB -> WCAG contrast ratio)
// ---------------------------------------------------------------------

/**
 * The light/dark `oklch(L C H)` triples for `--chart-1`..`--chart-5`,
 * copied from `app/assets/css/tailwind.css` (kept in sync manually if
 * that palette ever changes — same convention as `docs/proposal.md`'s
 * own "copy, kept in sync manually" header). This lets
 * `avatarForegroundContrast` actually compute, rather than merely
 * assert, that `--avatar-foreground` meets WCAG AA (4.5:1) against every
 * one of these ten backgrounds — see `client-avatar.test.ts`. The light
 * chart-1 is the Gentleman-Sexy pink accent (#F43888) and chart-5 is
 * champagne (#E0C27A, moved off pink so it stays distinct from chart-1);
 * chart-2/3/4 are unchanged. Dark chart-1 matches light chart-1;
 * dark champagne/powderBlue/mint/peach remain unchanged.
 * `tests/dark-palette.test.ts` guards this array against both `:root`'s
 * and `.dark`'s `--chart-1..5` in tailwind.css directly.
 */
export const CHART_OKLCH_BY_THEME: Record<'light' | 'dark', Array<[number, number, number]>> = {
  light: [
    [0.65, 0.228, 1],
    [0.65, 0.15, 40],
    [0.6, 0.1, 280],
    [0.7, 0.14, 140],
    [0.824, 0.097, 88],
  ],
  dark: [
    [0.65, 0.228, 1],
    [0.824, 0.097, 88],
    [0.821, 0.064, 255],
    [0.884, 0.068, 157],
    [0.82, 0.114, 72],
  ],
}

/**
 * `oklch(L C H)` -> linear-light sRGB, per Björn Ottosson's reference
 * conversion (https://bottosson.github.io/posts/oklab/). Output channels
 * are clamped to `[0, 1]`.
 */
export function oklchToLinearSrgb(l: number, c: number, hDeg: number): [number, number, number] {
  const hRad = (hDeg * Math.PI) / 180
  const a = c * Math.cos(hRad)
  const b = c * Math.sin(hRad)

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b

  const l3 = l_ ** 3
  const m3 = m_ ** 3
  const s3 = s_ ** 3

  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3

  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  return [clamp(r), clamp(g), clamp(bl)]
}

/** WCAG relative luminance from already-linear-light RGB channels (each `0..1`). */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two relative luminances (order-independent). */
export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Computed WCAG contrast ratio between `--avatar-foreground` (a fixed
 * near-black — relative luminance `0`, see `AVATAR_FOREGROUND_VAR`) and
 * a `--chart-N` background given as `oklch(L C H)`.
 */
export function avatarForegroundContrast(l: number, c: number, hDeg: number): number {
  const luminance = relativeLuminance(oklchToLinearSrgb(l, c, hDeg))
  return contrastRatio(0, luminance)
}

// ---------------------------------------------------------------------
// Cache-busted favicon URL
// ---------------------------------------------------------------------

/**
 * Appends a cache-busting query param derived from a record's `updated`
 * timestamp to an already-built PocketBase file URL (built the normal
 * SDK way — `pb.files.getURL(record, record.favicon)` — see
 * `ClientAvatar.vue`), so a freshly refreshed icon is reflected without a
 * hard reload: a changed URL is a different browser cache entry. The
 * param's name/value carry no meaning to PocketBase's raw file-download
 * route (it ignores unknown query params — verified against
 * `docs/contract.md`'s file-field description), so any value that
 * changes whenever `updated` changes works; `v` is used for brevity.
 * Returns the input unchanged when `url` or `updated` is empty (no
 * favicon to cache-bust).
 */
export function withCacheBust(url: string, updated: string): string {
  if (!url || !updated) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}v=${encodeURIComponent(updated)}`
}
