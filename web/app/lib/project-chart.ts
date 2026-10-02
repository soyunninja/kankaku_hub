export const PROJECT_OTHERS_KEY = '__project_others__'
export type ProjectMetric = 'work' | 'cost'
interface ProjectValues { groupKey: string, workMs: number, cost: number }

/** Also used on the bounded fallback subset; never on a cost-capped server page for work ranking. */
export function rankProjects(rows: readonly ProjectValues[], metric: ProjectMetric): string[] {
  return rows.filter(row => row.groupKey).slice().sort((a, b) =>
    (metric === 'work' ? b.workMs - a.workMs : b.cost - a.cost) || a.groupKey.localeCompare(b.groupKey),
  ).slice(0, 5).map(row => row.groupKey)
}

export function projectRemainder<T extends ProjectValues>(overall: readonly T[], selected: Readonly<Record<string, readonly ProjectValues[]>>): T[] {
  const sums = new Map<string, { workMs: number, cost: number }>()
  for (const rows of Object.values(selected)) {
    for (const row of rows) {
      const sum = sums.get(row.groupKey) ?? { workMs: 0, cost: 0 }
      sum.workMs += row.workMs
      sum.cost += row.cost
      sums.set(row.groupKey, sum)
    }
  }
  function residual(total: number, used: number) {
    const value = total - used
    if (value < -1e-9 * Math.max(1, Math.abs(total), Math.abs(used))) throw new Error('Inconsistent project totals')
    return Math.max(0, value)
  }
  const overallKeys = new Set(overall.map(row => row.groupKey))
  for (const [groupKey, sum] of sums) {
    if (!overallKeys.has(groupKey)) {
      residual(0, sum.workMs)
      residual(0, sum.cost)
    }
  }
  return overall.map(row => ({ ...row,
    workMs: residual(row.workMs, sums.get(row.groupKey)?.workMs ?? 0),
    cost: residual(row.cost, sums.get(row.groupKey)?.cost ?? 0),
  }))
}
