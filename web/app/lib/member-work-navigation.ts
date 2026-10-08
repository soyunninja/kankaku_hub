type DateQuery = { dateStart: string, dateEnd: string }
type Destination = { path: string, query: Record<string, string> }

function hasKey(value: string) {
  return value.trim().length > 0
}

function dateQuery(dateStart: string, dateEnd: string): DateQuery {
  return { dateStart, dateEnd }
}

export function memberProjectDestination(memberId: string, projectId: string, dateStart: string, dateEnd: string): Destination | null {
  if (!hasKey(memberId) || !hasKey(projectId)) return null
  return {
    path: `/team/member-projects/${encodeURIComponent(memberId)}/${encodeURIComponent(projectId)}`,
    query: dateQuery(dateStart, dateEnd),
  }
}

export function memberSessionDestination(memberId: string, sessionId: string, dateStart: string, dateEnd: string): Destination | null {
  if (!hasKey(memberId) || !hasKey(sessionId)) return null
  return {
    path: `/team/member-sessions/${encodeURIComponent(memberId)}`,
    query: { session_id: sessionId, ...dateQuery(dateStart, dateEnd) },
  }
}

export function memberWorkReturnDestination(memberId: string, dateStart: string, dateEnd: string): Destination {
  return {
    path: `/team/${encodeURIComponent(memberId)}`,
    query: dateQuery(dateStart, dateEnd),
  }
}
