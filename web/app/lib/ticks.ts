/**
 * "Nice number" axis-tick generation (d3-style): rounds a raw step to a
 * clean 1/2/5 x 10^n multiple instead of dividing the max into arbitrary
 * fractions. Used by StackedBarChart so the y-axis reads e.g. `0, 5h, 10h,
 * 15h, 20h, 25h` instead of `0s, 5h 26m, 10h 53m, 16h 20m, 21h 46m`.
 */
function niceNumber(value: number, round: boolean): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  const exponent = Math.floor(Math.log10(value))
  const fraction = value / 10 ** exponent
  let niceFraction: number
  if (round) {
    if (fraction < 1.5) niceFraction = 1
    else if (fraction < 3) niceFraction = 2
    else if (fraction < 7) niceFraction = 5
    else niceFraction = 10
  }
  else {
    if (fraction <= 1) niceFraction = 1
    else if (fraction <= 2) niceFraction = 2
    else if (fraction <= 5) niceFraction = 5
    else niceFraction = 10
  }
  return niceFraction * 10 ** exponent
}

/**
 * Compute "nice" axis ticks covering `[0, maxValue]`.
 *
 * `unit` lets the caller express the domain in a human-friendly unit
 * before rounding, then converts back: pass `unit = 3_600_000` (1 hour in
 * ms) so a raw millisecond max rounds to clean HOUR steps (5h, 10h, ...)
 * instead of clean-but-meaningless millisecond steps. Defaults to `1`
 * (round the raw value directly — appropriate for currency, which is
 * already in a human unit).
 *
 * Always includes `0` and a last tick >= `maxValue`, so bars never exceed
 * the topmost gridline.
 */
export function niceTicks(maxValue: number, targetCount = 5, unit = 1): number[] {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return [0]

  const scaledMax = maxValue / unit
  const rawStep = scaledMax / Math.max(1, targetCount)
  const niceStep = niceNumber(rawStep, true)
  if (niceStep <= 0) return [0]

  const niceMax = Math.ceil(scaledMax / niceStep) * niceStep
  const ticks: number[] = []
  // Guard against float drift accumulating past niceMax by counting steps.
  const steps = Math.round(niceMax / niceStep)
  for (let i = 0; i <= steps; i++) {
    ticks.push(i * niceStep * unit)
  }
  return ticks
}
