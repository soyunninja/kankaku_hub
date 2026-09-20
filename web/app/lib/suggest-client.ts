/**
 * Suggests a client for an unassigned-queue group, from its legacy label
 * (the free-text client name kankaku recorded before a real client
 * existed). Deliberately conservative: only a normalised EXACT match
 * against a client's name or code counts. A near-miss like "cjamar" vs
 * "Cajamar" (one letter off) must NOT suggest anything — this is a
 * pre-filled hint in the assignment picker, never an auto-assignment, so
 * a wrong guess is worse than no guess.
 */

/** Case/space/punctuation/diacritic-insensitive normalization, so
 * "Caja Mar", "CAJAMAR" and "cajamar" all compare equal. */
export function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export interface ClientCandidate {
  id: string
  name: string
  code: string
}

/**
 * Returns the single client whose normalised name or code exactly
 * matches the normalised legacy label, or `undefined` when there is no
 * match or more than one (an ambiguous match is not a safe suggestion).
 */
export function suggestClient(legacyLabel: string, clients: ClientCandidate[]): ClientCandidate | undefined {
  const target = normalizeLabel(legacyLabel)
  if (!target) return undefined

  const matches = clients.filter(c => normalizeLabel(c.name) === target || normalizeLabel(c.code) === target)
  return matches.length === 1 ? matches[0] : undefined
}
