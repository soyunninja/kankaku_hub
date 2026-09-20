import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json'
import es from '../i18n/locales/es.json'

/**
 * Flattens a nested translation object into dotted leaf-key paths, e.g.
 * `{ dashboard: { kpi: { cost: 'Cost' } } }` -> `['dashboard.kpi.cost']`.
 */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, path)
    }
    return [path]
  })
}

describe('i18n locale parity', () => {
  it('es and en expose exactly the same set of translation keys', () => {
    const esKeys = new Set(flattenKeys(es))
    const enKeys = new Set(flattenKeys(en))

    const missingInEn = [...esKeys].filter(k => !enKeys.has(k)).sort()
    const missingInEs = [...enKeys].filter(k => !esKeys.has(k)).sort()

    expect(missingInEn, 'keys present in es.json but missing from en.json').toEqual([])
    expect(missingInEs, 'keys present in en.json but missing from es.json').toEqual([])
  })

  it('no translation value is an empty string', () => {
    for (const [name, dict] of [['es', es], ['en', en]] as const) {
      for (const key of flattenKeys(dict)) {
        const value = key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], dict)
        expect(typeof value === 'string' && value.trim().length > 0, `${name}.${key} should be a non-empty string`).toBe(true)
      }
    }
  })
})
