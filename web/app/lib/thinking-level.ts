/**
 * Pure resolver for `thinking_level` — the model's reasoning effort, as
 * the originating agent reports it (`TaskEntryRecord`/`WorkRecordRecord`,
 * migration 1758300020). No i18n calls, no Vue — importable from plain
 * Vitest, same rule as app/lib/measurement-quality.ts. Translation of a
 * *known* value happens in the component (`t('entries.detail.thinkingLevel.' +
 * value)`), same split as `describeEntryQuality`'s badges: this module
 * only classifies, it never produces display text.
 */

/** pi's known `thinking_level` values. Any other non-empty value is a
 * different agent's own free-text label — shown verbatim, never
 * translated, since this module has no way to know what an unrecognized
 * agent's scale means. */
export const KNOWN_THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type KnownThinkingLevel = typeof KNOWN_THINKING_LEVELS[number]

function isKnownThinkingLevel(value: string): value is KnownThinkingLevel {
  return (KNOWN_THINKING_LEVELS as readonly string[]).includes(value)
}

export type ThinkingLevelDisplay =
  | { kind: 'known', value: KnownThinkingLevel }
  | { kind: 'raw', value: string }

/**
 * Resolves a raw `thinking_level` field to what the UI should display:
 * `null` for empty/undefined/whitespace-only (the caller renders nothing
 * at all — unlike most other quality fields in this app, an unknown
 * effort isn't worth a placeholder, see `describeEntryQuality`'s module
 * doc for the contrast), `{ kind: 'known', value }` for one of pi's
 * documented values (caller translates it), or `{ kind: 'raw', value }`
 * for anything else (caller renders `value` verbatim).
 */
export function resolveThinkingLevel(raw: string | null | undefined): ThinkingLevelDisplay | null {
  const value = raw?.trim()
  if (!value) return null
  if (isKnownThinkingLevel(value)) return { kind: 'known', value }
  return { kind: 'raw', value }
}
