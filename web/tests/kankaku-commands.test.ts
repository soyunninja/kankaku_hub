import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json'
import es from '../i18n/locales/es.json'
import {
  COMMAND_GROUPS,
  filterCommands,
  KANKAKU_COMMANDS,
  KANKAKU_ENV_VARS,
  ROUTE_NAV_KEYS,
} from '../app/lib/kankaku-commands'
import type { SearchableCommand } from '../app/lib/kankaku-commands'

/** Reads a dotted path (e.g. `commands.items.sync.description`) out of a plain locale object. */
function readPath(dict: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], dict)
}

describe('KANKAKU_COMMANDS', () => {
  it('has unique ids', () => {
    const ids = KANKAKU_COMMANDS.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every command belongs to a known group', () => {
    for (const c of KANKAKU_COMMANDS) {
      expect(COMMAND_GROUPS).toContain(c.group)
    }
  })

  it('every command has both an es and en description and whenToUse string', () => {
    for (const dict of [es, en] as Record<string, unknown>[]) {
      for (const c of KANKAKU_COMMANDS) {
        const description = readPath(dict, `commands.items.${c.id}.description`)
        const whenToUse = readPath(dict, `commands.items.${c.id}.whenToUse`)
        expect(typeof description === 'string' && description.trim().length > 0, `commands.items.${c.id}.description`).toBe(true)
        expect(typeof whenToUse === 'string' && whenToUse.trim().length > 0, `commands.items.${c.id}.whenToUse`).toBe(true)
      }
    }
  })

  it('every relatedRoute has a known nav i18n key with an es and en label', () => {
    for (const c of KANKAKU_COMMANDS) {
      if (!c.relatedRoute) continue
      const navKey = ROUTE_NAV_KEYS[c.relatedRoute]
      expect(navKey, `no ROUTE_NAV_KEYS entry for ${c.relatedRoute}`).toBeTruthy()
      for (const dict of [es, en] as Record<string, unknown>[]) {
        const label = readPath(dict, navKey!)
        expect(typeof label === 'string' && label.trim().length > 0, navKey).toBe(true)
      }
    }
  })
})

describe('KANKAKU_ENV_VARS', () => {
  it('has a unique name per variable, and an es/en meaning string', () => {
    const names = KANKAKU_ENV_VARS.map(v => v.name)
    expect(new Set(names).size).toBe(names.length)

    for (const dict of [es, en] as Record<string, unknown>[]) {
      for (const v of KANKAKU_ENV_VARS) {
        const meaning = readPath(dict, `commands.config.env.${v.i18nKey}`)
        expect(typeof meaning === 'string' && meaning.trim().length > 0, `commands.config.env.${v.i18nKey}`).toBe(true)
      }
    }
  })
})

describe('filterCommands', () => {
  const commands: SearchableCommand[] = [
    { id: 'sync', syntax: '/kankaku sync', group: 'hub', requiresHub: true, description: 'Pushes pending tasks to the hub.', whenToUse: 'To force a manual sync.' },
    { id: 'tasks', syntax: '/kankaku tasks', group: 'reports', requiresHub: false, description: 'One line per task.', whenToUse: 'To review this session.' },
    { id: 'export', syntax: '/kankaku export [csv|json] [all]', group: 'export', requiresHub: false, description: 'Writes a file.', whenToUse: 'To take data outside pi.' },
  ]

  it('returns every command for an empty or whitespace-only query', () => {
    expect(filterCommands(commands, '')).toEqual(commands)
    expect(filterCommands(commands, '   ')).toEqual(commands)
  })

  it('matches on syntax, case-insensitively', () => {
    expect(filterCommands(commands, 'SYNC').map(c => c.id)).toEqual(['sync'])
  })

  it('matches on description text', () => {
    expect(filterCommands(commands, 'pending tasks').map(c => c.id)).toEqual(['sync'])
  })

  it('matches on whenToUse text', () => {
    expect(filterCommands(commands, 'spreadsheet').map(c => c.id)).toEqual([])
    expect(filterCommands(commands, 'outside pi').map(c => c.id)).toEqual(['export'])
  })

  it('returns an empty array when nothing matches', () => {
    expect(filterCommands(commands, 'nonexistent-command-xyz')).toEqual([])
  })
})
