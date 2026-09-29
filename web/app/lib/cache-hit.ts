/**
 * Share of input tokens served from cache. Pass summed counts for a range,
 * rather than averaging the ratios of individual entries. Output tokens are
 * not part of the input-token denominator.
 */
export function cacheHitRatio(
  input: number | null | undefined,
  cacheRead: number | null | undefined,
  cacheWrite: number | null | undefined,
): number | null {
  if (input == null || cacheRead == null || cacheWrite == null
    || !Number.isFinite(input) || !Number.isFinite(cacheRead) || !Number.isFinite(cacheWrite)
    || input < 0 || cacheRead < 0 || cacheWrite < 0) return null

  const denominator = input + cacheRead + cacheWrite
  if (!Number.isFinite(denominator) || denominator === 0) return null
  return cacheRead / denominator
}
