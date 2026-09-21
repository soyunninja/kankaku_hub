/**
 * Unit tests for `app/lib/session-marker.ts` — the deterministic
 * colour/label helpers behind the entries-table session marker
 * (app/components/entries/SessionMarker.vue) and the "group by session"
 * header rows (app/lib/entries-session-group.ts).
 */
import { describe, expect, it } from 'vitest'
import { SESSION_HUE_COUNT, sessionColor, sessionColorHue, sessionMarkerLabel } from '../app/lib/session-marker'

describe('sessionColorHue / sessionColor', () => {
  it('is deterministic — the same session id always maps to the same hue', () => {
    const id = 'session-abc-123'
    expect(sessionColorHue(id)).toBe(sessionColorHue(id))
    expect(sessionColor(id)).toBe(sessionColor(id))
  })

  it('spreads a reasonable set of ids across more than one hue', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `session-${i}`)
    const hues = new Set(ids.map(sessionColorHue))
    expect(hues.size).toBeGreaterThan(1)
  })

  it('returns a color string usable directly as a CSS color', () => {
    const value = sessionColor('session-xyz')
    expect(value).toMatch(/^oklch\(/)
  })

  it('picks from exactly SESSION_HUE_COUNT distinct hues', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `s-${i}`)
    const hues = new Set(ids.map(sessionColorHue))
    expect(hues.size).toBeLessThanOrEqual(SESSION_HUE_COUNT)
  })
})

describe('sessionMarkerLabel', () => {
  it('uses session_name when non-empty', () => {
    expect(sessionMarkerLabel('01234567890abcdef', 'Refactor auth')).toBe('Refactor auth')
  })

  it('trims session_name before using it', () => {
    expect(sessionMarkerLabel('01234567890abcdef', '  Refactor auth  ')).toBe('Refactor auth')
  })

  it('falls back to the LAST 8 chars of session_id when session_name is empty', () => {
    expect(sessionMarkerLabel('01234567890abcdef', '')).toBe('90abcdef')
  })

  it('falls back to the LAST 8 chars of session_id when session_name is undefined', () => {
    expect(sessionMarkerLabel('01234567890abcdef', undefined)).toBe('90abcdef')
  })

  it('falls back to the LAST 8 chars of session_id when session_name is whitespace-only', () => {
    expect(sessionMarkerLabel('01234567890abcdef', '   ')).toBe('90abcdef')
  })

  it('returns the whole session_id when it is shorter than 8 chars', () => {
    expect(sessionMarkerLabel('abc', '')).toBe('abc')
  })
})

describe('sessionMarkerLabel with time-ordered ids', () => {
  it('tells apart two pi sessions started minutes apart (UUIDv7 ids share their leading, timestamp characters)', () => {
    const a = sessionMarkerLabel('01a0c4da-7d5f-7427-ba8b-bc07e68cdc3a', '')
    const b = sessionMarkerLabel('01a0c4d2-1111-7427-ba8b-0f3e11aa90c1', '')
    expect(a).toBe('e68cdc3a')
    expect(b).not.toBe(a)
  })
})
