import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, resolveBreadcrumbLabels, SEGMENT_LABELS } from '../app/lib/nav-items'
import en from '../i18n/locales/en.json'
import es from '../i18n/locales/es.json'
import ja from '../i18n/locales/ja.json'

function getValue(dict: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], dict)
}

/** Minimal stand-in for vue-i18n's `t`, resolving a dotted key against one locale dict. */
function translator(dict: Record<string, unknown>) {
  return (key: string): string => {
    const value = getValue(dict, key)
    if (typeof value !== 'string') throw new Error(`missing translation key "${key}"`)
    return value
  }
}

const LOCALES = [
  ['es', es],
  ['en', en],
  ['ja', ja],
] as const

describe('NAV_ITEMS', () => {
  it('covers every top-level route the app links to', () => {
    const paths = NAV_ITEMS.map(item => item.to)
    expect(paths).toEqual([
      '/',
      '/clients',
      '/projects',
      '/tasks',
      '/unassigned',
      '/sessions-without-task',
      '/entries',
      '/commands',
      '/settings',
    ])
  })

  it('every labelKey resolves to a real, non-empty string in all three locales', () => {
    for (const [name, dict] of LOCALES) {
      for (const item of NAV_ITEMS) {
        const value = getValue(dict, item.labelKey)
        expect(typeof value === 'string' && value.trim().length > 0, `${name}.${item.labelKey} (route ${item.to})`).toBe(true)
      }
    }
  })

  it('SEGMENT_LABELS has an entry for every non-root NAV_ITEMS route', () => {
    for (const item of NAV_ITEMS) {
      if (item.to === '/') continue
      const segment = item.to.slice(1)
      expect(SEGMENT_LABELS[segment], `segment "${segment}" (route ${item.to})`).toBeTruthy()
    }
  })
})

describe('resolveBreadcrumbLabels', () => {
  for (const [name, dict] of LOCALES) {
    const t = translator(dict)

    it(`produces a non-raw-slug, translated breadcrumb for every NAV_ITEMS route (${name})`, () => {
      for (const item of NAV_ITEMS) {
        const labels = resolveBreadcrumbLabels(item.to, t)
        expect(labels.length).toBeGreaterThan(0)
        for (const label of labels) {
          expect(label.trim().length).toBeGreaterThan(0)
          // The raw path segment (e.g. "sessions-without-task") must never
          // leak through untranslated.
          const rawSegment = item.to === '/' ? null : item.to.slice(1)
          if (rawSegment) expect(label).not.toBe(rawSegment)
        }
      }
    })
  }

  it('shows the full page title, not the compact nav label, for /sessions-without-task', () => {
    const t = translator(es)
    expect(resolveBreadcrumbLabels('/sessions-without-task', t)).toEqual([es.sessionsQueue.title])
    expect(es.sessionsQueue.title).not.toBe(es.nav.sessionsQueue)
  })

  it('falls back to the dashboard crumb for an unmapped route, never a raw slug', () => {
    const t = translator(es)
    expect(resolveBreadcrumbLabels('/some-future-unmapped-route', t)).toEqual([es.nav.dashboard])
  })

  it('falls back to the nearest known parent for an unmapped nested segment (e.g. a dynamic id)', () => {
    const t = translator(es)
    expect(resolveBreadcrumbLabels('/projects/abc123', t)).toEqual([es.nav.projects])
  })

  it('returns the dashboard crumb for the root path', () => {
    const t = translator(es)
    expect(resolveBreadcrumbLabels('/', t)).toEqual([es.nav.dashboard])
  })
})
