import { describe, expect, it } from 'vitest'
import { projectRemainder, rankProjects } from '../app/lib/project-chart'

describe('project chart', () => {
  it('ranks nonempty projects by the active metric without mutating input', () => {
    const rows = [{ groupKey: '', workMs: 1000, cost: 100 }, { groupKey: 'cheap', workMs: 900, cost: 1 }, { groupKey: 'costly', workMs: 1, cost: 90 }]
    const copy = structuredClone(rows)
    expect(rankProjects(rows, 'work')).toEqual(['cheap', 'costly'])
    expect(rankProjects(rows, 'cost')).toEqual(['costly', 'cheap'])
    expect(rows).toEqual(copy)
    expect(rankProjects([], 'work')).toEqual([])
  })
  it('conserves both totals across sparse selected days and projectless remainder', () => {
    const overall = [{ groupKey: '0', workMs: 100, cost: 10 }, { groupKey: '1', workMs: 30, cost: 3 }]
    const selected = { a: [{ groupKey: '0', workMs: 60, cost: 6 }] }
    const copy = structuredClone(selected)
    expect(projectRemainder(overall, selected)).toEqual([{ groupKey: '0', workMs: 40, cost: 4 }, { groupKey: '1', workMs: 30, cost: 3 }])
    expect(selected).toEqual(copy)
    expect(projectRemainder([], {})).toEqual([])
  })
  it.each([
    { workMs: 1, cost: 0 },
    { workMs: 0, cost: 1 },
    { workMs: 1, cost: 1 },
  ])('rejects missing overall buckets with selected values $workMs/$cost', (values) => {
    const selected = { a: [{ groupKey: 'missing', ...values }] }
    expect(() => projectRemainder([], selected)).toThrow('Inconsistent project totals')
    expect(() => projectRemainder([{ groupKey: 'present', workMs: 10, cost: 10 }], selected)).toThrow('Inconsistent project totals')
  })
  it('allows zero-only missing buckets without changing overall order or shape', () => {
    const overall = [{ groupKey: 'later', workMs: 10, cost: 2, label: 'Later' }, { groupKey: 'earlier', workMs: 5, cost: 1, label: 'Earlier' }]
    const selected = { a: [{ groupKey: 'missing', workMs: 0, cost: 0 }, { groupKey: 'later', workMs: 3, cost: 1 }] }
    expect(projectRemainder(overall, selected)).toEqual([{ ...overall[0], workMs: 7, cost: 1 }, overall[1]])
    expect(projectRemainder([], { a: [{ groupKey: 'missing', workMs: 0, cost: 0 }] })).toEqual([])
    expect(projectRemainder([], { a: [{ groupKey: 'missing', workMs: 1e-10, cost: 1e-10 }] })).toEqual([])
  })
  it('clamps floating noise but rejects materially inconsistent totals', () => {
    expect(projectRemainder([{ groupKey: '0', workMs: 0, cost: 0.3 }], { a: [{ groupKey: '0', workMs: 0, cost: 0.30000000000000004 }] })[0]?.cost).toBe(0)
    expect(() => projectRemainder([{ groupKey: '0', workMs: 1, cost: 0 }], { a: [{ groupKey: '0', workMs: 2, cost: 0 }] })).toThrow('Inconsistent project totals')
  })
})
