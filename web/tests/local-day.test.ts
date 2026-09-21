import { describe, expect, it } from 'vitest'
import { localDateRangeToUtcFilters, localWallClockToUtc, utcInstantToLocalDay } from '../app/lib/local-day'

describe('localWallClockToUtc', () => {
  it('converts local midnight to UTC for a UTC+9 zone (Asia/Tokyo)', () => {
    // 2026-09-21 00:00:00 JST === 2026-09-20 15:00:00 UTC.
    const utc = localWallClockToUtc('2026-09-21', { hour: 0, minute: 0, second: 0, ms: 0 }, 'Asia/Tokyo')
    expect(utc.toISOString()).toBe('2026-09-20T15:00:00.000Z')
  })

  it('converts local midnight to UTC for a UTC-8 zone (America/Los_Angeles, standard time)', () => {
    // 2026-01-15 00:00:00 PST === 2026-01-15 08:00:00 UTC.
    const utc = localWallClockToUtc('2026-01-15', { hour: 0, minute: 0, second: 0, ms: 0 }, 'America/Los_Angeles')
    expect(utc.toISOString()).toBe('2026-01-15T08:00:00.000Z')
  })

  it('is a no-op offset for UTC itself', () => {
    const utc = localWallClockToUtc('2026-09-21', { hour: 0, minute: 0, second: 0, ms: 0 }, 'UTC')
    expect(utc.toISOString()).toBe('2026-09-21T00:00:00.000Z')
  })

  it('handles a spring-forward DST transition day (America/Los_Angeles, 2026-03-08)', () => {
    // Clocks jump from 02:00 to 03:00 PST->PDT on 2026-03-08. Local
    // midnight that day is still a well-defined instant (offset is -08:00
    // until 02:00, then -07:00) — the start-of-day boundary must resolve
    // using the offset in effect AT midnight, not later in the day.
    const utc = localWallClockToUtc('2026-03-08', { hour: 0, minute: 0, second: 0, ms: 0 }, 'America/Los_Angeles')
    expect(utc.toISOString()).toBe('2026-03-08T08:00:00.000Z')
    // End-of-day boundary the same day is already in PDT (-07:00).
    const endUtc = localWallClockToUtc('2026-03-08', { hour: 23, minute: 59, second: 59, ms: 999 }, 'America/Los_Angeles')
    expect(endUtc.toISOString()).toBe('2026-03-09T06:59:59.999Z')
  })

  it('handles a fall-back DST transition day (America/Los_Angeles, 2026-11-01)', () => {
    const utc = localWallClockToUtc('2026-11-01', { hour: 0, minute: 0, second: 0, ms: 0 }, 'America/Los_Angeles')
    expect(utc.toISOString()).toBe('2026-11-01T07:00:00.000Z')
  })
})

describe('localDateRangeToUtcFilters', () => {
  it('produces PocketBase-filter-ready start/end strings for a UTC+9 "today"', () => {
    const { start, end } = localDateRangeToUtcFilters({ start: '2026-09-21', end: '2026-09-21' }, 'Asia/Tokyo')
    expect(start).toBe('2026-09-20 15:00:00.000Z')
    expect(end).toBe('2026-09-21 14:59:59.999Z')
  })

  it('produces the same day for a UTC viewer as the naive implementation used to assume', () => {
    const { start, end } = localDateRangeToUtcFilters({ start: '2026-09-21', end: '2026-09-21' }, 'UTC')
    expect(start).toBe('2026-09-21 00:00:00.000Z')
    expect(end).toBe('2026-09-21 23:59:59.999Z')
  })
})

describe('utcInstantToLocalDay', () => {
  it('buckets a late-night UTC+9 entry under the correct local day, not the UTC day', () => {
    // A UTC+9 user working at local 2026-09-21 07:00 stores this instant
    // (see the MAJOR finding this module fixes) — it must bucket as
    // 2026-09-21 locally, even though its UTC day is 2026-09-20.
    expect(utcInstantToLocalDay('2026-09-20 22:00:00.000Z', 'Asia/Tokyo')).toBe('2026-09-21')
  })

  it('buckets an early UTC-8 entry under the previous local day', () => {
    expect(utcInstantToLocalDay('2026-09-21 05:00:00.000Z', 'America/Los_Angeles')).toBe('2026-09-20')
  })

  it('matches the UTC day for a UTC viewer', () => {
    expect(utcInstantToLocalDay('2026-09-21 12:00:00.000Z', 'UTC')).toBe('2026-09-21')
  })

  it('accepts the PocketBase space-separated date form directly', () => {
    expect(utcInstantToLocalDay('2026-09-21 00:00:00.000Z', 'UTC')).toBe('2026-09-21')
  })
})
