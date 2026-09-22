import { describe, expect, it } from 'vitest'
import { canWrite, isReadOnlyRole } from '../app/lib/roles'

describe('canWrite', () => {
  it('is true for the owner role', () => {
    expect(canWrite('owner')).toBe(true)
  })
  it('is false for the service role', () => {
    expect(canWrite('service')).toBe(false)
  })
  it('is false for the viewer role', () => {
    expect(canWrite('viewer')).toBe(false)
  })
  it('is false for an unknown role string', () => {
    expect(canWrite('something-else')).toBe(false)
  })
  it('is false for undefined (not signed in / not yet loaded)', () => {
    expect(canWrite(undefined)).toBe(false)
  })
})

describe('isReadOnlyRole', () => {
  it('is true for the viewer role', () => {
    expect(isReadOnlyRole('viewer')).toBe(true)
  })
  it('is false for the owner role', () => {
    expect(isReadOnlyRole('owner')).toBe(false)
  })
  it('is false for the service role', () => {
    expect(isReadOnlyRole('service')).toBe(false)
  })
  it('is false for undefined', () => {
    expect(isReadOnlyRole(undefined)).toBe(false)
  })
})
