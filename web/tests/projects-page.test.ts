import { readFileSync } from 'node:fs'
import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
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
  it('rejects a stale parent read after auth or route changes and blocks duplicate submits', async () => {
    const body = source.match(/async function onSubmit\(\) \{([\s\S]*?)\n\}/)?.[1]
    expect(body).toContain('createBusy.value')
    expect(body).toContain('isCreateCurrent')
    expect(body).toContain('createGeneration')
    expect(body).toContain('await latestClientIsActive(payload.client)')
    expect(source).toContain('@escape-key-down="guardDialogDismiss"')
    expect(source).toContain('@interact-outside="guardDialogDismiss"')
    expect(source).toContain('if (createBusy.value) event.preventDefault()')
  })

  it('suppresses stale parent completions and duplicate submits using the extracted handler', async () => {
    const body = source.match(/async function onSubmit\(\) \{([\s\S]*?)\n\}/)?.[1]!
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    const form = { name: 'New', client: 'c1', code: '', notes: '', active: true, repoPaths: [] as string[] }
    const dialogOpen = ref(true)
    const createBusy = ref(false)
    const createGeneration = ref(0)
    const createDialogIdentity = ref(1)
    const canWrite = ref(true)
    const authStore = { record: { id: 'owner-a' }, token: 'token-a' }
    const pb = { authStore }
    const route = { path: '/projects' }
    let resolveParent!: (active: boolean) => void
    const latestClientIsActive = vi.fn(() => new Promise<boolean>(resolve => { resolveParent = resolve }))
    const create = vi.fn()
    const toast = { success: vi.fn(), error: vi.fn() }
    const isCreateCurrent = (s: { generation: number, dialogIdentity: number, ownerId: string | null, token: string, permission: boolean, routePath: string, client: string, active: boolean }) => s.generation === createGeneration.value && s.dialogIdentity === createDialogIdentity.value && dialogOpen.value && s.ownerId === authStore.record?.id && s.token === authStore.token && s.permission === canWrite.value && canWrite.value && s.routePath === route.path && s.client === form.client && s.active === form.active
    const submit = new AsyncFunction('form', 'create', 'toast', 't', 'dialogOpen', 'latestClientIsActive', 'createBusy', 'createGeneration', 'createDialogIdentity', 'canWrite', '$pb', 'route', 'isCreateCurrent', body)
    const pending = submit(form, create, toast, (key: string) => key, dialogOpen, latestClientIsActive, createBusy, createGeneration, createDialogIdentity, canWrite, pb, route, isCreateCurrent)
    const duplicate = submit(form, create, toast, (key: string) => key, dialogOpen, latestClientIsActive, createBusy, createGeneration, createDialogIdentity, canWrite, pb, route, isCreateCurrent)
    await duplicate
    expect(latestClientIsActive).toHaveBeenCalledTimes(1)
    authStore.token = 'token-b'
    createGeneration.value++
    createBusy.value = false
    dialogOpen.value = false
    resolveParent(true)
    await pending
    expect(create).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('suppresses resolved or rejected stale writes and leaves newer busy state untouched', async () => {
    const body = source.match(/async function onSubmit\(\) \{([\s\S]*?)\n\}/)?.[1]!
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    for (const rejectWrite of [false, true]) {
      const form = { name: 'New', client: 'c1', code: '', notes: '', active: false, repoPaths: [] as string[] }
      const dialogOpen = ref(true), createBusy = ref(false), createGeneration = ref(0), createDialogIdentity = ref(1), canWrite = ref(true)
      const authStore = { record: { id: 'owner-a' }, token: 'token-a' }
      const route = { path: '/projects' }
      let finish!: (value?: unknown) => void
      const create = vi.fn(() => new Promise((resolve, reject) => { finish = rejectWrite ? reject : resolve }))
      const toast = { success: vi.fn(), error: vi.fn() }
      const current = (s: { generation: number, dialogIdentity: number, ownerId: string | null, token: string, permission: boolean, routePath: string, client: string, active: boolean }) => s.generation === createGeneration.value && s.dialogIdentity === createDialogIdentity.value && dialogOpen.value && s.ownerId === authStore.record?.id && s.token === authStore.token && s.permission === canWrite.value && canWrite.value && s.routePath === route.path && s.client === form.client && s.active === form.active
      const submit = new AsyncFunction('form', 'create', 'toast', 't', 'dialogOpen', 'latestClientIsActive', 'createBusy', 'createGeneration', 'createDialogIdentity', 'canWrite', '$pb', 'route', 'isCreateCurrent', body)
      const pending = submit(form, create, toast, (key: string) => key, dialogOpen, async () => true, createBusy, createGeneration, createDialogIdentity, canWrite, { authStore }, route, current)
      await Promise.resolve()
      createGeneration.value++
      createBusy.value = true
      if (rejectWrite) finish(new Error('stale failure'))
      else finish()
      await pending
      expect(toast.success).not.toHaveBeenCalled()
      expect(toast.error).not.toHaveBeenCalled()
      expect(createBusy.value).toBe(true)
    }
  })
  it('defaults create active only for a known active client and rereads the chosen parent before an active write', async () => {
    const form = { name: '', client: '', code: '', notes: '', active: false, repoPaths: [] as string[] }
    const clients = ref([{ id: 'inactive', active: false }, { id: 'active', active: true }])
    const dialogOpen = ref(false)
    const create = vi.fn().mockResolvedValue(undefined)
    const toast = { success: vi.fn(), error: vi.fn() }
    const openBody = source.match(/function openCreate\(\) \{([\s\S]*?)\n\}/)?.[1]
    const submitBody = source.match(/async function onSubmit\(\) \{([\s\S]*?)\n\}/)?.[1]
    expect(openBody).toBeTruthy()
    expect(submitBody).toBeTruthy()
    const openCreate = new Function('form', 'clients', 'dialogOpen', 'selectedClientActive', 'createBusy', 'canWrite', 'createDialogIdentity', openBody!)
    const onSubmit = new (Object.getPrototypeOf(async function () {}).constructor)('form', 'create', 'toast', 't', 'dialogOpen', 'latestClientIsActive', 'createBusy', 'createGeneration', 'createDialogIdentity', 'canWrite', '$pb', 'route', 'isCreateCurrent', submitBody!)
    openCreate(form, clients, dialogOpen, { get value() { return clients.value.find(client => client.id === form.client)?.active === true } }, ref(false), ref(true), ref(0))
    expect(form.client).toBe('active')
    expect(form.active).toBe(true)
    const latestClientIsActive = vi.fn().mockResolvedValue(false)
    await onSubmit(form, create, toast, (key: string) => key, dialogOpen, latestClientIsActive, ref(false), ref(0), ref(0), ref(true), { authStore: { record: { id: 'owner' }, token: 'token' } }, { path: '/projects' }, () => true)
    expect(latestClientIsActive).toHaveBeenCalledWith('active')
    expect(create).not.toHaveBeenCalled()
    expect(source).toContain(':disabled="createBusy || !selectedClientActive"')
    expect(source).toContain("t('projects.inactiveParentNotice')")
  })
  it('resets project notes for creation and sends empty or multiline Unicode notes unchanged', async () => {
    const form = { name: '', client: '', code: '', active: true, repoPaths: [] as string[], notes: 'stale' }
    const clients = ref([{ id: 'c1' }])
    const dialogOpen = ref(false)
    const createBusy = ref(false), createGeneration = ref(0), createDialogIdentity = ref(0), canWrite = ref(true)
    const pb = { authStore: { record: { id: 'owner' }, token: 'token' } }
    const route = { path: '/projects' }
    const create = vi.fn().mockResolvedValue(undefined)
    const toast = { success: vi.fn(), error: vi.fn() }
    const openBody = source.match(/function openCreate\(\) \{([\s\S]*?)\n\}/)?.[1]
    const submitBody = source.match(/async function onSubmit\(\) \{([\s\S]*?)\n\}/)?.[1]
    expect(openBody).toBeTruthy()
    expect(submitBody).toBeTruthy()
    const openCreate = new Function('form', 'clients', 'dialogOpen', 'selectedClientActive', 'createBusy', 'canWrite', 'createDialogIdentity', openBody!)
    const onSubmit = new (Object.getPrototypeOf(async function () {}).constructor)('form', 'create', 'toast', 't', 'dialogOpen', 'latestClientIsActive', 'createBusy', 'createGeneration', 'createDialogIdentity', 'canWrite', '$pb', 'route', 'isCreateCurrent', submitBody!)

    openCreate(form, clients, dialogOpen, { get value() { return clients.value.find(client => client.id === form.client)?.active === true } }, createBusy, canWrite, createDialogIdentity)
    expect(form.notes).toBe('')
    expect(en.projects.notes).toBe('Notes')
    expect(es.projects.notes).toBe('Notas')
    expect(ja.projects.notes).toBe('メモ')
    expect(en.projects.notesHint).toContain('5000')
    expect(es.projects.notesHint).toContain('5000')
    expect(ja.projects.notesHint).toContain('5000')
    for (const notes of ['', 'café\n設計メモ']) {
      form.notes = notes
      dialogOpen.value = true
      createDialogIdentity.value++
      await onSubmit(form, create, toast, (key: string) => key, dialogOpen, async () => true, createBusy, createGeneration, createDialogIdentity, canWrite, pb, route, () => true)
    }
    expect(create.mock.calls.map(([payload]) => payload.notes)).toEqual(['', 'café\n設計メモ'])
  })
  it('omits the empty catalog header only when embedded, preserving the standalone title and creation action', () => {
    expect(source).toContain('<div v-if="!props.embedded" class="flex flex-wrap items-center justify-between gap-3">')
    expect(source).toContain('<h1 class="text-xl font-semibold tracking-tight">')
    expect(source).toContain("{{ t('projects.title') }}")
    expect(source).not.toContain("props.embedded ? 'h2' : 'h1'")
    expect(source).toContain('v-if="canWrite && !props.embedded"')
  })
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

  it('groups the filtered stable results by parent-client activity, not project activity', () => {
    const groupBody = source.match(/const groupedFiltered = computed\(\(\) => \[([\s\S]*?)\n\]\)/)?.[1]
    expect(groupBody).toBeTruthy()
    const state = setupFilter()
    const clients = ref([
      { id: 'one', active: true },
      { id: 'two', active: false },
    ])
    const clientById = (id: string) => clients.value.find(client => client.id === id)
    const grouped = new Function('computed', 'filtered', 'clientById', `return computed(() => [${groupBody}])`)(computed, computed(() => state.projects.value.filter(p => state.ids().includes(p.id))), clientById)
    expect(grouped.value).toEqual([
      { active: true, projects: [state.projects.value[0], state.projects.value[1]] },
      { active: false, projects: [state.projects.value[2]] },
    ])
    state.search.value = 'portal'
    expect(grouped.value.flatMap((group: { projects: { id: string }[] }) => group.projects.map(p => p.id))).toEqual(['a', 'c'])
    state.filterClient.value = 'one'
    expect(grouped.value.flatMap((group: { projects: { id: string }[] }) => group.projects.map(p => p.id))).toEqual(['a'])
    state.search.value = ''
    expect(grouped.value.flatMap((group: { projects: { id: string }[] }) => group.projects.map(p => p.id))).toEqual(['a', 'b'])
    state.filterClient.value = ''
    state.projects.value.push({ id: 'unknown', name: 'Unowned', code: '', client: 'missing', active: true })
    expect(grouped.value[1].projects.map((p: { id: string }) => p.id)).toEqual(['c', 'unknown'])
    expect(state.projects.value.map(p => p.id)).toEqual(['a', 'b', 'c', 'unknown'])
  })
})

describe('Projects view contract', () => {
  it('defaults to grid, shares grouped results, and labels the visible filter and view controls', () => {
    expect(source).toContain("const view = ref<'grid' | 'list'>('grid')")
    expect(source.match(/v-for="p in group\.projects"/g)).toHaveLength(2)
    expect(source).not.toContain("projects.activeClientProjects")
    expect(source.match(/projects\.inactiveClientProjects/g)).toHaveLength(2)
    expect(source).toContain('<h2 v-if="!group.active" class="mb-3 text-sm font-semibold text-muted-foreground">{{ t(\'projects.inactiveClientProjects\') }}</h2>')
    expect(source).toContain('<TableRow v-if="!group.active && group.projects.length" class="bg-muted/50">')
    expect(source).toContain('<TableHead scope="rowgroup" colspan="5"')
    expect(source).toContain('v-show="group.projects.length"')
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
    expect(source.match(/class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 lg:gap-6"/g)).toHaveLength(3)
    const card = source.split('<article v-for="p in group.projects"')[1]!.split('</article>')[0]!
    expect(card).toContain('min-w-0')
    expect(card).toContain('[overflow-wrap:anywhere]')
    expect(card).toContain('grid-cols-1')
    expect(card).toContain('flex-wrap')
    expect(card).toContain('<ClientAvatar :client="clientById(p.client) ??')
    expect(card).not.toMatch(/ClientName|<a |<NuxtLink/)
    expect(source).not.toContain('FolderKanban')
    expect(card).toContain('{{ clientName(p.client) }}')
    expect(card).not.toContain('p.code')
    expect(card).toContain('totalsByProject[p.id]?.workMs ?? 0')
    expect(card).toContain('totalsByProject[p.id]?.cost ?? 0')
    expect(card).toContain(':aria-label="t(\'projects.openDetail\', { name: p.name })"')
    expect(card).toContain('@click="navigateTo(`/organizacion/clientes/${p.client}/proyectos/${p.id}`)"')
    expect(card).not.toMatch(/<article[^>]*@click/)
    expect(card).not.toContain('<RowActions')
  })

  it('hides project badges in inactive-parent groups and separates those sections', () => {
    const grid = source.split('<template v-if="view === \'grid\'">')[1]?.split('<Card v-else>')[0]!
    const list = source.split('<Card v-else>')[1]?.split('<Dialog v-model:open="dialogOpen">')[0]!
    expect(grid.match(/<Badge[^>]*v-if="group\.active"/g)).toHaveLength(1)
    expect(list.match(/<Badge[^>]*v-if="group\.active"/g)).toHaveLength(1)
    expect(grid).toContain(':class="{ \'mt-6\': !group.active }"')
    expect(list).toContain('class="text-left font-semibold pt-8"')
    expect(grid).toContain('class="ml-auto shrink-0 rounded-full text-muted-foreground"')
  })

  it('dims inactive-parent project items without dimming group headings and localizes the concise label', () => {
    const card = source.split('<article v-for="p in group.projects"')[1]!.split('</article>')[0]!
    const row = source.split('<TableRow v-for="p in group.projects"')[1]!.split('</TableRow>')[0]!
    expect(card).toContain(":class=\"{ 'opacity-75': !group.active }\"")
    expect(row).toContain(":class=\"{ 'opacity-75': !group.active }\"")
    expect(source).toContain('v-if="!group.active"')
    expect(source).toContain('v-if="!group.active && group.projects.length"')
    expect(en.projects.inactiveClientProjects).toBe('Inactive')
    expect(es.projects.inactiveClientProjects).toBe('Inactivos')
    expect(ja.projects.inactiveClientProjects).toBe('無効')
  })

  it('shows the project title before the concise client identity', () => {
    const card = source.split('<article v-for="p in group.projects"')[1]!.split('</article>')[0]!
    const header = card.split('<dl')[0]!
    expect(header).toContain('<h2 class="min-w-0 text-sm font-semibold [overflow-wrap:anywhere] sm:text-base">{{ p.name }}</h2>')
    expect(header).not.toContain('<RowActions')
    expect(header).toContain(':title="clientName(p.client)"')
    expect(header).not.toContain('p.code')
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
    expect(source).toContain('<Select v-model="form.client" :disabled="createBusy" :aria-label="t(\'common.client\')" :options="clients.map(c => ({ value: c.id, label: c.name }))" />')
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
    expect(source).toContain('<NuxtLink :to="`/organizacion/clientes/${p.client}/proyectos/${p.id}`"')
    expect(source).toContain('<Button v-if="canWrite && !props.embedded" data-testid="write-action" size="sm" @click="openCreate">')
    expect(source).toContain('<Button v-if="canWrite && props.embedded" data-testid="write-action" size="sm" @click="openCreate">')
    const grid = source.split('<template v-if="view === \'grid\'">')[1]?.split('<Card v-else>')[0]
    const list = source.split('<Card v-else>')[1]?.split('<Dialog v-model:open="dialogOpen">')[0]
    for (const view of [grid, list]) {
      expect(view).toBeDefined()
      expect(view).not.toContain('<RowActions')
      expect(view).not.toContain('openEdit(p)')
      expect(view).not.toContain('toggleArchive(p)')
    }
    expect(source).toContain('@submit.prevent="onSubmit"')
    expect(source).toContain('await create(payload)')
    expect(source).not.toContain('openEdit')
    expect(source).not.toContain('toggleArchive')
    expect(source).not.toContain('RowActions')
    expect(source).toContain('<SkeletonRows v-if="loading && projects.length === 0" :rows="4" :cols="5" />')
    expect(source).toContain('<TableHead scope="rowgroup" colspan="5"')
  })
})

describe('Projects localized count', () => {
  it.each([
    { messages: en, expected: ['0 projects, search projects…', '1 project, search projects…', '2 projects, search projects…'] },
    { messages: es, expected: ['0 proyectos, buscar en proyectos…', '1 proyecto, buscar en proyectos…', '2 proyectos, buscar en proyectos…'] },
    { messages: ja, expected: ['プロジェクト0件、プロジェクトを検索…', 'プロジェクト1件、プロジェクトを検索…', 'プロジェクト2件、プロジェクトを検索…'] },
  ])('selects singular/plural count and mirrors project keys', ({ messages, expected }) => {
    const expression = source.match(/:placeholder="(t\(projects\.length === 1[^"\n]+)"/)?.[1]
    expect(expression).toBeTruthy()
    const render = new Function('projects', 't', `return ${expression}`)
    const t = (key: string, { count }: { count: number }) => messages.projects[key.split('.')[1] as 'searchWithCount' | 'searchWithCountOne'].replace('{count}', String(count))
    expect([0, 1, 2].map(length => render({ length }, t))).toEqual(expected)
    expect(Object.keys(messages.projects).sort()).toEqual(Object.keys(en.projects).sort())
    expect(messages.projects.openDetail).toContain('{name}')
  })
})
