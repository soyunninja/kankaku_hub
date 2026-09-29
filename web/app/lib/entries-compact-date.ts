/** Pure Entries-only date display and text-filter conversions. */

export type ShortFilterDateResult =
  | { status: 'valid', value: string }
  | { status: 'clear' }
  | { status: 'invalid' }

function calendarDateIsValid(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= days[month - 1]!
}

/** Parse exactly YY/MM/DD as a local calendar day in 2000–2099. Empty means clear; whitespace is invalid. */
export function parseShortFilterDate(input: string): ShortFilterDateResult {
  if (input === '') return { status: 'clear' }
  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(input)
  if (!match) return { status: 'invalid' }
  const year = 2000 + Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!calendarDateIsValid(year, month, day)) return { status: 'invalid' }
  return { status: 'valid', value: `${year}-${match[2]}-${match[3]}` }
}

/** Display an existing ISO local-day filter. Empty remains empty; malformed/out-of-range days show —. */
export function formatShortFilterDate(isoDay: string): string {
  if (isoDay === '') return ''
  const match = /^(20\d{2})-(\d{2})-(\d{2})$/.exec(isoDay)
  if (!match || !calendarDateIsValid(Number(match[1]), Number(match[2]), Number(match[3]))) return '—'
  return `${match[1]!.slice(2)}/${match[2]}/${match[3]}`
}

/** Display a stored UTC instant in the viewer's zone; invalid/missing instants show —. */
export function formatCompactEntryDateTime(
  instant: string,
  timeZone?: string,
): string {
  // Require an explicit offset (including Z): timestamps without one are not UTC instants.
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(instant)
  if (!match) return '—'
  const [, year, month, day, hour, minute, second, , offset] = match
  if (!calendarDateIsValid(Number(year), Number(month), Number(day))
    || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return '—'
  if (offset !== 'Z' && (Number(offset!.slice(1, 3)) > 23 || Number(offset!.slice(4)) > 59)) return '—'
  const date = new Date(instant.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return '—'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: string) => parts.find(p => p.type === type)?.value
  return `${part('year')}/${part('month')}/${part('day')} ${part('hour')}:${part('minute')}`
}
