import { readFileSync } from 'node:fs'
import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { sortProjects } from '../app/lib/project-sort'
import en from '../i18n/locales/en.json'
import es from '../i18n/locales/es.json'
import ja from '../i18n/locales/ja.json'

const source = readFileSync('app/pages/projects/index.vue', 'utf8')

// Plain Vitest does not mount Nuxt pages. Execute the page's computed body
// with real Vue reactivity and the production sorter; guard wiring separately.
function setupFilter() {
  const projects = ref([
    { id: 'a', name: 'Portal', code: 'web', client: 'one', active: true },
    { id: 'b', name: 'Archived app', code: 'old', client: 'one', active: false },
    { id: 'c', name: 'Portal Two', code: '', client: 'two', active: true },
  ])
  const search = ref('')
  const filterClient = ref('')
  const sortKey = ref('name')
  const sortDirection = ref('asc')
  const locale = ref('en')
  const totalsByProject = ref({ a: { cost: 3, workMs: 100 }, b: { cost: 7, workMs: 200 } })
  const names = ref<Record<string, string>>({ one: 'Acme', two: 'Studio' })
  const clientName = (id: string) => names.value[id] ?? id
  const body = source.match(/const filtered = computed\(\(\) => \{([\s\S]*?)\n\}\)/)?.[1]
  expect(body).toBeTruthy()
  const filtered = new Function('computed', 'projects', 'search', 'filterClient', 'sortProjects', 'sortKey', 'sortDirection', 'locale', 'clientName', 'totalsByProject', `return computed(() => {${body}})`)(computed, projects, search, filterClient, sortProjects, sortKey, sortDirection, locale, clientName, totalsByProject)
  const ids = () => filtered.value.map((p: { id: string }) => p.id)
  return { search, filterClient, sortKey, sortDirection, projects, names, ids }
}

describe('Projects local search and sort composition', () => {
  it.each([[' PORTAL ', ['a', 'c']], ['WEB', ['a']], ['acme', ['b', 'a']], ['old', ['b']], ['Studio', ['c']]])('searches name, code and client: %s', (query, expected) => {
    const state = setupFilter()
    state.search.value = query as string
    expect(state.ids()).toEqual(expected)
  })

  it('intersects the client filter, retains archived records, and preserves sorting between views', () => {
    const state = setupFilter()
    state.search.value = 'portal'
    state.filterClient.value = 'one'
    expect(state.ids()).toEqual(['a'])
    state.search.value = '   '
    state.sortKey.value = 'cost'
    state.sortDirection.value = 'desc'
    expect(state.ids()).toEqual(['b', 'a'])
    expect(state.projects.value.map(p => p.id)).toEqual(['a', 'b', 'c'])
    state.filterClient.value = 'two'
    expect(state.ids()).toEqual(['c'])
    state.search.value = 'missing'
    expect(state.ids()).toEqual([])
    state.names.value.two = 'Missing client'
    expect(state.ids()).toEqual(['c'])
  })
})

describe('Projects view contract', () => {
  it('defaults to grid, shares results, and labels the visible filter and view controls', () => {
    expect(source).toContain("const view = ref<'grid' | 'list'>('grid')")
    expect(source.match(/v-for="p in filtered"/g)).toHaveLength(2)
    expect(source).toContain('role="group"')
    expect(source).toContain(':aria-pressed="view === \'grid\'"')
    expect(source).toContain(':aria-pressed="view === \'list\'"')
    expect(source).toContain('<Label for="project-client-filter" class="text-xs leading-normal font-normal text-muted-foreground">')
    expect(source).toContain(':aria-label="t(\'projects.filterByClient\')"')
    expect(source).not.toMatch(/<aside|Sidebar/)
    expect(source).toContain(':aria-sort="sortKey === key')
    expect(source).toContain('@click="activateSort(key)"')
  })

  it('uses two mobile/three desktop columns for cards and skeletons with narrow-card reflow', () => {
    expect(source.match(/class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3"/g)).toHaveLength(2)
    const card = source.split('<article v-for="p in filtered"')[1]!.split('</article>')[0]!
    expect(card).toContain('min-w-0')
    expect(card).toContain('[overflow-wrap:anywhere]')
    expect(card).toContain('grid-cols-1')
    expect(card).toContain('flex-wrap')
    expect(card).toContain('<ClientAvatar :client="clientById(p.client) ??')
    expect(card).not.toMatch(/ClientName|<a |<NuxtLink/)
    expect(source).not.toContain('FolderKanban')
    expect(card).toContain('{{ clientName(p.client) }}<span v-if="p.code"> / {{ p.code }}</span>')
    expect(card).toContain('totalsByProject[p.id]?.workMs ?? 0')
    expect(card).toContain('totalsByProject[p.id]?.cost ?? 0')
    expect(card).toContain(':aria-label="t(\'projects.openDetail\', { name: p.name })"')
    expect(card).toContain('@click="navigateTo(`/projects/${p.id}`)"')
    expect(card).not.toMatch(/<article[^>]*@click/)
    expect(card).toContain('v-if="canWrite"')
    expect(card).toContain('onClick: () => openEdit(p)')
    expect(card).toContain('onClick: () => toggleArchive(p)')
  })

  it('groups title and writer actions in the first flex row before favicon, client and conditional code metadata', () => {
    const card = source.split('<article v-for="p in filtered"')[1]!.split('</article>')[0]!
    const header = card.split('<dl')[0]!
    expect(header).toMatch(/<div class="flex min-w-0 items-start justify-between gap-1">\s*<h2 class="min-w-0 flex-1 text-sm font-semibold \[overflow-wrap:anywhere\] sm:text-base">\{\{ p.name \}\}<\/h2>\s*<RowActions\s+v-if="canWrite" data-testid="write-action" class="shrink-0"[\s\S]*?\/>\s*<\/div>\s*<div class="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">\s*<ClientAvatar[^>]*size="xs" class="shrink-0" \/>\s*<p class="min-w-0 truncate"[^>]*>\s*\{\{ clientName\(p.client\) \}\}<span v-if="p.code"> \/ \{\{ p.code \}\}<\/span>\s*<\/p>\s*<\/div>/)
    expect(header.match(/<RowActions/g)).toHaveLength(1)
    const titleRow = header.split('items-start justify-between gap-1">')[1]!.split('</div>')[0]!
    expect(titleRow).not.toMatch(/flex-wrap|flex-col|self-end/)
    expect(titleRow).toContain('onClick: () => openEdit(p)')
    expect(titleRow).toContain('onClick: () => toggleArchive(p)')
    expect(header).toContain(':title="clientName(p.client) + (p.code ? ` / ${p.code}` : \'\')"')
    expect(header).toContain('v-if="canWrite"')
    expect(header).not.toMatch(/<Button|<button|<a\b|<NuxtLink/)
  })

  it('passes the associated client record to the avatar or a safe initials-only fallback', () => {
    const binding = source.match(/<ClientAvatar :client="([^"]+)" size="xs"/)?.[1]
    expect(binding).toBeTruthy()
    const client = { id: 'one', name: 'Acme', favicon: 'icon.png', updated: '2026-09-20' }
    const clients = ref([client])
    const lookupBody = source.match(/function clientById\(id: string\) \{([\s\S]*?)\n\}/)?.[1]
    expect(lookupBody).toBeTruthy()
    const clientById = new Function('clients', 'id', lookupBody!).bind(null, clients)
    const avatarClient = new Function('p', 'clientById', 'clientName', `return ${binding}`)
    const clientName = (id: string) => clientById(id)?.name ?? id
    expect(avatarClient({ client: 'one' }, clientById, clientName)).toBe(clients.value[0])
    expect(avatarClient({ client: 'missing' }, clientById, clientName)).toEqual({
      id: 'missing', name: 'missing', favicon: '', updated: '',
    })
    expect(avatarClient({ client: '' }, clientById, clientName)).toEqual({
      id: '', name: '', favicon: '', updated: '',
    })
  })

  it('adds decorative loaded client avatars before filter labels only, leaving All and the form Select plain', () => {
    const filter = source.split('<Select id="project-client-filter"')[1]!.split('</Select>')[0]!
    expect(filter).toContain("{ value: '', label: t('common.all') }")
    expect(filter).toContain('<template #option="{ option }">')
    expect(filter).toContain('<template #selected="{ option, label }">')
    expect(filter.match(/size="xs" aria-hidden="true"/g)).toHaveLength(2)
    expect(filter).toContain('v-if="option.value && clientById(option.value)"')
    expect(filter).toContain('v-if="option?.value && clientById(option.value)"')
    expect(filter).toContain(':client="clientById(option.value)!"')
    expect(filter).toMatch(/<ClientAvatar[^>]+\/>\s*<span class="truncate">\{\{ option.label \}\}/)
    expect(filter).toMatch(/<ClientAvatar[^>]+\/>\s*<span class="truncate">\{\{ label \}\}/)
    expect(source).toContain('<Select v-model="form.client" :aria-label="t(\'common.client\')" :options="clients.map(c => ({ value: c.id, label: c.name }))" />')
  })

  it('keeps shared Select text fallbacks, search labels, accessible names and empty-value selection independent of visual slots', () => {
    const select = readFileSync('app/components/ui/select/Select.vue', 'utf8')
    expect(select).toContain('<slot name="selected" :option="selectedOption" :label="selectedLabel">{{ selectedLabel }}</slot>')
    expect(select).toContain('<slot name="option" :option="option">{{ option.label }}</slot>')
    expect(select).toContain("selectedOption.value?.label ?? props.placeholder ?? ''")
    expect(select).toContain(':text-value="option.label"')
    expect(select).toContain(':display-value="displayValue"')
    expect(select).toContain(':aria-label="ariaLabel ?? placeholder"')
    expect(select).toContain("return props.options.find(option => option.value === publicValue)?.label ?? ''")
    expect(select).toContain(":value=\"option.value === '' ? emptyOptionKey : option.value\"")
    expect(select).toContain("emit('update:modelValue', value === emptyOptionKey.value ? '' : value)")
    expect(select).toContain('@update:model-value="select"')
    expect(select).toContain('open.value = false')
  })

  it('retains CRUD, fallback warning, list detail link and distinct empty/no-match states', () => {
    expect(source.match(/projects.length === 0 \? 'projects.empty' : 'projects.noResults'/g)).toHaveLength(2)
    expect(source).toContain('loading && projects.length === 0')
    expect(source).toContain("t('totals.fallbackTruncated', { count: truncatedEntryCount })")
    expect(source).toContain('err instanceof TotalsRouteUnavailableError')
    expect(source).toContain('groupByProject(entries.filter(e => e.project))')
    expect(source).toContain('<NuxtLink :to="`/projects/${p.id}`"')
    expect(source.match(/v-if="canWrite"/g)).toHaveLength(3)
    expect(source).toContain('@submit.prevent="onSubmit"')
    expect(source).toContain('await create({ name: form.name')
    expect(source).toContain('await update(editing.value.id')
    expect(source).toContain('await update(project.id, { active: !project.active })')
  })
})

describe('Projects localized count', () => {
  it.each([
    { messages: en, expected: ['0 projects', '1 project', '2 projects'] },
    { messages: es, expected: ['0 proyectos', '1 proyecto', '2 proyectos'] },
    { messages: ja, expected: ['0件のプロジェクト', '1件のプロジェクト', '2件のプロジェクト'] },
  ])('selects singular/plural count and mirrors project keys', ({ messages, expected }) => {
    const expression = source.match(/\{\{ (t\(projects\.length === 1[^\n]+) \}\}/)?.[1]
    expect(expression).toBeTruthy()
    const render = new Function('projects', 't', `return ${expression}`)
    const t = (key: string, { count }: { count: number }) => messages.projects[key.split('.')[1] as 'count' | 'countOne'].replace('{count}', String(count))
    expect([0, 1, 2].map(length => render({ length }, t))).toEqual(expected)
    expect(Object.keys(messages.projects).sort()).toEqual(Object.keys(en.projects).sort())
    expect(messages.projects.openDetail).toContain('{name}')
  })
})
