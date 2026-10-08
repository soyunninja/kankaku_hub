import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/pages/entries/index.vue', 'utf8')
const outerTable = source.slice(source.indexOf('<Table v-else>'), source.indexOf('<EmptyState v-if="!loading'))
const primaryHeader = outerTable.slice(outerTable.indexOf('<TableRow v-if="primaryGrouped">'), outerTable.indexOf('<TableRow v-else>'))
const flatHeader = outerTable.slice(outerTable.indexOf('<TableRow v-else>'), outerTable.indexOf('</TableRow>', outerTable.indexOf('<TableRow v-else>')))
const nestedTable = outerTable.slice(outerTable.indexOf('<Table>\n                      <TableHeader>'), outerTable.indexOf('</Table>\n                  </TableCell>'))
const columnCount = source.slice(source.indexOf('const columnCount = computed(() =>'), source.indexOf('// Adapt existing grouped values'))

describe('Entries desktop member column', () => {
  it('renders Member in primary, flat and fallback layouts with matching outer colspans', () => {
    expect(primaryHeader).toContain("t('entries.member.header')")
    expect(flatHeader).toContain("t('entries.member.header')")
    expect(outerTable).toContain('{{ sessionMemberLabel(row) }}')
    expect(outerTable).toContain('rowMemberLabel(dr.entry.member)')
    expect(primaryHeader.indexOf("t('common.task')")).toBeLessThan(primaryHeader.indexOf("t('entries.member.header')"))
    const primaryCells = outerTable.slice(outerTable.indexOf('<template v-for="row in sessionRows"'), outerTable.indexOf('<!-- Expanded: ONE full-width row'))
    expect(primaryCells.indexOf('row.distinctTask')).toBeLessThan(primaryCells.indexOf('{{ sessionMemberLabel(row) }}'))
    expect(source).toContain("t('entries.member.pageLocal'")
    expect(columnCount).toContain('if (!groupBySession.value) return 7')
    expect(columnCount).toContain('return anyMixedGroup.value ? 6 : 5')
    expect(columnCount).toContain('return 9')
    expect(outerTable).toContain(':colspan="columnCount"')
  })

  it('keeps the nested detail table four columns and resolves names only through owner catalog access', () => {
    expect(nestedTable.match(/<TableHead(?=\s|>)/g)).toHaveLength(4)
    expect(source).toContain('if (canWrite.value) void refreshTeamMembers().catch(() => {})')
    expect(source).toContain('canWrite.value ? teamMembers.value : undefined')
  })
})
