/**
 * Date-range presets and period comparison, pure and timezone-naive
 * (dates are compared as local calendar days — good enough for a
 * single-owner dashboard; see ESTADO.md for the tradeoff note).
 */

export interface DateRange {
  /** Inclusive, `YYYY-MM-DD`. */
  start: string
  /** Inclusive, `YYYY-MM-DD`. */
  end: string
}

export type PresetKey = 'today' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom'

function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

/** Resolve a preset key to a concrete `DateRange`, relative to `now`. */
export function resolvePreset(preset: Exclude<PresetKey, 'custom'>, now = new Date()): DateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (preset) {
    case 'today':
      return { start: toIsoDate(today), end: toIsoDate(today) }
    case '7d':
      return { start: toIsoDate(addDays(today, -6)), end: toIsoDate(today) }
    case '30d':
      return { start: toIsoDate(addDays(today, -29)), end: toIsoDate(today) }
    case 'thisMonth': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      return { start: toIsoDate(start), end: toIsoDate(today) }
    }
    case 'lastMonth': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end = new Date(today.getFullYear(), today.getMonth(), 0)
      return { start: toIsoDate(start), end: toIsoDate(end) }
    }
  }
}

/** Number of whole days spanned by a range, inclusive on both ends. */
export function rangeLengthDays(range: DateRange): number {
  const start = new Date(`${range.start}T00:00:00`)
  const end = new Date(`${range.end}T00:00:00`)
  const diff = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
  return diff + 1
}

/**
 * The immediately preceding period of the same length, ending the day
 * before `range.start`. Used for the dashboard's "vs previous period"
 * comparison.
 */
export function previousEquivalentPeriod(range: DateRange): DateRange {
  const days = rangeLengthDays(range)
  const start = new Date(`${range.start}T00:00:00`)
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(days - 1))
  return { start: toIsoDate(prevStart), end: toIsoDate(prevEnd) }
}

/** True when `day` (`YYYY-MM-DD`) falls within `range`, inclusive. */
export function isWithinRange(day: string, range: DateRange): boolean {
  return day >= range.start && day <= range.end
}
