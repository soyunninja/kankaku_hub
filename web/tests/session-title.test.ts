/**
 * Unit tests for `app/lib/session-title.ts` — the byte-for-byte rule
 * behind the Engram narrative feature: an entries/queue row's displayed
 * title is the narrative title when one exists, else EXACTLY what
 * `sessionMarkerLabel` already produced today (so a hub with no Engram
 * configured renders identically to before this feature, per
 * odd/tasks/engram-narrative.md's acceptance criteria).
 */
import { describe, expect, it } from 'vitest'
import { sessionMarkerLabel } from '../app/lib/session-marker'
import { sessionTitle } from '../app/lib/session-title'

describe('sessionTitle', () => {
  it('uses the narrative title when it is non-empty', () => {
    expect(sessionTitle('01234567890abcdef', 'Refactor auth', 'Ship the login flow')).toBe('Ship the login flow')
  })

  it('trims the narrative title before using it', () => {
    expect(sessionTitle('01234567890abcdef', 'Refactor auth', '  Ship the login flow  ')).toBe('Ship the login flow')
  })

  it('falls back to sessionMarkerLabel when narrativeTitle is blank (whitespace only)', () => {
    expect(sessionTitle('01234567890abcdef', 'Refactor auth', '   ')).toBe(sessionMarkerLabel('01234567890abcdef', 'Refactor auth'))
  })

  it('falls back to sessionMarkerLabel when narrativeTitle is an empty string', () => {
    expect(sessionTitle('01234567890abcdef', 'Refactor auth', '')).toBe(sessionMarkerLabel('01234567890abcdef', 'Refactor auth'))
  })

  it('falls back to sessionMarkerLabel when narrativeTitle is undefined', () => {
    expect(sessionTitle('01234567890abcdef', 'Refactor auth', undefined)).toBe(sessionMarkerLabel('01234567890abcdef', 'Refactor auth'))
  })

  it('falls back to sessionMarkerLabel when narrativeTitle is omitted entirely', () => {
    expect(sessionTitle('01234567890abcdef', 'Refactor auth')).toBe(sessionMarkerLabel('01234567890abcdef', 'Refactor auth'))
  })

  it('is byte-for-byte equal to sessionMarkerLabel for a variety of inputs when there is no narrative', () => {
    const cases: Array<[string, string | undefined]> = [
      ['01234567890abcdef', 'Refactor auth'],
      ['01234567890abcdef', ''],
      ['01234567890abcdef', undefined],
      ['01234567890abcdef', '   padded name   '],
      ['ffeeddccbbaa99887766', 'Another session name'],
    ]
    for (const [sessionId, sessionName] of cases) {
      expect(sessionTitle(sessionId, sessionName)).toBe(sessionMarkerLabel(sessionId, sessionName))
      expect(sessionTitle(sessionId, sessionName, '')).toBe(sessionMarkerLabel(sessionId, sessionName))
    }
  })
})
