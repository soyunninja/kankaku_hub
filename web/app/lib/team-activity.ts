export function activityFilters(memberId: string | undefined, member: string, department: string) {
  // Current catalog assignments must never constrain an individual's history.
  if (memberId !== undefined) return { member: memberId }
  return {
    ...(member === '*' ? {} : { member }),
    ...(department === '*' ? {} : { department }),
  }
}

export interface ActivityDateRange {
  start: string
  end: string
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Use a bookmarked range only when both query values are scalar valid dates in order. */
export function dateRangeFromQuery(start: unknown, end: unknown, fallback: ActivityDateRange): ActivityDateRange {
  if (!isCalendarDate(start) || !isCalendarDate(end) || start > end) return fallback
  return { start, end }
}

export function entryDestination(entry: { session_id: string }, dateStart: string, dateEnd: string) {
  return { path: '/entries', query: { session_id: entry.session_id, dateStart, dateEnd } }
}
