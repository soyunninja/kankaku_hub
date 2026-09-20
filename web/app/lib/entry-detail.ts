/**
 * Pure field-to-view mapping for the entry detail sheet
 * (app/components/entries/EntryDetailSheet.vue). No i18n calls, no Vue,
 * no PocketBase — importable from plain Vitest, same rule as
 * app/lib/format.ts. Keeping this logic here (title derivation, status
 * presentation, segments normalisation, the work/wait ratio, path
 * truncation, safe generic rendering, relation resolution) is what makes
 * the sheet component mostly presentational and unit-testable without a
 * browser.
 *
 * The `[object Object]` bug this module fixes at the root: the old sheet
 * rendered every field with `String(v)`, which stringifies a plain object
 * (e.g. the `segments` JSON field) to the literal text `[object Object]`.
 * `safeDisplayValue` is the one place allowed to turn an arbitrary
 * PocketBase field into display text, and it never does that — an
 * object/array always becomes pretty-printed JSON instead.
 */

import type { EntryStatus } from './pocketbase-types'

const TITLE_PROMPT_MAX_LENGTH = 80
const SHORT_ID_LENGTH = 8

// ---------------------------------------------------------------------
// Title derivation
// ---------------------------------------------------------------------

export type EntryTitleSource =
  | { kind: 'session_name', text: string }
  | { kind: 'prompt', text: string, truncated: boolean }
  | { kind: 'fallback', shortId: string }

/**
 * Picks what the sheet header shows as the entry's title: the session
 * name when present, else the (truncated) prompt, else a short id the
 * caller wraps with a localized "Registro"/"Entry" fallback label.
 */
export function deriveEntryTitle(entry: { session_name?: string | null, prompt?: string | null, id: string }): EntryTitleSource {
  const sessionName = entry.session_name?.trim()
  if (sessionName) return { kind: 'session_name', text: sessionName }

  const prompt = entry.prompt?.trim()
  if (prompt) {
    const truncated = prompt.length > TITLE_PROMPT_MAX_LENGTH
    const text = truncated ? `${prompt.slice(0, TITLE_PROMPT_MAX_LENGTH).trimEnd()}…` : prompt
    return { kind: 'prompt', text, truncated }
  }

  return { kind: 'fallback', shortId: entry.id.slice(0, SHORT_ID_LENGTH) }
}

// ---------------------------------------------------------------------
// Status presentation
// ---------------------------------------------------------------------

export type StatusTone = 'success' | 'destructive' | 'warning'
export type StatusIcon = 'check' | 'x' | 'alert-triangle'

export interface StatusPresentation {
  tone: StatusTone
  icon: StatusIcon
}

const STATUS_PRESENTATION: Record<EntryStatus, StatusPresentation> = {
  completed: { tone: 'success', icon: 'check' },
  aborted: { tone: 'destructive', icon: 'x' },
  interrupted: { tone: 'warning', icon: 'alert-triangle' },
}

/** Tone + icon for a status badge — colour is never the only signal, the
 * icon carries the distinction too (WCAG 1.4.1). */
export function statusPresentation(status: EntryStatus): StatusPresentation {
  return STATUS_PRESENTATION[status]
}

// ---------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------

export interface SegmentEntry {
  tag: string
  ms: number
}

/**
 * Normalises the `segments` JSON field (a PocketBase `unknown`-typed
 * column) into a tag->duration list sorted by duration descending.
 * Tolerates every malformed shape the field can arrive in: `null`,
 * `undefined`, an empty object, an array, a primitive, a JSON string, or
 * an object with non-numeric/negative/zero values — all of those become
 * `[]` (or drop the offending key) rather than throwing or stringifying
 * to `[object Object]`.
 */
export function normalizeSegments(value: unknown): SegmentEntry[] {
  let source = value
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source)
    }
    catch {
      return []
    }
  }

  if (!source || typeof source !== 'object' || Array.isArray(source)) return []

  const entries: SegmentEntry[] = []
  for (const [tag, raw] of Object.entries(source as Record<string, unknown>)) {
    const ms = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(ms) && ms > 0) entries.push({ tag, ms })
  }
  return entries.sort((a, b) => b.ms - a.ms)
}

// ---------------------------------------------------------------------
// Work / wait proportional bar
// ---------------------------------------------------------------------

export interface WorkWaitRatio {
  /** 0..100 */
  workPercent: number
  /** 0..100 */
  waitPercent: number
  /** 0..100 — remainder of wall time neither counted as work nor waiting. */
  otherPercent: number
}

const ZERO_RATIO: WorkWaitRatio = { workPercent: 0, waitPercent: 0, otherPercent: 0 }

/** Work vs waiting vs the rest, as percentages of wall time — clamped so
 * malformed/inconsistent inputs (e.g. work_ms + waiting_ms > wall_ms)
 * never produce a bar over 100% or a negative segment. */
export function computeWorkWaitRatio(workMs: number, waitingMs: number, wallMs: number): WorkWaitRatio {
  const wall = Number.isFinite(wallMs) ? wallMs : 0
  if (wall <= 0) return ZERO_RATIO

  const safeWork = Number.isFinite(workMs) ? Math.max(0, workMs) : 0
  const work = Math.min(safeWork, wall)

  const safeWait = Number.isFinite(waitingMs) ? Math.max(0, waitingMs) : 0
  const wait = Math.min(safeWait, wall - work)

  const other = Math.max(0, wall - work - wait)

  return {
    workPercent: (work / wall) * 100,
    waitPercent: (wait / wall) * 100,
    otherPercent: (other / wall) * 100,
  }
}

// ---------------------------------------------------------------------
// Path truncation
// ---------------------------------------------------------------------

/** Middle-truncates a long string (e.g. a repo path) so it stays on one
 * line without hiding the meaningful start/end: `apps/web/…/index.vue`. */
export function truncateMiddle(value: string, maxLength = 40): string {
  if (maxLength < 3 || value.length <= maxLength) return value
  const keep = maxLength - 1
  const head = Math.ceil(keep / 2)
  const tail = Math.floor(keep / 2)
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`
}

// ---------------------------------------------------------------------
// Safe generic rendering (the [object Object] fix)
// ---------------------------------------------------------------------

/**
 * Renders an arbitrary field value for the "technical details" fallback
 * table. This is the one place allowed to turn an unknown PocketBase
 * value into text, and it never produces `[object Object]`: objects and
 * arrays are pretty-printed JSON (rendered in a `<pre>` by the caller),
 * everything else is a plain string, empty/null/undefined is `—`.
 */
export function safeDisplayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  }
  catch {
    return '—'
  }
}

/** Whether `safeDisplayValue` would render this as structured JSON
 * (so the caller knows to use a `<pre>` block instead of inline text). */
export function isStructuredValue(value: unknown): boolean {
  return value !== null && typeof value === 'object'
}

// ---------------------------------------------------------------------
// Relation resolution (client / project / task)
// ---------------------------------------------------------------------

export type RelationState = 'empty' | 'deleted' | 'resolved'

export interface RelationDisplay {
  state: RelationState
  id: string
  name?: string
}

/**
 * Resolves a relation field (client/project/task) against its `expand`
 * counterpart: an empty id means "no relation set", a non-empty id with
 * no expanded record means the target was deleted since this entry was
 * written, and both present means it resolved normally.
 */
export function resolveRelation(id: string, expanded: { name: string } | null | undefined): RelationDisplay {
  if (!id) return { state: 'empty', id: '' }
  if (!expanded) return { state: 'deleted', id }
  return { state: 'resolved', id, name: expanded.name }
}
