/**
 * Guards for both palettes (see odd/tasks/dark-theme-gentleman-cute.md):
 * dark uses neutral charcoal surfaces and role-matched light brand pink.
 * Ordinary dark text remains neutral; filled primary labels use white. Keeps each theme's
 * `--chart-1..5` in `app/assets/css/tailwind.css` (`.dark` / `:root`) and
 * `CHART_OKLCH_BY_THEME` in `app/lib/client-avatar.ts` from silently
 * drifting apart, and computes (rather than assumes) WCAG AA contrast for
 * every foreground/background pair each theme actually renders.
 */
import { createHash } from 'node:crypto'
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

/** Extracts the `:root { ... }` block's raw body (first match only — the
 * file has exactly one `:root` rule with color tokens). */
function rootBlock(): string {
  const match = css.match(/:root\s*\{([\s\S]*?)\n\}/)
  if (!match) throw new Error('could not find a :root { ... } block in tailwind.css')
  return match[1]
}

/** Extracts the `.dark { ... }` block's raw body (first match only — the
 * file has exactly one `.dark` rule). */
function darkBlock(): string {
  const match = css.match(/\.dark\s*\{([\s\S]*?)\n\}/)
  if (!match) throw new Error('could not find a .dark { ... } block in tailwind.css')
  return match[1]
}

/** Parses a token's `oklch(L C H)` or `oklch(L C H / A%)` value out of a
 * block body. Returns the L/C/H triple; alpha (if present) is ignored,
 * since the contrast pairs checked here are all alpha-less. */
function readToken(block: string, name: string): [number, number, number] {
  const re = new RegExp(`--${name}:\\s*oklch\\(\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)`)
  const match = block.match(re)
  if (!match) throw new Error(`token --${name} not found in block`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function luminanceOf(triple: [number, number, number]): number {
  return relativeLuminance(oklchToLinearSrgb(...triple))
}

/** Same ten foreground/background pairs checked in both themes. */
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

const charcoal = {
  background: [0.191251, 0, 0],
  card: [0.226450, 0, 0],
  popover: [0.280940, 0, 0],
  secondary: [0.280940, 0, 0],
  muted: [0.226450, 0, 0],
  'muted-foreground': [0.810, 0, 0],
  border: [0.340697, 0, 0],
  input: [0.680, 0, 0],
  sidebar: [0.226450, 0, 0],
  'sidebar-border': [0.340697, 0, 0],
} satisfies Record<string, [number, number, number]>

// Only these explicitly authorized pink/interaction roles may change in this phase.
const matchedPinkRoles = [
  'primary', 'primary-foreground', 'ring', 'chart-1', 'accent', 'accent-foreground',
  'sidebar-primary', 'sidebar-primary-foreground', 'sidebar-ring', 'sidebar-accent', 'sidebar-accent-foreground',
]

function encodedRgb(triple: [number, number, number]): number[] {
  return oklchToLinearSrgb(...triple).map(value => {
    const channel = Math.max(0, Math.min(1, value))
    return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055
  })
}

function pixelLuminance(rgb: number[]): number {
  return relativeLuminance(rgb.map(value => {
    const channel = Math.round(value * 255) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }) as [number, number, number])
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

describe('palette guards', () => {
  it('preserves the approved light block byte-for-byte, including the #F9F9F9 canvas', () => {
    expect(sha256(rootBlock())).toBe('2f2e795af397435fa726d9c5dfb0f1273806ab5639fdb4ef78e048a023fa3ecc')
  })

  it('renders the light canvas as #F9F9F9 and cards as #FFFFFF', () => {
    const block = rootBlock()
    expect(readToken(block, 'background')).toEqual([0.982117640, 0, 0])
    expect(readToken(block, 'card')).toEqual([1, 0, 0])
    expect(encodedRgb(readToken(block, 'background')).map(channel => Math.round(channel * 255))).toEqual([249, 249, 249])
    expect(encodedRgb(readToken(block, 'card')).map(channel => Math.round(channel * 255))).toEqual([255, 255, 255])
  })

  it('uses exact opaque neutral charcoal tokens with mirrored sidebar surfaces', () => {
    const block = darkBlock()
    for (const [name, expected] of Object.entries(charcoal)) {
      expect(readToken(block, name), name).toEqual(expected)
      expect(block.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]).not.toContain('/')
    }
    expect(readToken(block, 'sidebar')).toEqual(readToken(block, 'card'))
    expect(readToken(block, 'sidebar-border')).toEqual(readToken(block, 'border'))
  })

  it('preserves every unrelated dark declaration and comment, including body text, status and chart-2..5', () => {
    const kept = darkBlock().split('\n').filter(line =>
      ![...Object.keys(charcoal), ...matchedPinkRoles].some(name => line.trim().startsWith(`--${name}:`)),
    ).join('\n')
    expect(sha256(kept)).toBe('4365e4e0d2dc9fb18fc7bca59e47d4e8f8c1e1215d1d7bd3418516c655c8080f')
  })

  it('matches corresponding light pink roles, not one pink for every role', () => {
    for (const role of ['primary', 'sidebar-primary', 'ring', 'sidebar-ring', 'primary-foreground', 'sidebar-primary-foreground', 'chart-1']) {
      expect(readToken(darkBlock(), role), role).toEqual(readToken(rootBlock(), role))
    }
    expect(readToken(darkBlock(), 'chart-1')).not.toEqual(readToken(darkBlock(), 'primary'))
    for (const role of ['accent-foreground', 'sidebar-accent-foreground']) {
      expect(readToken(darkBlock(), role)).toEqual(readToken(darkBlock(), 'foreground'))
    }
    for (const role of ['accent', 'sidebar-accent']) {
      expect(readToken(darkBlock(), role)).toEqual(readToken(darkBlock(), 'secondary'))
    }
  })

  it('protects actual quantized pink graphic, filled-label and avatar contrast', () => {
    for (const block of [rootBlock(), darkBlock()]) {
      for (const surface of ['background', 'card', 'muted', 'sidebar']) {
        for (const role of ['primary', 'sidebar-primary']) {
          expect(contrastRatio(pixelLuminance(encodedRgb(readToken(block, role))), pixelLuminance(encodedRgb(readToken(block, surface)))), `${role} graphic / ${surface}`).toBeGreaterThanOrEqual(3)
        }
      }
      // Elevated dark surfaces require the existing neutral foreground, not
      // rounding exact brand pink's 2.986:1 up to 3 or changing its primitive.
      for (const surface of ['popover', 'secondary', 'accent']) {
        const paint = block === darkBlock() ? 'foreground' : 'primary'
        expect(contrastRatio(pixelLuminance(encodedRgb(readToken(block, paint))), pixelLuminance(encodedRgb(readToken(block, surface))))).toBeGreaterThanOrEqual(3)
        if (block === darkBlock()) expect(contrastRatio(pixelLuminance(encodedRgb(readToken(block, 'primary'))), pixelLuminance(encodedRgb(readToken(block, surface))))).toBeLessThan(3)
      }
      for (const [fg, bg] of [['primary-foreground', 'primary'], ['sidebar-primary-foreground', 'sidebar-primary']]) {
        expect(contrastRatio(pixelLuminance(encodedRgb(readToken(block, fg!))), pixelLuminance(encodedRgb(readToken(block, bg!))))).toBeGreaterThanOrEqual(4.5)
      }
      for (let n = 1; n <= 5; n++) {
        expect(contrastRatio(pixelLuminance(encodedRgb(readToken(rootBlock(), 'avatar-foreground'))), pixelLuminance(encodedRgb(readToken(block, `chart-${n}`))))).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('uses neutral dark ordinary link and selected-navigation labels without changing the active icon', () => {
    expect(readFileSync(resolve(process.cwd(), 'app/components/ui/button/index.ts'), 'utf8')).toContain('link: "text-foreground underline-offset-4 hover:underline"')
    for (const path of ['app/pages/settings/index.vue', 'app/components/entries/EntryDetailSheet.vue']) {
      expect(readFileSync(resolve(process.cwd(), path), 'utf8'), path).toContain('text-primary dark:text-foreground')
    }
    const nav = readFileSync(resolve(process.cwd(), 'app/components/app-shell/SidebarNav.vue'), 'utf8')
    expect(nav).toContain("'text-sidebar-primary dark:text-sidebar-foreground': isActive(item.to)")
    expect(nav).toContain("isActive(item.to) ? 'text-sidebar-primary' : 'text-sidebar-foreground'")
    expect(nav).toContain('hover:bg-muted')
    expect(nav).toContain('focus-visible:ring-focus-indicator')
    expect(nav).toContain(':aria-current=')
  })

  it('protects filled-field text, opaque indicators and retained textarea boundaries', () => {
    const block = darkBlock()
    const inputSource = readFileSync(resolve(process.cwd(), 'app/components/ui/input/Input.vue'), 'utf8')
    const buttonSource = readFileSync(resolve(process.cwd(), 'app/components/ui/button/index.ts'), 'utf8')
    expect(inputSource).toContain('placeholder:text-muted-foreground')
    expect(inputSource).toContain('control-size control-field')
    const textareaSource = readFileSync(resolve(process.cwd(), 'app/components/ui/textarea/Textarea.vue'), 'utf8')
    expect(textareaSource).toContain('dark:bg-input/30')
    expect(textareaSource).toContain('rounded-md border')
    expect(buttonSource).toContain('hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-accent')
    expect(buttonSource).toContain('whitespace-nowrap border-0')
    expect(buttonSource).not.toContain('dark:border-input')
    expect(buttonSource).toContain('focus-visible:ring-focus-indicator focus-visible:ring-3')
    expect(buttonSource).toContain('aria-invalid:ring-destructive aria-invalid:focus-visible:ring-destructive aria-invalid:ring-3')
    expect(inputSource).toContain('focus-visible:ring-focus-indicator focus-visible:ring-3')
    expect(inputSource).toContain('aria-invalid:ring-destructive aria-invalid:focus-visible:ring-destructive aria-invalid:ring-3')
    expect(css).toContain('border-width: 0 !important')
    for (const role of ['checkbox', 'radio', 'switch', 'combobox']) expect(css).toContain(`[role="${role}"]`)
    expect(buttonSource).not.toContain('dark:hover:bg-input/50')
    for (const surface of ['background', 'card', 'popover', 'secondary', 'muted', 'sidebar']) {
      const bg = readToken(block, surface)
      for (const fg of ['foreground', 'muted-foreground']) {
        expect(contrastRatio(luminanceOf(readToken(block, fg)), luminanceOf(bg)), `${fg} / ${surface}`).toBeGreaterThanOrEqual(4.5)
      }
      // color-mix with transparent retains the input color and changes alpha.
      // Browser painting composites its encoded sRGB over the actual surface,
      // not the OKLab lightnesses. Quantize after compositing to sampled pixels.
      const input = readToken(block, 'input')
      const inputRgb = encodedRgb(input)
      const bgRgb = encodedRgb(bg)
      const fill = inputRgb.map((channel, i) => Math.round((channel * 0.3 + bgRgb[i]! * 0.7) * 255) / 255)
      expect(contrastRatio(pixelLuminance(encodedRgb(readToken(block, 'muted-foreground'))), pixelLuminance(fill)), `retained textarea stroke / ${surface} fill`).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(pixelLuminance(encodedRgb(readToken(block, 'muted-foreground'))), pixelLuminance(fill)), `placeholder / ${surface} fill`).toBeGreaterThanOrEqual(4.5)
      const hover = encodedRgb(readToken(block, 'accent'))
      expect(contrastRatio(pixelLuminance(encodedRgb(readToken(block, 'accent-foreground'))), pixelLuminance(hover)), `outline hover text / ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('keeps compact sizes explicit and standalone actions independent', () => {
    const button = readFileSync(resolve(process.cwd(), 'app/components/ui/button/index.ts'), 'utf8')
    expect(button).toContain('"default": "control-size"')
    expect(button).toContain('"icon-sm": "size-8 rounded-[8px] p-0 text-sm"')
    expect(button).toContain('"calendar-nav": "size-7 rounded-[8px] p-0 text-sm"')
    for (const [file, size] of [['CalendarCellTrigger', 'icon-sm'], ['CalendarPrevButton', 'calendar-nav'], ['CalendarNextButton', 'calendar-nav']]) {
      expect(readFileSync(resolve(process.cwd(), `app/components/ui/calendar/${file}.vue`), 'utf8')).toContain(`size: '${size}'`)
    }
    expect(readFileSync(resolve(process.cwd(), 'app/components/common/RowActions.vue'), 'utf8')).toContain('size="icon-sm"')
    expect(css).toContain('[data-slot="calendar"] [data-slot="native-select"] {\n  height: 32px;')
    expect(button).not.toContain('hover:bg-primary/90')
    expect(button).toContain('dark:bg-destructive/60 dark:hover:bg-destructive/60')
  })

  it('uses existing neutral boundaries and opaque semantic-widget focus in both palettes', () => {
    for (const widget of ['checkbox/Checkbox', 'textarea/Textarea', 'switch/Switch']) {
      const source = readFileSync(resolve(process.cwd(), `app/components/ui/${widget}.vue`), 'utf8')
      expect(source).toContain('focus-visible:ring-focus-indicator ')
      expect(source).not.toContain('focus-visible:ring-focus-indicator/50')
      expect(source).toContain(widget.startsWith('switch') ? 'data-[state=unchecked]:bg-muted-foreground' : 'border-muted-foreground')
    }
    for (const block of [rootBlock(), darkBlock()]) for (const surface of ['background', 'card', 'popover']) {
      expect(contrastRatio(luminanceOf(readToken(block, 'muted-foreground')), luminanceOf(readToken(block, surface)))).toBeGreaterThanOrEqual(3)
      const focusPaint = block === darkBlock() ? 'foreground' : 'ring'
      expect(contrastRatio(pixelLuminance(encodedRgb(readToken(block, focusPaint))), pixelLuminance(encodedRgb(readToken(block, surface))))).toBeGreaterThanOrEqual(3)
    }
  })

  it('separates focus paint from brand tokens and retains full red invalid priority', () => {
    expect(css).toContain('--color-focus-indicator: var(--focus-indicator)')
    expect(css).toContain(':where(html) {\n  --focus-indicator: var(--ring);')
    expect(css).toContain(':where(html.dark) {\n  --focus-indicator: var(--foreground);')
    expect(css).not.toMatch(/\*\s*\{[^}]*--tw-ring-color/)
    for (const path of ['badge/index.ts', 'checkbox/Checkbox.vue', 'textarea/Textarea.vue', 'button/index.ts', 'input/Input.vue', 'select/Select.vue', 'native-select/NativeSelect.vue']) {
      const source = readFileSync(resolve(process.cwd(), `app/components/ui/${path}`), 'utf8')
      expect(source, path).toContain('aria-invalid:focus-visible:ring-destructive')
      expect(source, path).toContain('aria-invalid:ring-destructive ')
      expect(source, path).not.toContain('aria-invalid:ring-destructive/')
    }
    const badge = readFileSync(resolve(process.cwd(), 'app/components/ui/badge/index.ts'), 'utf8')
    expect(badge).toContain('bg-primary text-primary-foreground [a&]:hover:bg-primary"')
    const calendar = readFileSync(resolve(process.cwd(), 'app/components/ui/calendar/CalendarCellTrigger.vue'), 'utf8')
    expect(calendar).toContain('dark:data-[selected]:bg-foreground dark:data-[selected]:text-background')
  })

  it('keeps all 73 design primitives and sidecar ramps synchronized with CSS', () => {
    const design = readFileSync(resolve(process.cwd(), '../DESIGN.md'), 'utf8')
    const colors = design.match(/^colors:\n([\s\S]*?)^typography:/m)![1]!
    const fromDesign = Object.fromEntries([...colors.matchAll(/^ {2}([\w-]+): "([^"]+)"/gm)].map(match => [match[1]!, match[2]!]))
    const fromCss = Object.fromEntries([...[...rootBlock().matchAll(/--([\w-]+):\s*(oklch\([^)]+\))/g)].map(match => [match[1]!, match[2]!]), ...[...darkBlock().matchAll(/--([\w-]+):\s*(oklch\([^)]+\))/g)].map(match => [`dark-${match[1]!}`, match[2]!])])
    const sidecar = JSON.parse(readFileSync(resolve(process.cwd(), '../.impeccable/design.json'), 'utf8'))
    expect(Object.keys(fromCss)).toHaveLength(73)
    expect(fromDesign).toEqual(fromCss)
    expect(Object.keys(sidecar.extensions.colorMeta).sort()).toEqual(Object.keys(fromCss).sort())
    for (const [name, primitive] of Object.entries(fromCss)) {
      const meta = sidecar.extensions.colorMeta[name]
      expect(meta.primitive, name).toBe(primitive)
      expect(meta.tonalRamp, name).toHaveLength(8)
      const triple = (value: string) => value.match(/[\d.]+/g)!.map(Number)
      for (const step of meta.tonalRamp) expect(triple(step).slice(1), name).toEqual(triple(primitive).slice(1))
    }
    for (const name of ['dark-accent', 'dark-accent-foreground', 'dark-sidebar-accent', 'dark-sidebar-accent-foreground']) expect(sidecar.extensions.colorMeta[name].role).toBe('neutral')
    expect(sidecar.extensions.metadata.focusPaint).toContain('light var(--ring), dark var(--foreground)')
    for (const preview of sidecar.components.filter((component: { kind: string }) => ['button', 'input', 'nav'].includes(component.kind))) expect(preview.css).toContain('var(--focus-indicator,')
  })

  describe('dark palette / chart color sync', () => {
    it('--chart-1..5 in tailwind.css .dark match CHART_OKLCH_BY_THEME.dark exactly', () => {
      const block = darkBlock()
      const fromCss = [1, 2, 3, 4, 5].map(n => readToken(block, `chart-${n}`))
      expect(fromCss).toEqual(CHART_OKLCH_BY_THEME.dark)
    })
  })

  describe('dark palette / WCAG AA contrast (computed, not assumed)', () => {
    it('every foreground/background pair reaches at least 4.5:1', () => {
      const block = darkBlock()
      for (const [fg, bg] of pairs) {
        const ratio = contrastRatio(luminanceOf(readToken(block, fg)), luminanceOf(readToken(block, bg)))
        expect(ratio, `${fg} / ${bg} must be >= 4.5, got ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
      }
    })
  })

  describe('light palette / chart color sync', () => {
    it('--chart-1..5 in tailwind.css :root match CHART_OKLCH_BY_THEME.light exactly', () => {
      const block = rootBlock()
      const fromCss = [1, 2, 3, 4, 5].map(n => readToken(block, `chart-${n}`))
      expect(fromCss).toEqual(CHART_OKLCH_BY_THEME.light)
    })
  })

  describe('light palette / WCAG AA contrast (computed, not assumed)', () => {
    it('every foreground/background pair reaches at least 4.5:1', () => {
      const block = rootBlock()
      for (const [fg, bg] of pairs) {
        const ratio = contrastRatio(luminanceOf(readToken(block, fg)), luminanceOf(readToken(block, bg)))
        expect(ratio, `${fg} / ${bg} must be >= 4.5, got ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
      }
    })
  })
})
