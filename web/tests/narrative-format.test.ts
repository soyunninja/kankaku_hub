/**
 * Unit tests for `app/lib/narrative-format.ts` — turns a `Narrative`'s
 * raw `summary`/`first_prompt` into the text shown under the goal line
 * in the entries-table narrative block (`app/pages/entries/index.vue`'s
 * `session-narrative` block, see odd/tasks/engram-narrative.md T6). No
 * Vue, no i18n — importable from plain Vitest, same isolation rule as
 * `app/lib/session-title.ts`.
 */
import { describe, expect, it } from 'vitest'
import { narrativeBody, narrativeBodyLineCount } from '../app/lib/narrative-format'

describe('narrativeBody', () => {
  it('strips the "## Goal" heading + its text, converts remaining headings to plain labels, keeps list dashes', () => {
    const narrative = { goal: 'X', summary: '## Goal\nX\n\n## Accomplished\n- did things' }
    expect(narrativeBody(narrative)).toBe('Accomplished:\n- did things')
  })

  it('strips an inline "Goal: X" line and leaves other "Label: text" lines untouched', () => {
    const narrative = { goal: 'X', summary: 'Goal: X\nInstructions: Y\nDiscoveries: Z' }
    expect(narrativeBody(narrative)).toBe('Instructions: Y\nDiscoveries: Z')
  })

  it('returns a first_prompt narrative unchanged', () => {
    const narrative = { first_prompt: 'help me fix this weird bug in the sync runner' }
    expect(narrativeBody(narrative)).toBe('help me fix this weird bug in the sync runner')
  })

  it('returns "" when nothing remains after stripping the goal section', () => {
    const narrative = { goal: 'Ship it.', summary: '## Goal\nShip it.\n' }
    expect(narrativeBody(narrative)).toBe('')
  })

  it('returns "" when there is neither a summary nor a first_prompt', () => {
    expect(narrativeBody({})).toBe('')
  })

  it('converts a "**Title**" bold heading line to "Title:"', () => {
    const narrative = { goal: 'X', summary: '## Goal\nX\n\n**Discoveries**\nFound the root cause.' }
    expect(narrativeBody(narrative)).toBe('Discoveries:\nFound the root cause.')
  })

  it('converts a "**Title:** rest" bold inline line to "Title: rest"', () => {
    const narrative = { goal: 'X', summary: '## Goal\nX\n\n**Discoveries:** Found the root cause.' }
    expect(narrativeBody(narrative)).toBe('Discoveries: Found the root cause.')
  })

  it('collapses 3+ blank lines down to one', () => {
    const narrative = { goal: 'X', summary: '## Goal\nX\n\n\n\n\n## Accomplished\n- did things' }
    expect(narrativeBody(narrative)).toBe('Accomplished:\n- did things')
  })

  it('leaves a summary with no goal marker at all untouched apart from heading conversion', () => {
    const narrative = { summary: '## Notes\nJust some free-form notes.' }
    expect(narrativeBody(narrative)).toBe('Notes:\nJust some free-form notes.')
  })
})

describe('narrativeBodyLineCount', () => {
  it('counts a single line as 1', () => {
    expect(narrativeBodyLineCount('one line')).toBe(1)
  })

  it('counts one line per newline', () => {
    expect(narrativeBodyLineCount('a\nb\nc')).toBe(3)
  })

  it('counts an empty string as 1', () => {
    expect(narrativeBodyLineCount('')).toBe(1)
  })
})
