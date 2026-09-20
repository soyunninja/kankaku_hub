import { describe, expect, it } from 'vitest'
import { niceTicks } from '@/lib/ticks'

describe('niceTicks', () => {
  it('returns a single zero tick for a non-positive or non-finite max', () => {
    expect(niceTicks(0)).toEqual([0])
    expect(niceTicks(-5)).toEqual([0])
    expect(niceTicks(Number.NaN)).toEqual([0])
    expect(niceTicks(Number.POSITIVE_INFINITY)).toEqual([0])
  })

  it('produces round hour steps for a duration expressed in ms, converted via the hour unit', () => {
    // ~21h46m of work, the dashboard chart example from the polish pass.
    const maxMs = 21 * 3_600_000 + 46 * 60_000
    const HOUR_MS = 3_600_000
    const ticks = niceTicks(maxMs, 5, HOUR_MS)
    // Expected: 0, 5h, 10h, 15h, 20h, 25h (in ms).
    expect(ticks).toEqual([0, 5, 10, 15, 20, 25].map(h => h * HOUR_MS))
  })

  it('covers the domain max: the last tick is always >= maxValue', () => {
    for (const max of [1, 7, 42, 99, 123.456, 999_999, 3_600_000 * 21.77]) {
      const ticks = niceTicks(max)
      expect(ticks[ticks.length - 1]!).toBeGreaterThanOrEqual(max)
    }
  })

  it('produces evenly spaced ticks starting at zero', () => {
    const ticks = niceTicks(100, 5)
    expect(ticks[0]).toBe(0)
    const step = ticks[1]! - ticks[0]!
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]! - ticks[i - 1]!).toBeCloseTo(step, 6)
    }
  })

  it('rounds the step to a clean 1/2/5 x 10^n multiple', () => {
    const ticks = niceTicks(12.57, 5)
    const step = ticks[1]! - ticks[0]!
    const exponent = Math.floor(Math.log10(step))
    const fraction = Number((step / 10 ** exponent).toFixed(6))
    expect([1, 2, 5, 10]).toContain(fraction)
  })

  it('uses a small clean step for small currency magnitudes', () => {
    // avg cost/task is routinely a few cents.
    const ticks = niceTicks(0.0722, 5)
    const step = ticks[1]! - ticks[0]!
    expect(step).toBeGreaterThan(0)
    expect(step).toBeLessThan(0.05)
  })

  it('never divides by zero and stays finite for a tiny max', () => {
    const ticks = niceTicks(1, 5, 3_600_000)
    expect(ticks.every(t => Number.isFinite(t))).toBe(true)
  })
})
