/**
 * Pure helpers for the session marker shown on every entries-table row
 * (app/components/entries/SessionMarker.vue, used by
 * app/pages/entries/index.vue) and reused for the "group by session"
 * header rows (app/lib/entries-session-group.ts). No Vue, no i18n —
 * importable from plain Vitest, same rule as app/lib/client-avatar.ts,
 * whose `hashToIndex` this mirrors (duplicated rather than imported, so
 * this module has no cross-lib coupling — same isolation as every other
 * app/lib/*.ts pure module).
 */

/** Deterministic (non-cryptographic) string hash: the same session id
 * always maps to the same hue, spread reasonably evenly across the
 * palette. */
function hashToIndex(value: string, size: number): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % size
}

/**
 * Ten hues spaced 36° apart around the color wheel — a session marker
 * needs more variety than the 5-color chart palette
 * (`app/lib/client-avatar.ts`) since there are usually far more distinct
 * sessions visible at once than clients. Fixed lightness (0.68) and
 * chroma (0.16) were chosen to render as a clearly visible filled dot
 * against BOTH the dark theme's near-black surface and the light theme's
 * near-white surface — a mid-lightness, moderately saturated dot reads
 * fine on both without needing separate light/dark palettes (unlike
 * `ClientAvatar`'s text-on-fill contrast requirement, this dot carries no
 * text of its own — the session label is always rendered as a separate
 * sibling, colour is never the only signal, WCAG 1.4.1).
 */
export const SESSION_HUE_COUNT = 10
const SESSION_HUES = [10, 46, 82, 118, 154, 190, 226, 262, 298, 334]
const SESSION_MARKER_LIGHTNESS = 0.68
const SESSION_MARKER_CHROMA = 0.16

/** Deterministic hue (degrees) for a session's marker dot. */
export function sessionColorHue(sessionId: string): number {
  return SESSION_HUES[hashToIndex(sessionId, SESSION_HUE_COUNT)]!
}

/** `oklch(...)` color string for a session's marker dot, deterministic
 * given the same `sessionId`. */
export function sessionColor(sessionId: string): string {
  return `oklch(${SESSION_MARKER_LIGHTNESS} ${SESSION_MARKER_CHROMA} ${sessionColorHue(sessionId)})`
}

const SHORT_SESSION_ID_LENGTH = 8

/**
 * Short label for a session marker: `session_name` when non-empty
 * (trimmed), else the first 8 chars of `session_id`. Callers with no
 * `session_id` at all render a muted "—" instead of calling this (there
 * is nothing to label) — see `SessionMarker.vue`.
 */
export function sessionMarkerLabel(sessionId: string, sessionName?: string | null): string {
  const name = sessionName?.trim()
  if (name) return name
  return sessionId.slice(0, SHORT_SESSION_ID_LENGTH)
}
