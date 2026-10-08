import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/pages/entries/index.vue', 'utf8')
const columnCount = source.slice(source.indexOf('const columnCount = computed(() =>'), source.indexOf('// Adapt existing grouped values'))
const primaryHeader = source.slice(source.indexOf('<TableRow v-if="primaryGrouped">'), source.indexOf('<TableRow v-else>', source.indexOf('<TableRow v-if="primaryGrouped">')))
const primaryRows = source.slice(source.indexOf('<template v-for="row in sessionRows"'), source.indexOf('<!-- Expanded: ONE full-width row', source.indexOf('<template v-for="row in sessionRows"')))
const flatHeader = source.slice(source.indexOf('<!-- Flat mode keeps session and project'), source.indexOf('</TableRow>', source.indexOf('<!-- Flat mode keeps session and project')))
const flatRows = source.slice(source.indexOf('<template v-if="!groupBySession">', source.indexOf('<TableRow v-else class="cursor-pointer"')), source.indexOf('<!-- Grouped: empty unless', source.indexOf('<TableRow v-else class="cursor-pointer"')))
const outerTable = source.slice(source.indexOf('<Table v-else>'), source.indexOf('<EmptyState v-if="!loading'))

describe('Entries desktop client column', () => {
  it('omits Client from both outer desktop layouts while keeping filters and detail context', () => {
    expect(primaryHeader).not.toContain("t('common.client')")
    expect(primaryRows).not.toContain('distinctClient')
    expect(primaryRows).not.toContain('sampleClient')
    expect(flatHeader).not.toContain("t('common.client')")
    expect(flatRows).not.toContain('dr.entry.client')
    expect(source).toContain('id="entries-filter-client"')
    expect(source).toContain('<EntryDetailSheet')
    expect(columnCount).toContain('return 9')
    expect(columnCount).toContain('if (!groupBySession.value) return 7')
    expect(columnCount).toContain('return anyMixedGroup.value ? 6 : 5')
    expect(source).toContain('<TableHead v-else-if="anyMixedGroup">{{ t(\'entries.sessionGroup.mixedColumn\') }}</TableHead>')
    expect(source).toContain('{{ mixedGroupCell(dr.entry) }}')
  })

  it('keeps client filter/detail behavior while omitting Client from fallback group summaries', () => {
    expect(flatRows).not.toContain('dr.entry.client')
    expect(outerTable).not.toContain('dr.group.clientIds')
    expect(source).toContain('v-model:client="detailClient"')
    expect(source).toContain('context: `${clientName(entry.client) || \'—\'} · ${projectName(entry.project)}`')
  })
})
