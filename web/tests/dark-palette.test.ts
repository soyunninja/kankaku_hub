/**
 * Guards for the dark palette (Gentleman-Cute, see
 * odd/tasks/dark-theme-gentleman-cute.md): keeps `--chart-1..5` in
 * `app/assets/css/tailwind.css`'s `.dark` block and
 * `CHART_OKLCH_BY_THEME.dark` in `app/lib/client-avatar.ts` from silently
 * drifting apart, and computes (rather than assumes) WCAG AA contrast for
 * every foreground/background pair the dark theme actually renders.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHART_OKLCH_BY_THEME,
  contrastRatio,
  oklchToLinearSrgb,
  relativeLuminance,
} from '../app/lib/client-avatar'

// `vitest run` executes with cwd = web/ (see package.json's "test" script),
// so this resolves the same way regardless of the caller's own cwd.
const cssPath = resolve(process.cwd(), 'app/assets/css/tailwind.css')
const css = readFileSync(cssPath, 'utf-8')

/** Extracts the `.dark { ... }` block's raw body (first match only — the
 * file has exactly one `.dark` rule). */
function darkBlock(): string {
  const match = css.match(/\.dark\s*\{([\s\S]*?)\n\}/)
  if (!match) throw new Error('could not find a .dark { ... } block in tailwind.css')
  return match[1]
}

/** Parses a token's `oklch(L C H)` or `oklch(L C H / A%)` value out of the
 * `.dark` block body. Returns the L/C/H triple; alpha (if present) is
 * ignored, since the contrast pairs checked here are all alpha-less. */
function readToken(block: string, name: string): [number, number, number] {
  const re = new RegExp(`--${name}:\\s*oklch\\(\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)`)
  const match = block.match(re)
  if (!match) throw new Error(`token --${name} not found in .dark block`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function luminanceOf(triple: [number, number, number]): number {
  return relativeLuminance(oklchToLinearSrgb(...triple))
}

describe('dark palette / chart color sync', () => {
  it('--chart-1..5 in tailwind.css .dark match CHART_OKLCH_BY_THEME.dark exactly', () => {
    const block = darkBlock()
    const fromCss = [1, 2, 3, 4, 5].map(n => readToken(block, `chart-${n}`))
    expect(fromCss).toEqual(CHART_OKLCH_BY_THEME.dark)
  })
})

describe('dark palette / WCAG AA contrast (computed, not assumed)', () => {
  const pairs: Array<[string, string]> = [
    ['foreground', 'background'],
    ['foreground', 'card'],
    ['muted-foreground', 'background'],
    ['muted-foreground', 'card'],
    ['primary-foreground', 'primary'],
    ['destructive-foreground', 'destructive'],
    ['success-foreground', 'success'],
    ['warning-foreground', 'warning'],
    ['accent-foreground', 'accent'],
    ['sidebar-foreground', 'sidebar'],
  ]

  it('every foreground/background pair reaches at least 4.5:1', () => {
    const block = darkBlock()
    for (const [fg, bg] of pairs) {
      const ratio = contrastRatio(luminanceOf(readToken(block, fg)), luminanceOf(readToken(block, bg)))
      expect(ratio, `${fg} / ${bg} must be >= 4.5, got ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
