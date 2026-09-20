<script setup lang="ts">
import { Boxes, Gauge, Inbox, ListTodo, Search, Settings, Terminal, Users } from '@lucide/vue'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const router = useRouter()
const { clients, ensureLoaded: ensureClients } = useClients()
const { projects, ensureLoaded: ensureProjects } = useProjects()
const { tasks, ensureLoaded: ensureTasks } = useTasks()

const query = ref('')
/** Index into `items` of the option the arrow keys are on; Enter opens it. */
const activeIndex = ref(0)
const listEl = ref<HTMLElement | null>(null)

watch(open, async (v) => {
  if (v) {
    query.value = ''
    activeIndex.value = 0
    await Promise.all([ensureClients(), ensureProjects(), ensureTasks()])
  }
})

interface Entry { id: string, label: string, to: string, icon: typeof Users }

/** Every page of the app, so the palette also works as plain keyboard navigation. */
const pages = computed<Entry[]>(() => [
  { id: 'page-dashboard', label: t('nav.dashboard'), to: '/', icon: Gauge },
  { id: 'page-clients', label: t('nav.clients'), to: '/clients', icon: Users },
  { id: 'page-projects', label: t('nav.projects'), to: '/projects', icon: Boxes },
  { id: 'page-tasks', label: t('nav.tasks'), to: '/tasks', icon: ListTodo },
  { id: 'page-unassigned', label: t('nav.unassigned'), to: '/unassigned', icon: Inbox },
  { id: 'page-entries', label: t('nav.entries'), to: '/entries', icon: Search },
  { id: 'page-commands', label: t('nav.commands'), to: '/commands', icon: Terminal },
  { id: 'page-settings', label: t('nav.settings'), to: '/settings', icon: Settings },
])

const items = computed<Entry[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return pages.value
  const all: Entry[] = [
    ...pages.value,
    ...clients.value.map(c => ({ id: c.id, label: c.name, to: `/clients?highlight=${c.id}`, icon: Users })),
    ...projects.value.map(p => ({ id: p.id, label: p.name, to: `/projects/${p.id}`, icon: Boxes })),
    ...tasks.value.map(t2 => ({ id: t2.id, label: t2.title, to: `/tasks?highlight=${t2.id}`, icon: ListTodo })),
  ]
  return all.filter(e => e.label.toLowerCase().includes(q)).slice(0, 20)
})

// A new query yields a new list: start again from its first option.
watch(query, () => {
  activeIndex.value = 0
})
// The list can also shrink under the cursor when data finishes loading.
watch(items, (list) => {
  if (activeIndex.value > list.length - 1) activeIndex.value = Math.max(0, list.length - 1)
})

const optionId = (index: number) => `palette-option-${index}`
const activeOptionId = computed(() => (items.value.length > 0 ? optionId(activeIndex.value) : undefined))

function setActive(index: number) {
  activeIndex.value = index
  nextTick(() => {
    listEl.value?.querySelector(`#${optionId(index)}`)?.scrollIntoView({ block: 'nearest' })
  })
}

/** Arrow keys wrap around; Home/End jump; Enter opens the active option. Focus never leaves the input. */
function onInputKeydown(e: KeyboardEvent) {
  const count = items.value.length
  if (count === 0) return
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      setActive((activeIndex.value + 1) % count)
      break
    case 'ArrowUp':
      e.preventDefault()
      setActive((activeIndex.value - 1 + count) % count)
      break
    case 'Home':
      e.preventDefault()
      setActive(0)
      break
    case 'End':
      e.preventDefault()
      setActive(count - 1)
      break
    case 'Enter': {
      e.preventDefault()
      const entry = items.value[activeIndex.value]
      if (entry) go(entry)
      break
    }
  }
}

function go(entry: Entry) {
  open.value = false
  router.push(entry.to)
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    open.value = !open.value
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-md gap-3 p-3">
      <DialogTitle class="sr-only">
        {{ t('palette.title') }}
      </DialogTitle>
      <div class="flex items-center gap-2 rounded-md border border-input px-3">
        <Search class="size-4 text-muted-foreground" />
        <Input
          v-model="query"
          autofocus
          role="combobox"
          aria-autocomplete="list"
          aria-controls="palette-listbox"
          :aria-expanded="items.length > 0"
          :aria-activedescendant="activeOptionId"
          :placeholder="t('palette.placeholder')"
          class="border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          @keydown="onInputKeydown"
        />
      </div>
      <div
        id="palette-listbox"
        ref="listEl"
        role="listbox"
        :aria-label="t('palette.title')"
        class="max-h-80 overflow-y-auto"
      >
        <div
          v-for="(item, index) in items"
          :id="optionId(index)"
          :key="item.id"
          role="option"
          :aria-selected="index === activeIndex"
          class="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm"
          :class="index === activeIndex ? 'bg-accent text-accent-foreground' : ''"
          @mousemove="activeIndex = index"
          @click="go(item)"
        >
          <component :is="item.icon" class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 truncate">{{ item.label }}</span>
        </div>
        <p v-if="items.length === 0" class="px-3 py-6 text-center text-sm text-muted-foreground">
          {{ t('palette.empty') }}
        </p>
      </div>
    </DialogContent>
  </Dialog>
</template>
