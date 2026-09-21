import { describe, expect, it } from 'vitest'
import { collectAllPages } from '../app/lib/paginate'

describe('collectAllPages', () => {
  it('collects items across every page until exhausted', async () => {
    const pages = [
      { items: ['a', 'b'], totalPages: 3 },
      { items: ['c', 'd'], totalPages: 3 },
      { items: ['e'], totalPages: 3 },
    ]
    const fetchPage = async (page: number) => pages[page - 1]!

    const result = await collectAllPages(fetchPage)

    expect(result).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('does exactly one fetch when totalPages is 1', async () => {
    const fetchPage = async () => ({ items: ['only'], totalPages: 1 })
    const calls: number[] = []
    const tracked = async (page: number) => {
      calls.push(page)
      return fetchPage()
    }

    const result = await collectAllPages(tracked)

    expect(result).toEqual(['only'])
    expect(calls).toEqual([1])
  })

  it('returns an empty array for an empty result set (totalPages: 0)', async () => {
    const fetchPage = async () => ({ items: [], totalPages: 0 })

    const result = await collectAllPages(fetchPage)

    expect(result).toEqual([])
  })

  it('requests pages in increasing order starting from 1', async () => {
    const requestedPages: number[] = []
    const fetchPage = async (page: number) => {
      requestedPages.push(page)
      return { items: [page], totalPages: 3 }
    }

    await collectAllPages(fetchPage)

    expect(requestedPages).toEqual([1, 2, 3])
  })
})
