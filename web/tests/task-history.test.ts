import PocketBase from 'pocketbase'
import { describe, expect, it, vi } from 'vitest'
import { HISTORY_PAGE_SIZE, listCompletedTasks } from '../app/lib/task-history'

describe('completed task history', () => {
  it('requests only one 25-item done page, with bound title, project and client filters', async () => {
    const getList = vi.fn().mockResolvedValue({ items: [], page: 2, totalPages: 3 })
    const pb = new PocketBase('http://127.0.0.1:8090')
    vi.spyOn(pb, 'collection').mockReturnValue({ getList } as ReturnType<typeof pb.collection>)
    const search = 'foo" || status = "open'
    const project = 'project" || status = "doing'
    const client = 'client" || status = "open'
    await listCompletedTasks(pb, 2, search, project, client)
    const [page, size, options] = getList.mock.calls[0]!
    expect([page, size]).toEqual([2, HISTORY_PAGE_SIZE])
    expect(options.sort).toBe('-updated')
    expect(options.requestKey).toBeNull()
    expect(options.filter).toContain('status = "done"')
    expect(options.filter).toContain('title ~ "foo\\" || status = \\"open"')
    expect(options.filter).toContain('project = "project\\" || status = \\"doing"')
    expect(options.filter).toContain('project.client = "client\\" || status = \\"open"')
  })

  it('omits empty optional filters', async () => {
    const getList = vi.fn().mockResolvedValue({ items: [] })
    const pb = new PocketBase('http://127.0.0.1:8090')
    vi.spyOn(pb, 'collection').mockReturnValue({ getList } as ReturnType<typeof pb.collection>)
    await listCompletedTasks(pb, 1, '  ', '', '')
    expect(getList.mock.calls[0]![2].filter).toBe('status = "done"')
  })

  it('filters by client relation without a selected project', async () => {
    const getList = vi.fn().mockResolvedValue({ items: [] })
    const pb = new PocketBase('http://127.0.0.1:8090')
    vi.spyOn(pb, 'collection').mockReturnValue({ getList } as ReturnType<typeof pb.collection>)
    await listCompletedTasks(pb, 1, '', '', 'owner-id')
    expect(getList.mock.calls[0]![2].filter).toBe('status = "done" && project.client = "owner-id"')
  })
})
