import { describe, expect, it } from 'vitest'
import { cacheHitRatio } from '../app/lib/cache-hit'

describe('cacheHitRatio', () => {
  it('uses the ratio of summed input-token counts, not the mean of entry percentages', () => {
    const small = { input: 0, cacheRead: 1, cacheWrite: 0 }
    const large = { input: 99, cacheRead: 0, cacheWrite: 0 }
    const aggregate = cacheHitRatio(
      small.input + large.input,
      small.cacheRead + large.cacheRead,
      small.cacheWrite + large.cacheWrite,
    )
    const mean = (cacheHitRatio(small.input, small.cacheRead, small.cacheWrite)!
      + cacheHitRatio(large.input, large.cacheRead, large.cacheWrite)!) / 2

    expect(aggregate).toBe(0.01)
    expect(mean).toBe(0.5)
    expect(aggregate).not.toBe(mean)
  })

  it('includes cache writes in the denominator, but no output tokens', () => {
    expect(cacheHitRatio(20, 30, 50)).toBe(0.3)
  })

  it('returns 0 for a measured zero cache read and 1 for all-cache reads', () => {
    expect(cacheHitRatio(10, 0, 5)).toBe(0)
    expect(cacheHitRatio(0, 10, 0)).toBe(1)
  })

  it('returns null when the denominator is zero', () => {
    expect(cacheHitRatio(0, 0, 0)).toBeNull()
  })

  it.each([
    [undefined, 1, 1], [1, undefined, 1], [1, 1, undefined],
    [null, 1, 1], [1, null, 1], [1, 1, null],
  ])('returns null for missing counts (%s, %s, %s)', (input, read, write) => {
    expect(cacheHitRatio(input, read, write)).toBeNull()
  })

  it.each([
    [-1, 1, 1], [1, -1, 1], [1, 1, -1],
    [NaN, 1, 1], [1, NaN, 1], [1, 1, NaN],
    [Infinity, 1, 1], [1, -Infinity, 1], [1, 1, Infinity],
    [Number.MAX_VALUE, 1, Number.MAX_VALUE],
  ])('returns null for negative, non-finite, or overflowing counts (%s, %s, %s)', (input, read, write) => {
    expect(cacheHitRatio(input, read, write)).toBeNull()
  })
})
