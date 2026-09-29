import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json'
import es from '../i18n/locales/es.json'
import ja from '../i18n/locales/ja.json'

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

function getValue(dict: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], dict)
}

/** vue-i18n `{token}` interpolation placeholders used by this app's strings. */
const PLACEHOLDER_RE = /\{[a-zA-Z]+\}/g

function placeholdersOf(value: string): Set<string> {
  return new Set(value.match(PLACEHOLDER_RE) ?? [])
}

const LOCALES = [
  ['es', es],
  ['en', en],
  ['ja', ja],
] as const

describe('i18n locale parity', () => {
  it('es, en and ja expose exactly the same set of translation keys', () => {
    const keysByLocale = LOCALES.map(([name, dict]) => [name, new Set(flattenKeys(dict))] as const)

    for (const [name, keys] of keysByLocale) {
      for (const [otherName, otherKeys] of keysByLocale) {
        if (name === otherName) continue
        const missing = [...keys].filter(k => !otherKeys.has(k)).sort()
        expect(missing, `keys present in ${name}.json but missing from ${otherName}.json`).toEqual([])
      }
    }
  })

  it('no translation value is an empty string', () => {
    for (const [name, dict] of LOCALES) {
      for (const key of flattenKeys(dict)) {
        const value = getValue(dict, key)
        expect(typeof value === 'string' && value.trim().length > 0, `${name}.${key} should be a non-empty string`).toBe(true)
      }
    }
  })

  it('en and ja use exactly the same {placeholder} tokens as es, for every key', () => {
    const esKeys = flattenKeys(es)
    for (const [name, dict] of LOCALES) {
      if (name === 'es') continue
      for (const key of esKeys) {
        const esValue = getValue(es, key)
        const otherValue = getValue(dict, key)
        if (typeof esValue !== 'string' || typeof otherValue !== 'string') continue
        const esPlaceholders = placeholdersOf(esValue)
        const otherPlaceholders = placeholdersOf(otherValue)
        const missing = [...esPlaceholders].filter(p => !otherPlaceholders.has(p))
        const extra = [...otherPlaceholders].filter(p => !esPlaceholders.has(p))
        expect(missing, `${name}.${key} is missing placeholder(s) present in es.json: ${missing.join(', ')}`).toEqual([])
        expect(extra, `${name}.${key} has extra placeholder(s) not present in es.json: ${extra.join(', ')}`).toEqual([])
      }
    }
  })
})

describe('shared search copy', () => {
  it('provides localized combobox empty text and search labels', () => {
    expect(en.common.search).toBe('Search')
    expect(es.common.search).toBe('Buscar')
    expect(ja.common.search).toBe('検索')
    expect(en.common.noResults).toBe('No results found.')
    expect(es.common.noResults).toBe('No se encontraron resultados.')
    expect(ja.common.noResults).toBe('結果が見つかりません。')
  })
})

describe('ja.json translation sanity', () => {
  /**
   * Pragmatic, not brittle: only flags a handful of whole Spanish/English
   * UI words that would be a clear sign a string was left untranslated
   * (copy-pasted from es/en instead of translated), checked on a sample
   * of core, high-traffic keys rather than every string in the file —
   * technical labels legitimately keep literal env var names and code
   * tokens (e.g. "KANKAKU_SYNC_PROMPT", "task_entries") in every locale,
   * which this check must not flag.
   */
  const CORE_SAMPLE_KEYS = [
    'nav.dashboard',
    'nav.clients',
    'nav.projects',
    'nav.tasks',
    'nav.unassigned',
    'nav.entries',
    'nav.settings',
    'nav.logout',
    'theme.label',
    'theme.dark',
    'theme.light',
    'theme.system',
    'common.save',
    'common.cancel',
    'common.edit',
    'common.delete',
    'common.archive',
    'common.active',
    'common.inactive',
    'common.search',
    'common.noResults',
    'dashboard.title',
    'dashboard.kpi.workTime',
    'dashboard.kpi.waitingTime',
    'dashboard.kpi.cost',
    'clients.title',
    'clients.new',
    'projects.title',
    'tasks.title',
    'tasks.board',
    'tasks.list',
    'settings.title',
    'settings.appearance',
    'settings.language',
    'settings.website',
    'entries.detail.promptEmptyLink',
    'commands.copy',
    'commands.copied',
    'commands.copyAria',
  ] as const

  // Whole-word matches only (case-insensitive), so this never flags a
  // Japanese string merely for containing Latin product names/code
  // tokens as a substring.
  const SUSPECT_WORDS = [
    'dashboard', 'clients', 'projects', 'tasks', 'settings', 'commands',
    'save', 'cancel', 'edit', 'delete', 'archive', 'active', 'inactive',
    'search', 'copy', 'entries', 'logout', 'log out',
    'panel', 'clientes', 'proyectos', 'tareas', 'ajustes', 'comandos',
    'guardar', 'cancelar', 'editar', 'eliminar', 'archivar', 'activo',
    'inactivo', 'buscar', 'copiar', 'registros', 'cerrar sesión',
  ]
  const suspectRe = new RegExp(`\\b(${SUSPECT_WORDS.join('|')})\\b`, 'i')

  it('the core UI keys are actually translated into Japanese, not left in es/en', () => {
    for (const key of CORE_SAMPLE_KEYS) {
      const value = getValue(ja, key)
      expect(typeof value).toBe('string')
      expect(suspectRe.test(value as string), `ja.${key} ("${value}") looks untranslated`).toBe(false)
    }
  })

  it('every ja string contains at least one Japanese character', () => {
    const hasKana = /[぀-ヿ一-鿿]/
    for (const key of flattenKeys(ja)) {
      const value = getValue(ja, key) as string
      // A handful of leaf values are intentionally untranslated product
      // names, category labels or code — mirrors the same literal value
      // in both es.json and en.json (see web/i18n/GLOSSARY.md).
      const esValue = getValue(es, key)
      const enValue = getValue(en, key)
      if (value === esValue && value === enValue) continue
      expect(hasKana.test(value), `ja.${key} ("${value}") contains no Japanese characters`).toBe(true)
    }
  })
})
