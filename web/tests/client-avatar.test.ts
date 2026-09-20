import { describe, expect, it } from 'vitest'
import {
  AVATAR_PALETTE_SIZE,
  avatarColorVar,
  avatarForegroundContrast,
  CHART_OKLCH_BY_THEME,
  clientInitials,
  contrastRatio,
  oklchToLinearSrgb,
  relativeLuminance,
  withCacheBust,
} from '../app/lib/client-avatar'

describe('clientInitials', () => {
  it('takes the first letter of up to two words, uppercased', () => {
    expect(clientInitials('Acme Corp')).toBe('AC')
  })
  it('handles a single-word name with one initial', () => {
    expect(clientInitials('Cajamar')).toBe('C')
  })
  it('ignores extra words beyond the first two', () => {
    expect(clientInitials('Banco Santander Central Hispano')).toBe('BS')
  })
  it('collapses repeated whitespace', () => {
    expect(clientInitials('  Acme   Corp  ')).toBe('AC')
  })
  it('falls back to "?" for an empty or whitespace-only name', () => {
    expect(clientInitials('')).toBe('?')
    expect(clientInitials('   ')).toBe('?')
  })
  it('is deterministic — same input, same output', () => {
    expect(clientInitials('Acme Corp')).toBe(clientInitials('Acme Corp'))
  })
  it('handles a name starting with a multi-byte character without throwing', () => {
    expect(clientInitials('Ñandú Studio')).toBe('ÑS')
  })
})

describe('avatarColorVar', () => {
  it('is deterministic — the same client id always maps to the same color', () => {
    const id = 'client-abc-123'
    expect(avatarColorVar(id)).toBe(avatarColorVar(id))
  })
  it('returns a var(--chart-N) reference within the palette size', () => {
    const value = avatarColorVar('some-client-id')
    const match = value.match(/^var\(--chart-(\d+)\)$/)
    expect(match).not.toBeNull()
    const n = Number(match![1])
    expect(n).toBeGreaterThanOrEqual(1)
    expect(n).toBeLessThanOrEqual(AVATAR_PALETTE_SIZE)
  })
  it('spreads a reasonable set of ids across more than one color', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `client-${i}`)
    const colors = new Set(ids.map(avatarColorVar))
    expect(colors.size).toBeGreaterThan(1)
  })
})

describe('avatarForegroundContrast (computed WCAG AA check)', () => {
  it('meets the 4.5:1 AA threshold for --avatar-foreground against every chart color, in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const [l, c, h] of CHART_OKLCH_BY_THEME[theme]) {
        const ratio = avatarForegroundContrast(l, c, h)
        expect(ratio, `${theme} oklch(${l} ${c} ${h}) contrast must be >= 4.5`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('is computed from real math, not hardcoded — a near-black vs. a near-white background differ', () => {
    // Sanity check on the underlying formula itself: a very dark oklch
    // color should have a LOW ratio against black text, and a very
    // light one should have a HIGH ratio — if this ever flipped, the
    // AA check above would be trivially (and wrongly) satisfied.
    const darkBg = avatarForegroundContrast(0.05, 0, 0)
    const lightBg = avatarForegroundContrast(0.98, 0, 0)
    expect(lightBg).toBeGreaterThan(darkBg)
  })

  it('white text would fail AA against these same chart colors (why --avatar-foreground is dark, not light)', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const [l, c, h] of CHART_OKLCH_BY_THEME[theme]) {
        const luminance = relativeLuminance(oklchToLinearSrgb(l, c, h))
        const whiteRatio = contrastRatio(luminance, 1)
        expect(whiteRatio).toBeLessThan(4.5)
      }
    }
  })
})

describe('withCacheBust', () => {
  it('appends a query param derived from the updated timestamp', () => {
    const url = withCacheBust('https://hub.local/api/files/clients/abc/favicon.png', '2026-09-20 10:00:00.000Z')
    expect(url).toContain('?v=')
    expect(url.startsWith('https://hub.local/api/files/clients/abc/favicon.png?v=')).toBe(true)
  })
  it('uses & when the URL already has a query string', () => {
    const url = withCacheBust('https://hub.local/file?thumb=100x100', '2026-09-20 10:00:00.000Z')
    expect(url).toContain('&v=')
    expect(url).not.toContain('?v=')
  })
  it('is deterministic for the same inputs', () => {
    const a = withCacheBust('https://hub.local/file.png', '2026-09-20 10:00:00.000Z')
    const b = withCacheBust('https://hub.local/file.png', '2026-09-20 10:00:00.000Z')
    expect(a).toBe(b)
  })
  it('changes when the updated timestamp changes, so a refreshed icon busts the old cache entry', () => {
    const a = withCacheBust('https://hub.local/file.png', '2026-09-20 10:00:00.000Z')
    const b = withCacheBust('https://hub.local/file.png', '2026-09-20 11:00:00.000Z')
    expect(a).not.toBe(b)
  })
  it('returns the input unchanged when the url is empty', () => {
    expect(withCacheBust('', '2026-09-20 10:00:00.000Z')).toBe('')
  })
  it('returns the input unchanged when updated is empty', () => {
    const url = 'https://hub.local/file.png'
    expect(withCacheBust(url, '')).toBe(url)
  })
  it('URL-encodes the timestamp', () => {
    const url = withCacheBust('https://hub.local/file.png', '2026-09-20 10:00:00.000Z')
    expect(url).toContain(encodeURIComponent('2026-09-20 10:00:00.000Z'))
  })
})
