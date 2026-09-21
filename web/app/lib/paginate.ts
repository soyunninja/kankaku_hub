/**
 * Pages through every page of a paginated fetch and collects all items —
 * the same "loop until exhausted" pattern
 * `pages/sessions-without-task/index.vue`'s `fetchAllEntryIds` uses
 * inline for its own bulk-action id collection, extracted here so other
 * paginated "resolve every id before a bulk action" call sites (e.g.
 * `pages/unassigned/index.vue`'s whole-group `bulkAssign`, which must
 * page through every entry in a group — not just whatever page its
 * expanded-row UI currently shows — before calling `bulkAssign`) don't
 * duplicate the loop.
 *
 * Stops as soon as `page >= totalPages` (so a single-page result, or an
 * empty result reporting `totalPages: 0`, does exactly one fetch) —
 * never assumes a fixed page count up front.
 */
export async function collectAllPages<T>(
  fetchPage: (page: number) => Promise<{ items: T[], totalPages: number }>,
): Promise<T[]> {
  const results: T[] = []
  let page = 1
  for (;;) {
    const res = await fetchPage(page)
    results.push(...res.items)
    if (page >= res.totalPages) break
    page++
  }
  return results
}
