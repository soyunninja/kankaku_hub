import type { ProjectRecord, TaskRecord } from './pocketbase-types'

type TaskLike = Pick<TaskRecord, 'id' | 'title' | 'project' | 'status'>
type ProjectLike = Pick<ProjectRecord, 'id' | 'client'>

interface Scope {
  tasks: readonly TaskLike[]
  projects: readonly ProjectLike[]
  client: string
  project: string
}

/** A task is in scope when it belongs to the chosen project or, with no
 * project chosen, to any project of the chosen client. A task with no
 * project belongs to no client, so it is never in scope. */
function inScope(task: TaskLike, scope: Scope): boolean {
  if (!task.project) return false
  if (scope.project) return task.project === scope.project
  return scope.projects.some(p => p.id === task.project && p.client === scope.client)
}

/**
 * Tasks the entry detail sheet offers for one entry: the ones in scope
 * (see `inScope`), open/doing before done, plus the task the entry is
 * CURRENTLY assigned to even when it is out of scope — opening the sheet
 * and pressing Save must never silently drop an existing assignment.
 */
export function entryTaskOptions(input: Scope & { current: string }): TaskLike[] {
  const scoped = input.tasks.filter(task => inScope(task, input))
  const current = input.current ? input.tasks.find(task => task.id === input.current) : undefined
  const all = current && !scoped.includes(current) ? [...scoped, current] : scoped
  const rank = (task: TaskLike) => (task === current && !scoped.includes(task) ? 2 : task.status === 'done' ? 1 : 0)
  return all.map((task, index) => ({ task, index })).sort((a, b) => rank(a.task) - rank(b.task) || a.index - b.index).map(x => x.task)
}

/** The task to keep after the client/project selection changed: itself
 * while still in scope, `''` otherwise — a task must never end up under a
 * client it does not belong to. */
export function keepTaskForSelection(input: Scope & { task: string }): string {
  const task = input.tasks.find(candidate => candidate.id === input.task)
  return task && inScope(task, input) ? task.id : ''
}
