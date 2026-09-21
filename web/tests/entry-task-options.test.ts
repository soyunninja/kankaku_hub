import { describe, expect, it } from 'vitest'
import { entryTaskOptions, keepTaskForSelection } from '../app/lib/entry-task-options'

const projects = [
  { id: 'p1', client: 'c1' },
  { id: 'p2', client: 'c1' },
  { id: 'p3', client: 'c2' },
]
const tasks = [
  { id: 't1', title: 'Alpha', project: 'p1', status: 'open' as const },
  { id: 't2', title: 'Beta', project: 'p2', status: 'done' as const },
  { id: 't3', title: 'Gamma', project: 'p3', status: 'doing' as const },
  { id: 't4', title: 'Loose', project: '', status: 'open' as const },
]

describe('entryTaskOptions', () => {
  it('with a project selected, offers only that project\'s tasks', () => {
    expect(entryTaskOptions({ tasks, projects, client: 'c1', project: 'p1', current: '' }).map(o => o.id)).toEqual(['t1'])
  })

  it('with no project, offers every task of the selected client\'s projects — never another client\'s', () => {
    expect(entryTaskOptions({ tasks, projects, client: 'c1', project: '', current: '' }).map(o => o.id)).toEqual(['t1', 't2'])
  })

  it('always keeps the currently assigned task selectable, even outside the filter, so opening the sheet never silently drops it', () => {
    expect(entryTaskOptions({ tasks, projects, client: 'c1', project: 'p1', current: 't3' }).map(o => o.id)).toEqual(['t1', 't3'])
  })

  it('open and doing tasks come before done ones', () => {
    const mixed = [{ id: 'a', title: 'A', project: 'p1', status: 'done' as const }, { id: 'b', title: 'B', project: 'p1', status: 'open' as const }]
    expect(entryTaskOptions({ tasks: mixed, projects, client: 'c1', project: 'p1', current: '' }).map(o => o.id)).toEqual(['b', 'a'])
  })
})

describe('keepTaskForSelection', () => {
  it('keeps the task while it still belongs to the chosen project/client', () => {
    expect(keepTaskForSelection({ tasks, projects, client: 'c1', project: 'p1', task: 't1' })).toBe('t1')
    expect(keepTaskForSelection({ tasks, projects, client: 'c1', project: '', task: 't2' })).toBe('t2')
  })

  it('clears it when the project or client changes to one the task does not belong to', () => {
    expect(keepTaskForSelection({ tasks, projects, client: 'c1', project: 'p2', task: 't1' })).toBe('')
    expect(keepTaskForSelection({ tasks, projects, client: 'c2', project: '', task: 't1' })).toBe('')
  })

  it('an unknown task id is cleared', () => {
    expect(keepTaskForSelection({ tasks, projects, client: 'c1', project: '', task: 'nope' })).toBe('')
  })
})
