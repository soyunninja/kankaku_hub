/**
 * Pure helper behind the Engram narrative feature (odd/tasks/engram-narrative.md
 * task T6): turns a `Narrative`'s raw `summary`/`first_prompt` into the
 * text shown under the goal line in the entries-table narrative block
 * (`app/pages/entries/index.vue`'s `session-narrative` block). No Vue, no
 * i18n — importable from plain Vitest, same isolation rule as
 * `app/lib/session-title.ts`.
 *
 * The daemon's session-summary `content` repeats the goal at the top
 * (see `pocketbase/pb_hooks/lib/engram-narrative.js#parseGoal`'s doc
 * comment for the exact formats: "## Goal\n<text>", "Goal: <text>",
 * "**Goal**\n<text>" / "**Goal:** <text>") and renders every other
 * markdown heading/bold label literally. Since the goal line is already
 * shown above this block (`entries/index.vue`), `narrativeBody` strips
 * it, then flattens every remaining markdown heading/bold-label line
 * into a plain "Title:" line so the block reads as text, not raw
 * markdown.
 */

/** The subset of `Narrative` (`app/composables/useEngramNarrative.ts`)
 * this module needs — kept local rather than imported so this stays a
 * dependency-free pure lib, same isolation rule as every other
 * `app/lib/*.ts` module. */
export interface NarrativeBodyInput {
  goal?: string
  summary?: string
  first_prompt?: string
}

const GOAL_HEADING_RE = /^#{1,6}\s*\**\s*Goal\s*\**\s*:?\s*$/i
const GOAL_BOLD_RE = /^\*\*\s*Goal\s*:?\s*\*\*\s*:?\s*(.*)$/i
const GOAL_INLINE_RE = /^Goal\s*:\s*(.+)$/i

const HEADING_RE = /^#{1,6}\s*(.+)$/
const BOLD_LABEL_RE = /^\*\*\s*(.+?)\s*:?\s*\*\*\s*:?\s*(.*)$/

/**
 * Removes the goal heading/inline line (mirrors
 * `engram-narrative.js#parseGoal`'s three formats) plus, for a
 * heading-only marker ("## Goal" / "**Goal**" with no inline text), the
 * immediately following non-empty line — but only when that line equals
 * `goal` exactly (trimmed), the same safety check `parseGoal` implicitly
 * relies on by construction. Only the FIRST non-empty line is checked —
 * the real daemon content always puts the goal at the top, so a summary
 * with no goal marker there is left untouched.
 */
function removeGoalSection(lines: string[], goal: string): string[] {
  const goalTrim = goal.trim()

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim()
    if (!trimmed) continue

    if (GOAL_HEADING_RE.test(trimmed)) {
      return removeHeadingAndItsGoalText(lines, i, goalTrim)
    }

    const boldMatch = GOAL_BOLD_RE.exec(trimmed)
    if (boldMatch) {
      const inline = boldMatch[1]?.trim() ?? ''
      if (inline) return lines.filter((_, idx) => idx !== i)
      return removeHeadingAndItsGoalText(lines, i, goalTrim)
    }

    if (GOAL_INLINE_RE.test(trimmed)) {
      return lines.filter((_, idx) => idx !== i)
    }

    // First non-empty line is not a goal marker: nothing to strip.
    return lines
  }

  return lines
}

function removeHeadingAndItsGoalText(lines: string[], headingIndex: number, goalTrim: string): string[] {
  let nextIndex = -1
  for (let j = headingIndex + 1; j < lines.length; j++) {
    if (lines[j]!.trim()) {
      nextIndex = j
      break
    }
  }

  const remove = new Set([headingIndex])
  if (nextIndex !== -1 && goalTrim && lines[nextIndex]!.trim() === goalTrim) {
    remove.add(nextIndex)
  }
  return lines.filter((_, idx) => !remove.has(idx))
}

/** Converts one line: a markdown heading ("## Title") or a bold label
 * ("**Title**", "**Title:**", "**Title:** rest text") becomes a plain
 * "Title:" (or "Title: rest text") line. Any other line — including a
 * list dash ("- item") or an already-plain "Label: text" line — is
 * returned unchanged. */
function convertHeadingLine(line: string): string {
  const trimmed = line.trim()

  const heading = HEADING_RE.exec(trimmed)
  if (heading) {
    const title = heading[1]!.trim().replace(/:+$/, '')
    return `${title}:`
  }

  const bold = BOLD_LABEL_RE.exec(trimmed)
  if (bold) {
    const title = bold[1]!.trim()
    const rest = bold[2]?.trim() ?? ''
    return rest ? `${title}: ${rest}` : `${title}:`
  }

  return line
}

/** Returns the text to show under the goal line: the summary with its
 * goal section stripped and remaining headings/bold labels flattened, or
 * the first prompt unchanged when there is no summary, or `''` when
 * there is neither. */
export function narrativeBody(narrative: NarrativeBodyInput): string {
  if (narrative.summary) {
    const lines = removeGoalSection(narrative.summary.split('\n'), narrative.goal ?? '')
    const converted = lines.map(convertHeadingLine)
    const text = converted.join('\n').replace(/\n{4,}/g, '\n\n')
    return text.trim()
  }

  if (narrative.first_prompt) {
    return narrative.first_prompt
  }

  return ''
}

/** Number of lines `body` occupies, for the "show more" toggle's
 * ~6-line clamp threshold in `entries/index.vue`. An empty string still
 * counts as one (empty) line. */
export function narrativeBodyLineCount(body: string): number {
  return body.split('\n').length
}
