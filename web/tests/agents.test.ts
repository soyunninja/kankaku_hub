import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AGENTS, resolveAgent } from '../app/lib/agents'

describe('resolveAgent', () => {
  it('resolves known slugs to their registry definition', () => {
    expect(resolveAgent('pi')).toEqual({
      slug: 'pi', label: 'pi', icon: '/agents/pi.svg', background: 'white',
    })
    expect(resolveAgent('opencode')).toEqual({
      slug: 'opencode', label: 'OpenCode', icon: '/agents/opencode.png', background: 'own',
    })
    expect(resolveAgent('claude-code')).toEqual({
      slug: 'claude-code', label: 'Claude Code', icon: '/agents/claude-code.svg', background: 'white',
    })
  })

  it('resolves Gentle-Shell without aliasing Pi or unknown agents', () => {
    const definition = {
      slug: 'gentle-shell', label: 'Gentle-Shell', icon: '/agents/gentle-shell.svg', background: 'white',
    }
    expect(resolveAgent('gentle-shell')).toEqual(definition)
    expect(resolveAgent('  Gentle-Shell  ')).toEqual(definition)
    expect(resolveAgent('gentle-shell-unknown')).toBeUndefined()
    expect(resolveAgent('pi')).toEqual(AGENTS.pi)
    const asset = readFileSync('public/agents/gentle-shell.svg')
    expect(createHash('sha256').update(asset).digest('hex'))
      .toBe('74b3f196dbe457ec20137010eee6fafa2d8c1f5c0b3e05f9ebde36f3aac8df08')
  })

  it('is case-insensitive, defensively, against non-lowercase legacy/seeded data', () => {
    expect(resolveAgent('PI')).toEqual(AGENTS.pi)
    expect(resolveAgent('OpenCode')).toEqual(AGENTS.opencode)
    expect(resolveAgent('Claude-Code')).toEqual(AGENTS['claude-code'])
    expect(resolveAgent('  pi  ')).toEqual(AGENTS.pi)
  })

  it('returns undefined for an unknown slug', () => {
    expect(resolveAgent('unknown-agent')).toBeUndefined()
  })

  it('returns undefined for empty, whitespace-only, undefined and null', () => {
    expect(resolveAgent('')).toBeUndefined()
    expect(resolveAgent('   ')).toBeUndefined()
    expect(resolveAgent(undefined)).toBeUndefined()
    expect(resolveAgent(null)).toBeUndefined()
  })
})
