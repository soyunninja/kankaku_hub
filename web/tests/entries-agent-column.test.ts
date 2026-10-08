import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/pages/entries/index.vue', 'utf8')
const columnCount = source.slice(source.indexOf('const columnCount = computed(() =>'), source.indexOf('// Adapt existing grouped values'))
const outerTable = source.slice(source.indexOf('<Table v-else>'), source.indexOf('<EmptyState v-if="!loading'))

describe('Entries desktop agent column', () => {
  it('omits agent from both outer table layouts while preserving aligned colspans', () => {
    expect(outerTable).not.toContain('<TableHead>{{ t(\'common.agent\') }}</TableHead>')
    expect(outerTable).not.toContain('<AgentIcon')
    expect(source).not.toContain("import AgentIcon from '@/components/agents/AgentIcon.vue'")
    expect(columnCount).toContain('if (!groupBySession.value) return 7')
    expect(columnCount).toContain('return anyMixedGroup.value ? 6 : 5')
    expect(columnCount).toContain('return 9')
  })

  it('keeps agent filtering and mobile/detail agent presentation', () => {
    expect(source).toContain('id="entries-filter-agent"')
    expect(source).toContain(':agent-label="agentLabel"')
    expect(source).toContain('agentLabel(row.sampleAgent)')
    expect(source).toContain('<EntryDetailSheet')
    expect(source).toContain(':entry="detail"')
  })

  it('leaves the nested session entries table agent-free and four columns wide', () => {
    const nestedTable = source.slice(source.indexOf('<Table>\n                      <TableHeader>'), source.indexOf('</Table>\n                  </TableCell>', source.indexOf('<Table>\n                      <TableHeader>')))
    expect(nestedTable).not.toContain('common.agent')
    expect(nestedTable.match(/<TableHead(?=\s|>)/g)).toHaveLength(4)
  })
})
