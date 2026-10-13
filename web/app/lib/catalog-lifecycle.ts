export function isOperationalProject(project: { active?: unknown, client?: string } | undefined, clients: readonly { id: string, active?: unknown }[]) {
  if (!project || project.active !== true || !project.client) return false
  return clients.some(client => client.id === project.client && client.active === true)
}
