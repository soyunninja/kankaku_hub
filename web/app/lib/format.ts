/**
 * Pure formatting helpers for durations, cost and tokens. No i18n calls
 * here on purpose (composables that need locale-aware output wrap these);
 * this module must stay importable from plain Vitest without a Nuxt
 * context.
 */

/**
 * Locale-specific duration unit labels. Every non-Japanese locale (the
 * `default` entry) keeps the original Latin unit letters (`h`/`m`/`s`),
 * joined with a space in the non-compact form — this is what
 * `formatDuration`/`formatDurationCompact` always produced before locale
 * awareness was added, so existing call sites and tests that don't pass a
 * `locale` keep their exact output.
 */
const DURATION_UNITS: Record<string, { h: string, m: string, s: string, join: string }> = {
  default: { h: 'h', m: 'm', s: 's', join: ' ' },
  ja: { h: '時間', m: '分', s: '秒', join: '' },
}

function durationUnitsFor(locale: string) {
  return DURATION_UNITS[locale.split('-')[0] ?? ''] ?? DURATION_UNITS.default!
}

/**
 * Format a millisecond duration as `1h 30m`, `2h`, `45m`, `12s`, `0s`
 * (default/`en`/`es`), or the Japanese equivalent (`1時間30分`, `2時間`,
 * `45分`, `12秒`, `0秒`) when `locale` is `ja`/`ja-JP`. `locale` defaults to
 * `'en'` (Latin units) so existing callers that don't pass one see no
 * behavior change.
 */
export function formatDuration(ms: number, locale = 'en'): string {
  const u = durationUnitsFor(locale)
  if (!Number.isFinite(ms) || ms <= 0) return `0${u.s}`

  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return minutes > 0 ? `${hours}${u.h}${u.join}${minutes}${u.m}` : `${hours}${u.h}`
  }
  if (minutes > 0) {
    return `${minutes}${u.m}`
  }
  return `${seconds}${u.s}`
}

/**
 * Format a compact duration for tight spaces (charts/tables): `1h23m`,
 * `45m`, `12s` (default/`en`/`es`), or `1時間23分` / `45分` / `12秒` for
 * `ja`. Always joined with no separator, which is also already Japanese's
 * natural form, so `locale` only changes the unit labels here.
 */
export function formatDurationCompact(ms: number, locale = 'en'): string {
  const u = durationUnitsFor(locale)
  if (!Number.isFinite(ms) || ms <= 0) return `0${u.s}`
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}${u.h}${minutes}${u.m}`
  if (minutes > 0) return `${minutes}${u.m}`
  return `${seconds}${u.s}`
}

/**
 * Format a token-cost number as USD. Cost is provider token cost, always
 * USD (D8: no rates/prices — this is the only money-shaped field that
 * exists, and it is a measured cost, not a price).
 *
 * Precision rule: amounts of $1 or more use 2 decimals (totals should
 * read as plain money, not float noise); amounts under $1 use up to 4
 * decimals, because per-task costs are routinely a few cents or less and
 * 2 decimals would round many of them down to `$0.00`.
 */
export function formatCost(usd: number): string {
  const value = Number.isFinite(usd) ? usd : 0
  const maximumFractionDigits = Math.abs(value) >= 1 ? 2 : 4
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits,
  })
  return formatter.format(value)
}

/**
 * Format a raw token count with thousands separators, e.g. `12,345`
 * (default/`en-US`) or `12,345` grouped per `locale`'s own convention
 * (e.g. `ja-JP` still groups by thousands — only the compact form below
 * switches to 万-based grouping).
 */
export function formatTokens(count: number, locale = 'en-US'): string {
  const value = Number.isFinite(count) ? Math.round(count) : 0
  return new Intl.NumberFormat(locale).format(value)
}

/**
 * Format a token count compactly for tight spaces: `12.3K`, `1.2M`
 * (default/`en-US`), or `ja-JP`'s native 万-based compact notation (e.g.
 * `81.7万`) when `locale` is `ja`/`ja-JP` — this is correct, idiomatic
 * Japanese for a large count, not a bug to normalize away.
 */
export function formatTokensCompact(count: number, locale = 'en-US'): string {
  const value = Number.isFinite(count) ? count : 0
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/** Format a ratio (0..1 or beyond) as a percentage with one decimal. */
export function formatPercent(ratio: number, locale = 'en-US'): string {
  const value = Number.isFinite(ratio) ? ratio : 0
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}

/** Format a `YYYY-MM-DD` (or full timestamp) as a locale date string. */
export function formatDate(value: string, locale = 'es-ES'): string {
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}

/** Format a `YYYY-MM-DD` (or full timestamp) as a locale date+time string. */
export function formatDateTime(value: string, locale = 'es-ES'): string {
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** Signed percent-change label, e.g. `+12.3%`, `-4.0%`, `n/a` when baseline is 0. */
export function formatDelta(current: number, previous: number): string {
  if (!Number.isFinite(previous) || previous === 0) {
    return current === 0 ? '0%' : 'n/a'
  }
  const ratio = (current - previous) / Math.abs(previous)
  const sign = ratio > 0 ? '+' : ''
  return `${sign}${(ratio * 100).toFixed(1)}%`
}

/**
 * Whether a KPI's change over the previous period should read as good news
 * or bad news when it moves — or neither. A KPI is either:
 * - `lowerIsBetter`: cost, waiting time, avg cost/task. A drop is good
 *   (green), a rise is bad (red).
 * - `neutral`: work time, wall time, task count, token counts. These are
 *   volume, not quality — more or less of them isn't inherently good or
 *   bad, so they never get semantic color, only the arrow direction.
 */
export type MetricPolarity = 'lowerIsBetter' | 'neutral'

export type DeltaTone = 'positive' | 'negative' | 'neutral'

/** Direction of change, independent of tone — used to pick the arrow icon. */
export type DeltaDirection = 'up' | 'down' | 'flat'

export function deltaDirection(current: number, previous: number): DeltaDirection {
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return 'flat'
  if (current === previous) return 'flat'
  return current > previous ? 'up' : 'down'
}

/** Maps a KPI's raw change to a semantic color tone, honoring polarity. */
export function deltaTone(current: number, previous: number, polarity: MetricPolarity): DeltaTone {
  if (polarity === 'neutral') return 'neutral'
  const direction = deltaDirection(current, previous)
  if (direction === 'flat') return 'neutral'
  if (!Number.isFinite(previous) || previous === 0) return 'neutral'
  return direction === 'down' ? 'positive' : 'negative'
}
