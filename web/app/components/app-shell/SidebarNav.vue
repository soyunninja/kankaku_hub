<script setup lang="ts">
import {
  Boxes,
  Gauge,
  Inbox,
  Link2Off,
  ListTodo,
  Search,
  Settings,
  Terminal,
  Users,
} from '@lucide/vue'
import { Badge } from '@/components/ui/badge'

defineEmits<{ (e: 'navigate'): void }>()

const { t } = useI18n()
const route = useRoute()
const { count: sessionsQueueCount, ensureLoaded: ensureSessionsQueueCount, refresh: refreshSessionsQueueCount } = useSessionsQueueCount()

onMounted(() => {
  ensureSessionsQueueCount()
})
// A cheap re-check on every SPA navigation (not polling) — good enough to
// keep the badge from going stale after the queue is worked from its own
// page, without a realtime subscription for a single-user internal tool.
watch(() => route.path, () => {
  refreshSessionsQueueCount()
})

const nav = computed(() => [
  { to: '/', label: t('nav.dashboard'), icon: Gauge },
  { to: '/clients', label: t('nav.clients'), icon: Users },
  { to: '/projects', label: t('nav.projects'), icon: Boxes },
  { to: '/tasks', label: t('nav.tasks'), icon: ListTodo },
  { to: '/unassigned', label: t('nav.unassigned'), icon: Inbox },
  { to: '/sessions-without-task', label: t('nav.sessionsQueue'), icon: Link2Off, badge: sessionsQueueCount.value },
  { to: '/entries', label: t('nav.entries'), icon: Search },
  { to: '/commands', label: t('nav.commands'), icon: Terminal },
  { to: '/settings', label: t('nav.settings'), icon: Settings },
])

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}
</script>

<template>
  <nav class="flex flex-col gap-1 p-2">
    <NuxtLink
      v-for="item in nav"
      :key="item.to"
      :to="item.to"
      class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
      :class="isActive(item.to)
        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'"
      @click="$emit('navigate')"
    >
      <component :is="item.icon" class="size-4 shrink-0" />
      <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
      <Badge v-if="item.badge" variant="secondary" class="ml-auto shrink-0 tabular-nums">
        {{ item.badge }}
      </Badge>
    </NuxtLink>
  </nav>
</template>
