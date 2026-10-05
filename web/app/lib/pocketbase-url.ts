/** Use an absolute origin so SDK requests never resolve under a page path. */
export function resolvePocketBaseUrl(override: string, browserOrigin: string): string {
  return override || browserOrigin
}
