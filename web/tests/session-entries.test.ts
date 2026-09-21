/**
 * Unit tests for `app/lib/session-entries.ts` — the pure helpers behind
 * TaskDetailSheet.vue's "expand a session to see all its entries" list
 * (Feature 2): the same-task/other-task/no-task badge classification, the
 * single-line prompt excerpt, and the raw-row -> view-model mapper.
 */
import { describe, expect, it } from 'vitest'
import { classifySessionEntryTask, singleLineExcerpt, toSessionEntryRow } from '../app/lib/session-entries'

describe('classifySessionEntryTask', () => {
  it('is "same-task" when the entry belongs to the task being viewed', () => {
    expect(classifySessionEntryTask('task-1', 'task-1', undefined)).toEqual({ kind: 'same-task' })
  })

  it('is "no-task" when the entry has no task at all', () => {
    expect(classifySessionEntryTask('', 'task-1', undefined)).toEqual({ kind: 'no-task' })
  })

  it('is "other-task" with the expanded title when the entry belongs to a different task', () => {
    expect(classifySessionEntryTask('task-2', 'task-1', 'Fix billing bug')).toEqual({
      kind: 'other-task',
      taskTitle: 'Fix billing bug',
    })
  })

  it('falls back to the raw task id when the other task has no expanded title (deleted task)', () => {
    expect(classifySessionEntryTask('task-2', 'task-1', undefined)).toEqual({
      kind: 'other-task',
      taskTitle: 'task-2',
    })
  })
})

describe('singleLineExcerpt', () => {
  it('returns short single-line text unchanged', () => {
    expect(singleLineExcerpt('Fix the bug', 80)).toBe('Fix the bug')
  })

  it('collapses newlines into spaces', () => {
    expect(singleLineExcerpt('First line\nSecond line', 80)).toBe('First line Second line')
  })

  it('truncates long text with an ellipsis, respecting maxLength', () => {
    const text = 'x'.repeat(100)
    const result = singleLineExcerpt(text, 80)
    expect(result.length).toBeLessThanOrEqual(80)
    expect(result.endsWith('…')).toBe(true)
  })

  it('trims surrounding whitespace', () => {
    expect(singleLineExcerpt('  hello  ', 80)).toBe('hello')
  })
})

describe('toSessionEntryRow', () => {
  const base = {
    id: 'e1',
    started_at: '2026-01-01T10:00:00.000Z',
    prompt: 'Investigate the flaky test\nand fix it',
    work_ms: 60_000,
    cost: 0.25,
    task: 'task-1',
    expand: { task: { title: 'Current task' } },
  }

  it('maps a same-task entry with a non-empty prompt', () => {
    const row = toSessionEntryRow(base, 'task-1')
    expect(row).toEqual({
      id: 'e1',
      startedAt: '2026-01-01T10:00:00.000Z',
      promptExcerpt: 'Investigate the flaky test and fix it',
      promptHidden: false,
      workMs: 60_000,
      cost: 0.25,
      taskBadge: { kind: 'same-task' },
    })
  })

  it('flags an empty prompt as hidden rather than showing an empty excerpt', () => {
    const row = toSessionEntryRow({ ...base, prompt: '' }, 'task-1')
    expect(row.promptHidden).toBe(true)
    expect(row.promptExcerpt).toBe('')
  })

  it('classifies an entry with no task as no-task', () => {
    const row = toSessionEntryRow({ ...base, task: '', expand: undefined }, 'task-1')
    expect(row.taskBadge).toEqual({ kind: 'no-task' })
  })

  it('classifies an entry belonging to another task as other-task, with its expanded title', () => {
    const row = toSessionEntryRow({ ...base, task: 'task-2', expand: { task: { title: 'Other task' } } }, 'task-1')
    expect(row.taskBadge).toEqual({ kind: 'other-task', taskTitle: 'Other task' })
  })
})
