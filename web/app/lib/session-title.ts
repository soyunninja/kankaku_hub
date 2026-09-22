/**
 * Pure helper behind the Engram narrative feature (odd/tasks/engram-narrative.md):
 * decides what to show as a session's "title" wherever a session marker or
 * queue row is rendered. No Vue, no i18n — importable from plain Vitest,
 * same isolation rule as `app/lib/session-marker.ts`.
 */
import { sessionMarkerLabel } from './session-marker'

/**
 * `narrativeTitle` (trimmed) when non-empty, else EXACTLY
 * `sessionMarkerLabel(sessionId, sessionName)` — the byte-for-byte rule
 * that keeps every screen identical to before this feature when Engram
 * has no narrative for a session (or is not configured at all).
 */
export function sessionTitle(sessionId: string, sessionName?: string | null, narrativeTitle?: string | null): string {
  const trimmed = narrativeTitle?.trim()
  if (trimmed) return trimmed
  return sessionMarkerLabel(sessionId, sessionName)
}
