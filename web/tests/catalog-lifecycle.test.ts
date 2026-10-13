import { describe, expect, it } from 'vitest'
import { isOperationalProject } from '../app/lib/catalog-lifecycle'

describe('inherited catalog lifecycle', () => {
  const clients = [{ id: 'active', active: true }, { id: 'inactive', active: false }]

  it('requires both the project and known parent client to be explicitly active', () => {
    expect(isOperationalProject({ client: 'active', active: true }, clients)).toBe(true)
    expect(isOperationalProject({ client: 'inactive', active: true }, clients)).toBe(false)
    expect(isOperationalProject({ client: 'active', active: false }, clients)).toBe(false)
    expect(isOperationalProject({ client: 'missing', active: true }, clients)).toBe(false)
    expect(isOperationalProject({ client: 'active' }, clients)).toBe(false)
    expect(isOperationalProject(undefined, clients)).toBe(false)
  })
})
