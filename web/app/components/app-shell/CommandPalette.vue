<script setup lang="ts">
import { Boxes, Gauge, Inbox, Link2Off, ListTodo, Search, Settings, Users } from '@lucide/vue'
import ClientAvatar from '@/components/clients/ClientAvatar.vue'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NAV_ITEMS } from '@/lib/nav-items'
import { taskDetailRoute } from '@/lib/task-detail-route'
import type { ClientRecord } from '@/lib/pocketbase-types'

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const router = useRouter()
const { clients, ensureLoaded: ensureClients } = useClients()
const { projects, ensureLoaded: ensureProjects } = useProjects()
const { tasks, ensureLoaded: ensureTasks } = useTasks()
const { count: sessionsQueueCount, ensureLoaded: ensureSessionsQueueCount } = useSessionsQueueCount()
const { count: unassignedQueueCount, ensureLoaded: ensureUnassignedQueueCount } = useUnassignedQueueCount()

const query = ref('')
/** Index into `items` of the option the arrow keys are on; Enter opens it. */
const activeIndex = ref(0)
const listEl = ref<HTMLElement | null>(null)

watch(open, async (v) => {
  if (v) {
    query.value = ''
    activeIndex.value = 0
    await Promise.all([ensureClients(), ensureProjects(), ensureTasks(), ensureSessionsQueueCount(), ensureUnassignedQueueCount()])
  }
})

interface Entry { id: string, label: string, to: string, icon: typeof Users, client?: ClientRecord, badge?: number }

// Icons and badges are presentation concerns and stay local to this
// component; the route + label key come from the shared NAV_ITEMS
// registry (app/lib/nav-items.ts).
const ICONS: Record<string, typeof Users> = {
  '/': Gauge,
  '/organizacion': Boxes,
  '/clients': Users,
  '/projects': Boxes,
  '/tasks': ListTodo,
  '/team': Users,
  '/unassigned': Inbox,
  '/sessions-without-task': Link2Off,
  '/entries': Search,
  '/settings': Settings,
}
function badgeFor(to: string): number | undefined {
  if (to === '/unassigned') return unassignedQueueCount.value || undefined
  if (to === '/sessions-without-task') return sessionsQueueCount.value || undefined
  return undefined
}

/** Every page of the app, so the palette also works as plain keyboard navigation. */
const pages = computed<Entry[]>(() => NAV_ITEMS.map(item => ({
  id: `page-${item.to === '/' ? 'dashboard' : item.to.slice(1)}`,
  label: t(item.labelKey),
  to: item.to,
  icon: ICONS[item.to]!,
  badge: badgeFor(item.to),
})))

const items = computed<Entry[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return pages.value
  const all: Entry[] = [
    ...pages.value,
    ...clients.value.map(c => ({ id: c.id, label: c.name, to: `/organizacion/clientes/${c.id}`, icon: Users, client: c })),
    ...projects.value.map(p => ({ id: p.id, label: p.name, to: `/organizacion/clientes/${p.client}/proyectos/${p.id}`, icon: Boxes })),
    ...tasks.value.map(t2 => ({ id: t2.id, label: t2.title, to: taskDetailRoute(t2, projects.value), icon: ListTodo })),
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
    <DialogContent :show-close-button="false" class="max-w-md gap-3 p-3">
      <DialogTitle class="sr-only">
        {{ t('palette.title') }}
      </DialogTitle>
      <div class="control-size control-field flex items-center gap-2 focus-within:ring-3 focus-within:ring-focus-indicator">
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
          class="h-full rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
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
          <ClientAvatar v-if="item.client" :client="item.client" size="xs" />
          <component :is="item.icon" v-else class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
          <Badge v-if="item.badge" variant="secondary" class="ml-auto shrink-0 tabular-nums">
            {{ item.badge }}
          </Badge>
        </div>
        <p v-if="items.length === 0" class="px-3 py-6 text-center text-sm text-muted-foreground">
          {{ t('palette.empty') }}
        </p>
      </div>
    </DialogContent>
  </Dialog>
</template>
