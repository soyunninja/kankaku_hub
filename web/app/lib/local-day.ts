/**
 * A "day" in this app is always the VIEWER'S LOCAL calendar day — what a
 * person means by "today" (kankaku's own `localDay` uses the same rule).
 * `task_entries.started_at`/`ended_at` are stored as UTC instants
 * (`docs/contract.md` "Gotchas for the sync client author"), so every
 * local-day boundary must be converted to a UTC instant before it is sent
 * to PocketBase as a filter, and every stored UTC instant must be
 * converted back to a local day before it is used as a chart/report
 * bucket key. Mixing the two (building a filter from a local date string
 * as if it were already UTC, or bucketing a UTC instant by slicing its
 * first 10 characters) puts an entry near local midnight on a different
 * "day" on different screens — see docs/contract.md "Day boundaries are
 * local, not UTC" and the MAJOR finding this module fixes.
 *
 * Pure, no Vue/PocketBase — importable from plain Vitest. The IANA
 * `timeZone` parameter is injectable (defaults to the browser's own zone)
 * so tests can assert UTC+9, UTC-8, UTC and DST-transition behaviour
 * without depending on the host machine's zone.
 */

function defaultTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** The UTC offset (in ms, UTC-instant-minus-local-instant sign per `Date.UTC`
 * convention: `localWallClockAsUtc - trueUtcInstant`) in effect for `date`
 * in `timeZone`, derived from the real calendar via `Intl` so DST
 * transitions are handled correctly instead of assuming a fixed offset. */
function tzOffsetMs(date: Date, timeZone: string): number {
  // `Intl.DateTimeFormat` has no sub-second precision, so compute the
  // offset from a second-truncated instant on both sides of the
  // subtraction — otherwise a `date` carrying a non-zero millisecond
  // (e.g. the ":59.999" end-of-day boundary) would compare against a
  // ":00" formatted instant and introduce a spurious ~1s error.
  const truncated = Math.floor(date.getTime() / 1000) * 1000
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(truncated))
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - truncated
}

/**
 * Converts a local wall-clock time (`YYYY-MM-DD` + hour/minute/second/ms)
 * in `timeZone` to the equivalent UTC instant. Iterates twice to converge
 * on the correct offset across a DST transition (the offset at the first
 * guess can differ from the offset that actually applies to the
 * corrected instant, right at the transition boundary).
 */
export function localWallClockToUtc(
  day: string,
  time: { hour: number, minute: number, second: number, ms: number },
  timeZone: string = defaultTimeZone(),
): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const wallClockAsUtc = Date.UTC(y, m - 1, d, time.hour, time.minute, time.second, time.ms)

  let instant = wallClockAsUtc
  for (let i = 0; i < 2; i++) {
    const offsetMs = tzOffsetMs(new Date(instant), timeZone)
    const corrected = wallClockAsUtc - offsetMs
    if (corrected === instant) break
    instant = corrected
  }
  return new Date(instant)
}

/** Formats a `Date` as PocketBase's date-filter string, `"YYYY-MM-DD
 * HH:MM:SS.mmmZ"` (space, not `T` — see docs/contract.md "Gotchas"). */
export function toPbDateFilter(date: Date): string {
  return date.toISOString().replace('T', ' ')
}

/**
 * Converts a `{ start, end }` local-day range (both `YYYY-MM-DD`,
 * inclusive) into the UTC instant strings a PocketBase `started_at`
 * filter needs: local midnight at the start of `start`, and the last
 * millisecond of local `end`.
 */
export function localDateRangeToUtcFilters(
  range: { start: string, end: string },
  timeZone: string = defaultTimeZone(),
): { start: string, end: string } {
  const startUtc = localWallClockToUtc(range.start, { hour: 0, minute: 0, second: 0, ms: 0 }, timeZone)
  const endUtc = localWallClockToUtc(range.end, { hour: 23, minute: 59, second: 59, ms: 999 }, timeZone)
  return { start: toPbDateFilter(startUtc), end: toPbDateFilter(endUtc) }
}

/**
 * Converts a stored UTC instant (PocketBase's `"YYYY-MM-DD
 * HH:MM:SS.mmmZ"` form, or any string `Date` can parse) to its
 * `YYYY-MM-DD` day in `timeZone` — the bucket key for a chart x-axis or
 * a day-grouped total. Uses the `en-CA` locale's `YYYY-MM-DD` formatting
 * rather than hand-building the string, so the same `Intl` machinery
 * that resolves DST for `localWallClockToUtc` resolves it here too.
 */
export function utcInstantToLocalDay(isoUtc: string, timeZone: string = defaultTimeZone()): string {
  const date = new Date(isoUtc.includes('T') ? isoUtc : isoUtc.replace(' ', 'T'))
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** Next local calendar day (`YYYY-MM-DD` + 1 day), as plain calendar
 * arithmetic — timezone-independent (a calendar date's "next day" does
 * not depend on which IANA zone you're labelling it for), the same safe
 * pattern `app/lib/period.ts#addDays` already relies on for local date
 * math. Exported for reuse/testing alongside `buildLocalDayBoundaries`. */
export function nextLocalDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const next = new Date(y, m - 1, d + 1)
  const yy = next.getFullYear()
  const mm = String(next.getMonth() + 1).padStart(2, '0')
  const dd = String(next.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * Builds the `day_boundaries` array POST /api/kankaku/totals'
 * `group_by: 'day'` expects for a local-day range, plus the local day
 * label for each bucket (`labels[i]` is the local `YYYY-MM-DD` day that
 * `boundaries[i]` to `boundaries[i+1]` covers) — see docs/contract.md
 * "POST /api/kankaku/totals" and the local-day rule (ADR 0026). DST days
 * are correctly 23/25 hours since every boundary is independently
 * resolved through `localWallClockToUtc` (which re-derives the real UTC
 * offset for that specific instant via `Intl`), never computed by adding
 * a fixed 24h to the previous boundary.
 */
export function buildLocalDayBoundaries(
  range: { start: string, end: string },
  timeZone: string = defaultTimeZone(),
): { boundaries: string[], labels: string[] } {
  const labels: string[] = []
  let cursor = range.start
  while (cursor <= range.end) {
    labels.push(cursor)
    cursor = nextLocalDay(cursor)
  }
  const boundaries = labels.map(day =>
    toPbDateFilter(localWallClockToUtc(day, { hour: 0, minute: 0, second: 0, ms: 0 }, timeZone)),
  )
  const lastLabel = labels[labels.length - 1]
  if (lastLabel) {
    boundaries.push(toPbDateFilter(localWallClockToUtc(nextLocalDay(lastLabel), { hour: 0, minute: 0, second: 0, ms: 0 }, timeZone)))
  }
  return { boundaries, labels }
}
