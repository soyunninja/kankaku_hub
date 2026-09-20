/**
 * Pure formatting helpers for durations, cost and tokens. No i18n calls
 * here on purpose (composables that need locale-aware output wrap these);
 * this module must stay importable from plain Vitest without a Nuxt
 * context.
 */

/** Format a millisecond duration as `1h 23m`, `45m`, `12s`, or `0s`. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s'

  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  if (minutes > 0) {
    return `${minutes}m`
  }
  return `${seconds}s`
}

/**
 * Format a compact duration for tight spaces (charts/tables): `1h23m`,
 * `45m`, `12s`.
 */
export function formatDurationCompact(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s'
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
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

/** Format a raw token count with thousands separators, e.g. `12,345`. */
export function formatTokens(count: number): string {
  const value = Number.isFinite(count) ? Math.round(count) : 0
  return new Intl.NumberFormat('en-US').format(value)
}

/** Format a token count compactly for tight spaces: `12.3k`, `1.2M`. */
export function formatTokensCompact(count: number): string {
  const value = Number.isFinite(count) ? count : 0
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/** Format a ratio (0..1 or beyond) as a percentage with one decimal. */
export function formatPercent(ratio: number): string {
  const value = Number.isFinite(ratio) ? ratio : 0
  return new Intl.NumberFormat('en-US', {
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
