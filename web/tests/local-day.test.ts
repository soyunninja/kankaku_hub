import { describe, expect, it } from 'vitest'
import { buildLocalDayBoundaries, localDateRangeToUtcFilters, localWallClockToUtc, nextLocalDay, utcInstantToLocalDay } from '../app/lib/local-day'

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

describe('nextLocalDay', () => {
  it('increments across a month boundary', () => {
    expect(nextLocalDay('2026-09-30')).toBe('2026-10-01')
  })
  it('increments across a year boundary', () => {
    expect(nextLocalDay('2026-12-31')).toBe('2027-01-01')
  })
  it('increments across a leap-day February', () => {
    expect(nextLocalDay('2028-02-28')).toBe('2028-02-29')
    expect(nextLocalDay('2028-02-29')).toBe('2028-03-01')
  })
})

describe('buildLocalDayBoundaries', () => {
  it('produces N labels and N+1 boundaries for an N-day range (UTC)', () => {
    const { boundaries, labels } = buildLocalDayBoundaries({ start: '2026-09-01', end: '2026-09-05' }, 'UTC')
    expect(labels).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'])
    expect(boundaries).toEqual([
      '2026-09-01 00:00:00.000Z',
      '2026-09-02 00:00:00.000Z',
      '2026-09-03 00:00:00.000Z',
      '2026-09-04 00:00:00.000Z',
      '2026-09-05 00:00:00.000Z',
      '2026-09-06 00:00:00.000Z',
    ])
  })

  it('produces a single-day range correctly', () => {
    const { boundaries, labels } = buildLocalDayBoundaries({ start: '2026-09-21', end: '2026-09-21' }, 'UTC')
    expect(labels).toEqual(['2026-09-21'])
    expect(boundaries).toEqual(['2026-09-21 00:00:00.000Z', '2026-09-22 00:00:00.000Z'])
  })

  it('resolves each boundary independently in a UTC+9 zone (Asia/Tokyo)', () => {
    const { boundaries, labels } = buildLocalDayBoundaries({ start: '2026-09-20', end: '2026-09-21' }, 'Asia/Tokyo')
    expect(labels).toEqual(['2026-09-20', '2026-09-21'])
    expect(boundaries).toEqual([
      '2026-09-19 15:00:00.000Z',
      '2026-09-20 15:00:00.000Z',
      '2026-09-21 15:00:00.000Z',
    ])
  })

  it('resolves each boundary independently in a UTC-8 zone (America/Los_Angeles)', () => {
    const { boundaries, labels } = buildLocalDayBoundaries({ start: '2026-01-14', end: '2026-01-15' }, 'America/Los_Angeles')
    expect(labels).toEqual(['2026-01-14', '2026-01-15'])
    expect(boundaries).toEqual([
      '2026-01-14 08:00:00.000Z',
      '2026-01-15 08:00:00.000Z',
      '2026-01-16 08:00:00.000Z',
    ])
  })

  it('produces variable-width buckets across a spring-forward DST transition (America/Los_Angeles, 2026-03-08)', () => {
    const { boundaries, labels } = buildLocalDayBoundaries({ start: '2026-03-07', end: '2026-03-09' }, 'America/Los_Angeles')
    expect(labels).toEqual(['2026-03-07', '2026-03-08', '2026-03-09'])
    // 03-07->03-08 is a normal 8h-offset (PST) 24h day; 03-08->03-09 spans
    // the spring-forward, so the boundary lands 1h earlier in UTC (23h
    // local day) than a naive +24h-per-day computation would produce.
    expect(boundaries).toEqual([
      '2026-03-07 08:00:00.000Z',
      '2026-03-08 08:00:00.000Z',
      '2026-03-09 07:00:00.000Z',
      '2026-03-10 07:00:00.000Z',
    ])
  })

  it('every boundary is strictly increasing (the shape totals-query.js requires)', () => {
    const { boundaries } = buildLocalDayBoundaries({ start: '2026-03-01', end: '2026-03-15' }, 'America/Los_Angeles')
    for (let i = 1; i < boundaries.length; i++) {
      expect(boundaries[i]! > boundaries[i - 1]!).toBe(true)
    }
  })
})
