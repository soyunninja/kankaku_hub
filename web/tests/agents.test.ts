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
  })

  it('is case-insensitive, defensively, against non-lowercase legacy/seeded data', () => {
    expect(resolveAgent('PI')).toEqual(AGENTS.pi)
    expect(resolveAgent('OpenCode')).toEqual(AGENTS.opencode)
    expect(resolveAgent('  pi  ')).toEqual(AGENTS.pi)
  })

  it('returns undefined for an unknown slug', () => {
    expect(resolveAgent('claude-code')).toBeUndefined()
  })

  it('returns undefined for empty, whitespace-only, undefined and null', () => {
    expect(resolveAgent('')).toBeUndefined()
    expect(resolveAgent('   ')).toBeUndefined()
    expect(resolveAgent(undefined)).toBeUndefined()
    expect(resolveAgent(null)).toBeUndefined()
  })
})
