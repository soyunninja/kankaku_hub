import { describe, expect, it } from 'vitest'
import { normalizeLabel, suggestClient } from '../app/lib/suggest-client'

const clients = [
  { id: 'c1', name: 'Cajamar', code: 'cajamar' },
  { id: 'c2', name: 'Acme', code: 'acme' },
  { id: 'c3', name: 'Turismo Níjar', code: 'turismo-nijar' },
]

describe('normalizeLabel', () => {
  it('lowercases, strips spaces/punctuation and diacritics', () => {
    expect(normalizeLabel('Caja Mar')).toBe('cajamar')
    expect(normalizeLabel('CAJAMAR')).toBe('cajamar')
    expect(normalizeLabel('Turismo Níjar')).toBe('turismonijar')
    expect(normalizeLabel('turismo-nijar')).toBe('turismonijar')
  })
})

describe('suggestClient', () => {
  it('suggests on an exact normalised match against the client name', () => {
    expect(suggestClient('Caja Mar', clients)?.id).toBe('c1')
    expect(suggestClient('cajamar', clients)?.id).toBe('c1')
    expect(suggestClient('CAJAMAR', clients)?.id).toBe('c1')
  })

  it('suggests on an exact normalised match against the client code', () => {
    expect(suggestClient('turismo-nijar', clients)?.id).toBe('c3')
  })

  it('matches case/space/accent-insensitively across a full name', () => {
    expect(suggestClient('TurismoNijar', clients)?.id).toBe('c3')
    expect(suggestClient('turismo nijar', clients)?.id).toBe('c3')
  })

  it('does not suggest on a near-miss typo (conservative by design)', () => {
    expect(suggestClient('cjamar', clients)).toBeUndefined()
  })

  it('does not suggest when the label has extra words not in any client name', () => {
    expect(suggestClient('acme sl', clients)).toBeUndefined()
  })

  it('does not suggest for an empty or placeholder label', () => {
    expect(suggestClient('', clients)).toBeUndefined()
    expect(suggestClient('(sin etiqueta)', clients)).toBeUndefined()
  })

  it('returns undefined when nothing matches at all', () => {
    expect(suggestClient('completely unrelated', clients)).toBeUndefined()
  })
})
