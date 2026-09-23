import type PocketBase from 'pocketbase'
import type { TaskRecord } from './pocketbase-types'

export const HISTORY_PAGE_SIZE = 25

export function listCompletedTasks(pb: PocketBase, page: number, search: string, project: string) {
  const clauses = ['status = {:status}']
  const params: Record<string, string> = { status: 'done' }
  if (search.trim()) {
    clauses.push('title ~ {:search}')
    params.search = search.trim()
  }
  if (project) {
    clauses.push('project = {:project}')
    params.project = project
  }
  return pb.collection('tasks').getList<TaskRecord>(page, HISTORY_PAGE_SIZE, {
    filter: pb.filter(clauses.join(' && '), params),
    sort: '-updated',
    requestKey: null,
  })
}
