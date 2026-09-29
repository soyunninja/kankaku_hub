import { describe, expect, it } from 'vitest'
import { formatCompactEntryDateTime, formatShortFilterDate, parseShortFilterDate } from '../app/lib/entries-compact-date'

describe('formatCompactEntryDateTime', () => {
  it('rolls UTC instants across the viewer local day in both directions', () => {
    expect(formatCompactEntryDateTime('2026-09-20 22:03:00.000Z', 'Asia/Tokyo')).toBe('26/09/21 07:03')
    expect(formatCompactEntryDateTime('2026-09-21T05:04:00Z', 'America/Los_Angeles')).toBe('26/09/20 22:04')
  })

  it('uses a zero-padded 24-hour clock, including midnight and noon', () => {
    expect(formatCompactEntryDateTime('2026-01-01T00:05:00Z', 'UTC')).toBe('26/01/01 00:05')
    expect(formatCompactEntryDateTime('2026-01-01T12:00:00Z', 'UTC')).toBe('26/01/01 12:00')
    expect(formatCompactEntryDateTime('2026-01-01T23:59:00Z', 'UTC')).toBe('26/01/01 23:59')
  })

  it('shows an explicit placeholder for invalid or non-UTC instants', () => {
    for (const value of ['', 'not-a-date', '2026-02-30T12:00:00Z', '2026-01-01T10:00:00']) {
      expect(formatCompactEntryDateTime(value, 'UTC')).toBe('—')
    }
  })
})

describe('short filter dates', () => {
  it('roundtrips the full 2000–2099 range as local calendar dates', () => {
    for (const iso of ['2000-01-01', '2026-09-21', '2099-12-31']) {
      expect(parseShortFilterDate(formatShortFilterDate(iso))).toEqual({ status: 'valid', value: iso })
    }
  })

  it('accepts leap days only in leap years', () => {
    expect(parseShortFilterDate('00/02/29')).toEqual({ status: 'valid', value: '2000-02-29' })
    expect(parseShortFilterDate('04/02/29')).toEqual({ status: 'valid', value: '2004-02-29' })
    expect(parseShortFilterDate('01/02/29')).toEqual({ status: 'invalid' })
    expect(parseShortFilterDate('99/02/29')).toEqual({ status: 'invalid' })
    expect(parseShortFilterDate('26/04/31')).toEqual({ status: 'invalid' })
  })

  it('rejects non-exact and out-of-range text without normalizing it', () => {
    for (const value of ['26/1/01', '2026/01/01', '26-01-01', ' 26/01/01', '26/01/01 ', '26/00/01', '26/13/01', '26/01/00', '26/01/32', '２６/０１/０１']) {
      expect(parseShortFilterDate(value)).toEqual({ status: 'invalid' })
    }
    expect(formatShortFilterDate('1999-12-31')).toBe('—')
    expect(formatShortFilterDate('2026-02-30')).toBe('—')
  })

  it('distinguishes an exactly blank clear action from invalid whitespace', () => {
    expect(parseShortFilterDate('')).toEqual({ status: 'clear' })
    expect(parseShortFilterDate(' ')).toEqual({ status: 'invalid' })
    expect(formatShortFilterDate('')).toBe('')
  })
})
