/** A missing catalog relation uses the by-ID resolver, never a guessed owner. */
export function taskDetailRoute(task: { id: string, project: string }, projects: readonly { id: string, client: string }[]): string {
  const project = projects.find(row => row.id === task.project)
  return project?.client
    ? `/organizacion/clientes/${project.client}/proyectos/${project.id}/tareas/${task.id}`
    : `/organizacion/tareas/${task.id}`
}
