import { describe, expect, it } from 'vitest'
import { isWithinRange, previousEquivalentPeriod, rangeLengthDays, resolvePreset } from '../app/lib/period'

// Fixed reference "now": Friday 2026-09-18 (mid-month, so lastMonth/thisMonth
// boundaries are unambiguous).
const NOW = new Date(2026, 8, 18, 15, 30)

describe('resolvePreset', () => {
  it('today is a single-day range', () => {
    expect(resolvePreset('today', NOW)).toEqual({ start: '2026-09-18', end: '2026-09-18' })
  })
  it('7d spans the last 7 days including today', () => {
    expect(resolvePreset('7d', NOW)).toEqual({ start: '2026-09-12', end: '2026-09-18' })
  })
  it('30d spans the last 30 days including today', () => {
    expect(resolvePreset('30d', NOW)).toEqual({ start: '2026-08-20', end: '2026-09-18' })
  })
  it('thisMonth spans the 1st through today', () => {
    expect(resolvePreset('thisMonth', NOW)).toEqual({ start: '2026-09-01', end: '2026-09-18' })
  })
  it('lastMonth spans the full previous calendar month', () => {
    expect(resolvePreset('lastMonth', NOW)).toEqual({ start: '2026-08-01', end: '2026-08-31' })
  })
})

describe('rangeLengthDays', () => {
  it('counts inclusive days', () => {
    expect(rangeLengthDays({ start: '2026-09-12', end: '2026-09-18' })).toBe(7)
  })
  it('a single day is length 1', () => {
    expect(rangeLengthDays({ start: '2026-09-18', end: '2026-09-18' })).toBe(1)
  })
})

describe('previousEquivalentPeriod', () => {
  it('shifts a 7-day range back by 7 days, ending the day before start', () => {
    expect(previousEquivalentPeriod({ start: '2026-09-12', end: '2026-09-18' }))
      .toEqual({ start: '2026-09-05', end: '2026-09-11' })
  })
  it('shifts a single day back by one day', () => {
    expect(previousEquivalentPeriod({ start: '2026-09-18', end: '2026-09-18' }))
      .toEqual({ start: '2026-09-17', end: '2026-09-17' })
  })
  it('handles a month-boundary crossing range', () => {
    expect(previousEquivalentPeriod({ start: '2026-09-01', end: '2026-09-18' }))
      .toEqual({ start: '2026-08-14', end: '2026-08-31' })
  })
})

describe('isWithinRange', () => {
  const range = { start: '2026-09-01', end: '2026-09-18' }
  it('is true for the boundaries', () => {
    expect(isWithinRange('2026-09-01', range)).toBe(true)
    expect(isWithinRange('2026-09-18', range)).toBe(true)
  })
  it('is false just outside the boundaries', () => {
    expect(isWithinRange('2026-08-31', range)).toBe(false)
    expect(isWithinRange('2026-09-19', range)).toBe(false)
  })
})
