import { readFileSync } from 'node:fs'
import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json'
import es from '../i18n/locales/es.json'
import ja from '../i18n/locales/ja.json'

const source = readFileSync('app/pages/clients/index.vue', 'utf8')

// Plain Vitest does not compile Nuxt pages. Exercise the actual local filter
// with Vue reactivity and guard the template wiring separately.
function setupFilter() {
  const search = ref('')
  const clients = ref([
    { id: 'b', name: 'Archived Studio', code: 'old', active: false },
    { id: 'a', name: 'Acme Studio', code: 'acme', website: 'https://example.com', active: true },
    { id: 'd', name: 'Studio Legacy', code: 'legacy', active: false },
    { id: 'c', name: 'Unassigned Studio', code: 'north', unassigned: true, active: true },
  ])
  const body = source.match(/const filteredClients = computed\(\(\) => \{([\s\S]*?)\n\}\)/)?.[1]
  expect(body).toBeTruthy()
  const filtered = new Function('computed', 'clients', 'search', `return computed(() => {${body}})`)(computed, clients, search)
  return { search, clients, filtered }
}

describe('Clients index localized count', () => {
  const locales = [
    { locale: 'en', messages: en, expected: ['0 clients, search clients…', '1 client, search clients…', '2 clients, search clients…'] },
    { locale: 'es', messages: es, expected: ['0 clientes, buscar clientes…', '1 cliente, buscar clientes…', '2 clientes, buscar clientes…'] },
    { locale: 'ja', messages: ja, expected: ['クライアント0件、クライアントを検索…', 'クライアント1件、クライアントを検索…', 'クライアント2件、クライアントを検索…'] },
  ]

  it.each(locales)('selects localized count copy for 0/1/2 in $locale', ({ messages, expected }) => {
    const expression = source.match(/:placeholder="(t\(clients\.length === 1[^"\n]+)"/)?.[1]
    expect(expression).toBeTruthy()
    const render = new Function('clients', 't', `return ${expression}`)
    const t = (key: string, { count }: { count: number }) => {
      const message = messages.clients[key.split('.')[1] as 'searchWithCount' | 'searchWithCountOne']
      return message.replace('{count}', String(count))
    }
    expect([0, 1, 2].map(length => render({ length }, t))).toEqual(expected)
  })

  it('keeps client locale keys and count placeholders in parity', () => {
    for (const { messages } of locales) {
      expect(Object.keys(messages.clients).sort()).toEqual(Object.keys(en.clients).sort())
      for (const key of ['count', 'countOne', 'searchWithCount', 'searchWithCountOne'] as const) {
        expect(messages.clients[key].match(/\{\w+\}/g)).toEqual(['{count}'])
      }
    }
  })
})

describe('Clients index local search', () => {
  it.each([
    [' ACME ', ['a']],
    ['studio', ['a', 'c', 'b', 'd']],
    ['example.com', ['a']],
    ['HTTPS://', ['a']],
  ])('matches name, code or website case-insensitively: %s', (query, expected) => {
    const { search, filtered } = setupFilter()
    search.value = query
    expect(filtered.value.map((client: { id: string }) => client.id)).toEqual(expected)
  })

  it('retains archived and protected clients, handles missing websites, and reacts to catalog changes', () => {
    const { search, clients, filtered } = setupFilter()
    expect(filtered.value).toHaveLength(4)
    search.value = 'old'
    expect(filtered.value[0].id).toBe('b')
    search.value = 'unassigned'
    expect(filtered.value[0].id).toBe('c')
    search.value = 'missing'
    expect(filtered.value).toHaveLength(0)
    clients.value[0]!.name = 'Missing client'
    expect(filtered.value[0].id).toBe('b')
    search.value = '   '
    expect(filtered.value).toHaveLength(4)
  })

  it('sorts searched clients active-first stably without mutating the catalog', () => {
    const { search, clients, filtered } = setupFilter()
    const original = [...clients.value]
    search.value = 'studio'

    expect(filtered.value.map((client: { id: string }) => client.id)).toEqual(['a', 'c', 'b', 'd'])
    expect(clients.value).toEqual(original)
  })
})

describe('Clients shared editor and detail layout', () => {
  it('shares the editor rather than duplicating catalog form behavior', () => {
    expect(source).toContain('useClientEditor()')
    expect(source).toContain('<ClientEditDialog :editor="editor"')
    expect(source).not.toContain('function onSubmit()')
    const detail = readFileSync('app/pages/organizacion/clientes/[id]/index.vue', 'utf8')
    expect(detail).not.toContain('max-w-4xl')
    expect(detail).toContain('lg:grid-cols-[minmax(0,1fr)_19rem]')
    expect(detail).toContain('data-testid="client-sidebar"')
    expect(detail).toContain('data-testid="client-actions" class="flex flex-wrap justify-end gap-2"')
    expect(detail).toContain('editor.openEdit(detailClient)')
    expect(detail).toContain('editor.requestArchive(detailClient)')
    const aside = detail.slice(detail.indexOf('<aside'))
    expect(aside.indexOf('common.edit')).toBeLessThan(aside.indexOf('contactTitle'))
    expect(aside.indexOf('contactTitle')).toBeLessThan(aside.indexOf("t('clients.notes')"))
  })
})

describe('Clients index view contract', () => {
  it('omits notes indicators from client cards while retaining client identity', () => {
    const cards = source.slice(source.indexOf('<article v-for="c in filteredClients"'), source.indexOf('</article>') + '</article>'.length)
    expect(cards).toContain('<ClientAvatar')
    expect(cards).toContain('c.name')
    expect(cards).toContain('c.code')
    expect(cards).toContain('<Lock')
    expect(cards).not.toContain('StickyNote')
    expect(cards).not.toContain('c.notes')
    expect(cards).not.toContain('clients.hasNotes')
  })

  it('omits the empty catalog header only when embedded, preserving the standalone title and creation action', () => {
    expect(source).toContain('<div v-if="!props.embedded" class="flex items-center justify-between gap-4">')
    expect(source).toContain('<h1 class="text-xl font-semibold tracking-tight">')
    expect(source).toContain("{{ t('clients.title') }}")
    expect(source).not.toContain("props.embedded ? 'h2' : 'h1'")
    expect(source).toContain('v-if="canWrite && !props.embedded"')
  })
  it('defaults to grid and shares filtered records with the preserved table', () => {
    expect(source).toContain("const view = ref<'grid' | 'list'>('grid')")
    expect(source.match(/v-for="c in filteredClients"/g)).toHaveLength(2)
    expect(source).toContain('<Card v-else>')
    expect(source).toContain('role="group"')
    expect(source).toContain(':aria-pressed="view === \'grid\'"')
    expect(source).toContain(':aria-pressed="view === \'list\'"')
  })

  it('uses exactly two mobile columns and three desktop columns for skeletons and cards', () => {
    const grid = source.split('<template v-if="view === \'grid\'">')[1]!.split('</template>')[0]!
    const containers = [...grid.matchAll(/<div (?:v-if="loading && clients.length === 0"[^>]*|v-else) class="([^"]+)"/g)]
    expect(containers.map(match => match[1])).toEqual([
      'grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 lg:gap-6',
      'grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 lg:gap-6',
    ])
  })

  it('reflows narrow cards and places the literal code below the name beside the avatar', () => {
    const card = source.split('<article v-for="c in filteredClients"')[1]!.split('</article>')[0]!
    expect(card).toContain('bg-card p-2')
    expect(card).toContain('grid-cols-[auto_1fr]')
    expect(card.indexOf('<ClientAvatar')).toBeLessThan(card.indexOf('<div class="min-w-0">'))
    expect(card).not.toContain('col-span-2 row-start-2 min-w-0')
    expect(card).toContain('<span class="min-w-0 [overflow-wrap:anywhere]" :title="c.name">')
    expect(card).toContain('{{ c.code }}')
    expect(card).not.toContain('RowActions')
    expect(card).not.toContain('common.edit')
    expect(card).not.toContain('common.archive')
    expect(card).toContain('<dl class="grid min-w-0 grid-cols-1 gap-3 text-sm [overflow-wrap:anywhere] sm:grid-cols-2">')
    expect(card).toContain('mt-auto flex flex-wrap')
    const classes = [...card.matchAll(/class="([^"]+)"/g)].map(match => match[1]).join(' ')
    expect(classes).not.toMatch(/(?:overflow-hidden|line-clamp-|\bhidden\b)/)
    expect(card).toMatch(/:aria-label="t\('clients.openDetail',[^>]*@click="openDetail\(c\)"/)
  })

  it('provides accessible detail navigation and preserves create and zero-total behavior', () => {
    const card = source.split('<article v-for="c in filteredClients"')[1]!.split('</article>')[0]!
    expect(card).toMatch(/<Button[^>]*:aria-label="t\('clients.openDetail',[^>]*@click="openDetail\(c\)"/)
    const table = source.split('<Card v-else>')[1]!.split('</Card>')[0]!
    expect(table).toContain('<NuxtLink')
    expect(table).toContain('@click.stop')
    expect(table).toContain('<ClientAvatar :client="c"')
    expect(table).toContain('class="flex min-w-0 items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-focus-indicator"')
    expect(table).toContain('class="text-sm text-muted-foreground [overflow-wrap:anywhere]">{{ c.code }}</span>')
    expect(table).toContain('c.code')
    expect(table).toMatch(/<TableRow[\s\S]*?class="cursor-pointer"[\s\S]*?@click="openDetail\(c\)"/)
    expect(table).toContain('<SkeletonRows v-if="loading && clients.length === 0" :rows="4" :cols="4" />')
    expect(table).not.toContain('RowActions')
    expect(table).not.toContain('common.edit')
    expect(table).not.toContain('common.archive')
    expect(source).toContain('v-if="canWrite && props.embedded"')
    expect(source).toContain('<ClientEditDialog :editor="editor"')
    expect(card).not.toContain('RowActions')
    expect(card).not.toContain('common.edit')
    expect(card).not.toContain('common.archive')
    expect(card).toContain('totalsByClient[c.id]?.workMs ?? 0')
    expect(card).toContain('totalsByClient[c.id]?.cost ?? 0')
  })

  it('distinguishes an empty catalog from no search matches in both views', () => {
    expect(source.match(/clients.length === 0 \? 'clients.empty' : 'clients.noResults'/g)).toHaveLength(2)
    expect(source).toContain('loading && clients.length === 0')
  })
})
