import { describe, expect, it } from 'vitest'
import {
  formatCost,
  formatDelta,
  formatDuration,
  formatDurationCompact,
  formatPercent,
  formatTokens,
  formatTokensCompact,
} from '../app/lib/format'

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(90 * 60 * 1000)).toBe('1h 30m')
  })
  it('formats whole hours without minutes', () => {
    expect(formatDuration(2 * 60 * 60 * 1000)).toBe('2h')
  })
  it('formats minutes only', () => {
    expect(formatDuration(45 * 60 * 1000)).toBe('45m')
  })
  it('formats seconds only', () => {
    expect(formatDuration(12_000)).toBe('12s')
  })
  it('treats zero/negative/NaN as 0s', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(-5)).toBe('0s')
    expect(formatDuration(Number.NaN)).toBe('0s')
  })
})

describe('formatDurationCompact', () => {
  it('has no space between hours and minutes', () => {
    expect(formatDurationCompact(90 * 60 * 1000)).toBe('1h30m')
  })
})

describe('formatCost', () => {
  it('formats as USD currency with 2 decimals by default', () => {
    expect(formatCost(12.5)).toBe('$12.50')
  })
  it('treats non-finite as 0', () => {
    expect(formatCost(Number.NaN)).toBe('$0.00')
  })
})

describe('formatTokens', () => {
  it('adds thousands separators', () => {
    expect(formatTokens(1234567)).toBe('1,234,567')
  })
})

describe('formatTokensCompact', () => {
  it('compacts large numbers', () => {
    expect(formatTokensCompact(12345)).toBe('12.3K')
  })
})

describe('formatPercent', () => {
  it('formats a ratio as a percentage', () => {
    expect(formatPercent(0.4321)).toBe('43.2%')
  })
})

describe('formatDelta', () => {
  it('formats positive change with a leading +', () => {
    expect(formatDelta(120, 100)).toBe('+20.0%')
  })
  it('formats negative change', () => {
    expect(formatDelta(80, 100)).toBe('-20.0%')
  })
  it('returns n/a when the baseline is zero and current is non-zero', () => {
    expect(formatDelta(10, 0)).toBe('n/a')
  })
  it('returns 0% when both are zero', () => {
    expect(formatDelta(0, 0)).toBe('0%')
  })
})
