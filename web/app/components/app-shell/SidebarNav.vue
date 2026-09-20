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
import { NAV_ITEMS } from '@/lib/nav-items'

defineEmits<{ (e: 'navigate'): void }>()

const { t } = useI18n()
const route = useRoute()
const { count: sessionsQueueCount, ensureLoaded: ensureSessionsQueueCount, refresh: refreshSessionsQueueCount } = useSessionsQueueCount()
const { count: unassignedQueueCount, ensureLoaded: ensureUnassignedQueueCount, refresh: refreshUnassignedQueueCount } = useUnassignedQueueCount()

onMounted(() => {
  ensureSessionsQueueCount()
  ensureUnassignedQueueCount()
})
// A cheap re-check on every SPA navigation (not polling) — good enough to
// keep the badges from going stale after either queue is worked from its
// own page, without a realtime subscription for a single-user internal
// tool.
watch(() => route.path, () => {
  refreshSessionsQueueCount()
  refreshUnassignedQueueCount()
})

// Icons and badges are presentation concerns and stay local to this
// component; the route + label key come from the shared NAV_ITEMS
// registry (app/lib/nav-items.ts) so the header breadcrumb can never
// drift out of sync with what's actually in the nav.
const ICONS: Record<string, typeof Users> = {
  '/': Gauge,
  '/clients': Users,
  '/projects': Boxes,
  '/tasks': ListTodo,
  '/unassigned': Inbox,
  '/sessions-without-task': Link2Off,
  '/entries': Search,
  '/commands': Terminal,
  '/settings': Settings,
}
function badgeFor(to: string): number | undefined {
  if (to === '/unassigned') return unassignedQueueCount.value
  if (to === '/sessions-without-task') return sessionsQueueCount.value
  return undefined
}

const nav = computed(() => NAV_ITEMS.map(item => ({
  to: item.to,
  label: t(item.labelKey),
  icon: ICONS[item.to]!,
  badge: badgeFor(item.to),
})))

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
