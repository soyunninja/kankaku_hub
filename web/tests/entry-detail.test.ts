import { describe, expect, it } from 'vitest'
import {
  computeWorkWaitRatio,
  deriveEntryTitle,
  isStructuredValue,
  normalizeSegments,
  resolveRelation,
  safeDisplayValue,
  statusPresentation,
  truncateMiddle,
} from '../app/lib/entry-detail'

describe('deriveEntryTitle', () => {
  it('prefers session_name when present', () => {
    expect(deriveEntryTitle({ session_name: 'Fix the login bug', prompt: 'ignored', id: 'abcdef1234' }))
      .toEqual({ kind: 'session_name', text: 'Fix the login bug' })
  })

  it('falls back to the prompt when session_name is missing', () => {
    expect(deriveEntryTitle({ session_name: '', prompt: 'Add dark mode toggle', id: 'abcdef1234' }))
      .toEqual({ kind: 'prompt', text: 'Add dark mode toggle', truncated: false })
  })

  it('truncates a long prompt', () => {
    const prompt = 'x'.repeat(120)
    const result = deriveEntryTitle({ session_name: '', prompt, id: 'abcdef1234' })
    expect(result.kind).toBe('prompt')
    if (result.kind === 'prompt') {
      expect(result.truncated).toBe(true)
      expect(result.text.length).toBeLessThan(prompt.length)
      expect(result.text.endsWith('…')).toBe(true)
    }
  })

  it('falls back to a short id when neither session_name nor prompt is present', () => {
    expect(deriveEntryTitle({ session_name: null, prompt: null, id: 'abcdef1234567890' }))
      .toEqual({ kind: 'fallback', shortId: 'abcdef12' })
  })

  it('treats whitespace-only fields as missing', () => {
    expect(deriveEntryTitle({ session_name: '   ', prompt: '  ', id: 'abcdef1234' }))
      .toEqual({ kind: 'fallback', shortId: 'abcdef12' })
  })
})

describe('statusPresentation', () => {
  it('maps every status to a distinct tone and icon', () => {
    expect(statusPresentation('completed')).toEqual({ tone: 'success', icon: 'check' })
    expect(statusPresentation('aborted')).toEqual({ tone: 'destructive', icon: 'x' })
    expect(statusPresentation('interrupted')).toEqual({ tone: 'warning', icon: 'alert-triangle' })
  })
})

describe('normalizeSegments', () => {
  it('sorts entries by duration descending', () => {
    expect(normalizeSegments({ read: 1000, write: 5000, think: 2000 })).toEqual([
      { tag: 'write', ms: 5000 },
      { tag: 'think', ms: 2000 },
      { tag: 'read', ms: 1000 },
    ])
  })

  it('returns [] for null', () => {
    expect(normalizeSegments(null)).toEqual([])
  })

  it('returns [] for undefined', () => {
    expect(normalizeSegments(undefined)).toEqual([])
  })

  it('returns [] for an empty object', () => {
    expect(normalizeSegments({})).toEqual([])
  })

  it('returns [] for an array (malformed shape)', () => {
    expect(normalizeSegments([1, 2, 3])).toEqual([])
  })

  it('returns [] for a primitive', () => {
    expect(normalizeSegments('not json')).toEqual([])
    expect(normalizeSegments(42)).toEqual([])
  })

  it('parses a JSON-string segments field', () => {
    expect(normalizeSegments('{"read": 3000}')).toEqual([{ tag: 'read', ms: 3000 }])
  })

  it('drops non-numeric, negative and zero values but keeps the rest', () => {
    expect(normalizeSegments({ good: 1000, bad: 'nope', negative: -5, zero: 0 })).toEqual([
      { tag: 'good', ms: 1000 },
    ])
  })

  it('never lets an object render as text — always a structured list', () => {
    const result = normalizeSegments({ read: 1000 })
    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual([{ tag: 'read', ms: 1000 }])
    expect(JSON.stringify(result)).not.toContain('[object Object]')
  })
})

describe('computeWorkWaitRatio', () => {
  it('splits wall time into work/wait/other percentages', () => {
    const ratio = computeWorkWaitRatio(60_000, 30_000, 100_000)
    expect(ratio.workPercent).toBe(60)
    expect(ratio.waitPercent).toBe(30)
    expect(ratio.otherPercent).toBe(10)
  })

  it('returns all-zero when wall_ms is zero or negative', () => {
    expect(computeWorkWaitRatio(1000, 1000, 0)).toEqual({ workPercent: 0, waitPercent: 0, otherPercent: 0 })
    expect(computeWorkWaitRatio(1000, 1000, -5)).toEqual({ workPercent: 0, waitPercent: 0, otherPercent: 0 })
  })

  it('clamps work+wait so the bar never exceeds 100%', () => {
    const ratio = computeWorkWaitRatio(80_000, 80_000, 100_000)
    expect(ratio.workPercent).toBe(80)
    expect(ratio.workPercent + ratio.waitPercent).toBeLessThanOrEqual(100)
    expect(ratio.otherPercent).toBe(0)
  })

  it('treats NaN/negative inputs as zero', () => {
    const ratio = computeWorkWaitRatio(Number.NaN, -100, 100_000)
    expect(ratio.workPercent).toBe(0)
    expect(ratio.waitPercent).toBe(0)
    expect(ratio.otherPercent).toBe(100)
  })
})

describe('truncateMiddle', () => {
  it('leaves short strings untouched', () => {
    expect(truncateMiddle('short.ts', 40)).toBe('short.ts')
  })

  it('truncates a long path in the middle with an ellipsis', () => {
    const path = 'apps/web/app/components/entries/EntryDetailSheet.vue'
    const result = truncateMiddle(path, 30)
    expect(result.length).toBeLessThanOrEqual(30)
    expect(result).toContain('…')
    expect(result.startsWith('apps/web')).toBe(true)
  })
})

describe('safeDisplayValue', () => {
  it('renders primitives as plain strings', () => {
    expect(safeDisplayValue('hello')).toBe('hello')
    expect(safeDisplayValue(42)).toBe('42')
    expect(safeDisplayValue(true)).toBe('true')
  })

  it('renders null/undefined/empty string as —', () => {
    expect(safeDisplayValue(null)).toBe('—')
    expect(safeDisplayValue(undefined)).toBe('—')
    expect(safeDisplayValue('')).toBe('—')
  })

  it('never produces the literal text [object Object] for an object', () => {
    const result = safeDisplayValue({ read: 1000, write: 2000 })
    expect(result).not.toBe('[object Object]')
    expect(result).toContain('"read": 1000')
  })

  it('never produces [object Object] for an array either', () => {
    const result = safeDisplayValue([{ tool: 'bash', ms: 500 }])
    expect(result).not.toContain('[object Object]')
  })
})

describe('isStructuredValue', () => {
  it('is true for objects and arrays, false for primitives', () => {
    expect(isStructuredValue({})).toBe(true)
    expect(isStructuredValue([])).toBe(true)
    expect(isStructuredValue('x')).toBe(false)
    expect(isStructuredValue(1)).toBe(false)
    expect(isStructuredValue(null)).toBe(false)
    expect(isStructuredValue(undefined)).toBe(false)
  })
})

describe('resolveRelation', () => {
  it('is empty when the id is blank', () => {
    expect(resolveRelation('', { name: 'Acme' })).toEqual({ state: 'empty', id: '' })
  })

  it('is deleted when the id is set but nothing expanded', () => {
    expect(resolveRelation('abc123', undefined)).toEqual({ state: 'deleted', id: 'abc123' })
    expect(resolveRelation('abc123', null)).toEqual({ state: 'deleted', id: 'abc123' })
  })

  it('is resolved when both the id and the expanded record are present', () => {
    expect(resolveRelation('abc123', { name: 'Acme' })).toEqual({ state: 'resolved', id: 'abc123', name: 'Acme' })
  })
})
