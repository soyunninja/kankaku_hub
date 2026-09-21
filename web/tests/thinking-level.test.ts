/**
 * Unit tests for `app/lib/thinking-level.ts` — the pure resolver behind
 * the "reasoning effort" display (EntryDetailSheet, the entries table's
 * model column, the work_records list) built on `thinking_level`
 * (`TaskEntryRecord`/`WorkRecordRecord`, migration 1758300020).
 */
import { describe, expect, it } from 'vitest'
import { KNOWN_THINKING_LEVELS, resolveThinkingLevel } from '../app/lib/thinking-level'

describe('resolveThinkingLevel', () => {
  it('returns null for undefined', () => {
    expect(resolveThinkingLevel(undefined)).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(resolveThinkingLevel('')).toBeNull()
  })

  it('returns null for a whitespace-only string', () => {
    expect(resolveThinkingLevel('   ')).toBeNull()
  })

  it('recognizes every known pi value', () => {
    for (const level of KNOWN_THINKING_LEVELS) {
      expect(resolveThinkingLevel(level)).toEqual({ kind: 'known', value: level })
    }
  })

  it('trims whitespace around a known value', () => {
    expect(resolveThinkingLevel('  high  ')).toEqual({ kind: 'known', value: 'high' })
  })

  it('treats an unrecognized value as raw free text, shown verbatim', () => {
    expect(resolveThinkingLevel('ultrathink')).toEqual({ kind: 'raw', value: 'ultrathink' })
  })

  it('is case-sensitive — a differently-cased known value is treated as raw', () => {
    expect(resolveThinkingLevel('High')).toEqual({ kind: 'raw', value: 'High' })
  })
})
