import { describe, expect, it } from 'vitest'
import {
  displayUrlWithoutScheme,
  isSafeLinkUrl,
  isValidEmail,
  isValidWebsiteUrl,
  mapPocketBaseFieldErrors,
  normalizePhone,
  normalizeWebsiteUrl,
} from '../app/lib/client-contact'

describe('normalizeWebsiteUrl', () => {
  it('adds https:// to a bare domain', () => {
    expect(normalizeWebsiteUrl('example.com')).toBe('https://example.com')
  })
  it('trims surrounding whitespace before checking', () => {
    expect(normalizeWebsiteUrl('  example.com  ')).toBe('https://example.com')
  })
  it('leaves an already-schemed value untouched', () => {
    expect(normalizeWebsiteUrl('http://example.com')).toBe('http://example.com')
    expect(normalizeWebsiteUrl('https://example.com/path')).toBe('https://example.com/path')
  })
  it('does not add a scheme to a non-http scheme (validation rejects it separately)', () => {
    expect(normalizeWebsiteUrl('javascript:alert(1)')).toBe('javascript:alert(1)')
  })
  it('returns empty string for empty/whitespace-only input', () => {
    expect(normalizeWebsiteUrl('')).toBe('')
    expect(normalizeWebsiteUrl('   ')).toBe('')
  })
})

describe('isValidWebsiteUrl', () => {
  it('accepts empty (optional field)', () => {
    expect(isValidWebsiteUrl('')).toBe(true)
    expect(isValidWebsiteUrl('   ')).toBe(true)
  })
  it('accepts a normalized http(s) URL', () => {
    expect(isValidWebsiteUrl('https://example.com')).toBe(true)
    expect(isValidWebsiteUrl('http://example.com')).toBe(true)
  })
  it('rejects a bare domain (call normalizeWebsiteUrl first)', () => {
    expect(isValidWebsiteUrl('example.com')).toBe(false)
  })
  it('rejects a javascript: URL', () => {
    expect(isValidWebsiteUrl('javascript:alert(1)')).toBe(false)
  })
  it('rejects a data: URL', () => {
    expect(isValidWebsiteUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
  })
  it('rejects garbage text', () => {
    expect(isValidWebsiteUrl('not a url')).toBe(false)
  })
})

describe('isSafeLinkUrl', () => {
  it('accepts http(s) URLs', () => {
    expect(isSafeLinkUrl('https://example.com')).toBe(true)
    expect(isSafeLinkUrl('http://example.com')).toBe(true)
  })
  it('rejects javascript: URLs', () => {
    expect(isSafeLinkUrl('javascript:alert(document.cookie)')).toBe(false)
  })
  it('rejects data: and file: URLs', () => {
    expect(isSafeLinkUrl('data:text/html,x')).toBe(false)
    expect(isSafeLinkUrl('file:///etc/passwd')).toBe(false)
  })
  it('rejects empty/garbage', () => {
    expect(isSafeLinkUrl('')).toBe(false)
    expect(isSafeLinkUrl('not a url')).toBe(false)
  })
})

describe('displayUrlWithoutScheme', () => {
  it('strips https:// and a bare trailing slash', () => {
    expect(displayUrlWithoutScheme('https://example.com/')).toBe('example.com')
  })
  it('strips http:// and keeps a real path', () => {
    expect(displayUrlWithoutScheme('http://example.com/docs')).toBe('example.com/docs')
  })
  it('keeps query and hash', () => {
    expect(displayUrlWithoutScheme('https://example.com/search?q=1#top')).toBe('example.com/search?q=1#top')
  })
  it('returns unparsable input unchanged', () => {
    expect(displayUrlWithoutScheme('not a url')).toBe('not a url')
  })
})

describe('isValidEmail', () => {
  it('accepts empty (optional field)', () => {
    expect(isValidEmail('')).toBe(true)
  })
  it('accepts a plausible email', () => {
    expect(isValidEmail('owner@example.com')).toBe(true)
  })
  it('rejects a value with no @ or no domain dot', () => {
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('owner@example')).toBe(false)
  })
})

describe('normalizePhone', () => {
  it('trims but does not reformat', () => {
    expect(normalizePhone('  +34 600 000 000  ')).toBe('+34 600 000 000')
  })
})

describe('mapPocketBaseFieldErrors', () => {
  it('maps a PocketBase validation error to field -> message', () => {
    const error = {
      data: {
        data: {
          website: { code: 'validation_invalid_url', message: 'Must be a valid URL.' },
          contact_email: { code: 'validation_invalid_email', message: 'Must be a valid email address.' },
        },
      },
    }
    expect(mapPocketBaseFieldErrors(error)).toEqual({
      website: 'Must be a valid URL.',
      contact_email: 'Must be a valid email address.',
    })
  })
  it('returns an empty object for a generic/unattributed error', () => {
    expect(mapPocketBaseFieldErrors({ data: { data: {} } })).toEqual({})
    expect(mapPocketBaseFieldErrors({ data: {} })).toEqual({})
    expect(mapPocketBaseFieldErrors(new Error('network error'))).toEqual({})
    expect(mapPocketBaseFieldErrors(undefined)).toEqual({})
  })
})
