<script setup lang="ts">
import { Boxes, ListTodo, Search, Terminal, Users } from '@lucide/vue'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const router = useRouter()
const { clients, ensureLoaded: ensureClients } = useClients()
const { projects, ensureLoaded: ensureProjects } = useProjects()
const { tasks, ensureLoaded: ensureTasks } = useTasks()

const query = ref('')

watch(open, async (v) => {
  if (v) {
    query.value = ''
    await Promise.all([ensureClients(), ensureProjects(), ensureTasks()])
  }
})

interface Entry { id: string, label: string, to: string, icon: typeof Users }

/** Static, non-record pages reachable from the palette (in addition to the dynamic client/project/task entries below). */
const pages = computed<Entry[]>(() => [
  { id: 'page-commands', label: t('nav.commands'), to: '/commands', icon: Terminal },
])

const items = computed<Entry[]>(() => {
  const q = query.value.trim().toLowerCase()
  const all: Entry[] = [
    ...pages.value,
    ...clients.value.map(c => ({ id: c.id, label: c.name, to: `/clients?highlight=${c.id}`, icon: Users })),
    ...projects.value.map(p => ({ id: p.id, label: p.name, to: `/projects/${p.id}`, icon: Boxes })),
    ...tasks.value.map(t2 => ({ id: t2.id, label: t2.title, to: `/tasks?highlight=${t2.id}`, icon: ListTodo })),
  ]
  if (!q) return all.slice(0, 8)
  return all.filter(e => e.label.toLowerCase().includes(q)).slice(0, 20)
})

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
        <Input v-model="query" autofocus :placeholder="t('palette.placeholder')" class="border-0 shadow-none focus-visible:ring-0" />
      </div>
      <div class="max-h-80 overflow-y-auto">
        <button
          v-for="item in items"
          :key="item.id"
          class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
          @click="go(item)"
        >
          <component :is="item.icon" class="size-4 text-muted-foreground" />
          {{ item.label }}
        </button>
        <p v-if="items.length === 0" class="px-3 py-6 text-center text-sm text-muted-foreground">
          {{ t('palette.empty') }}
        </p>
      </div>
    </DialogContent>
  </Dialog>
</template>
