<script setup lang="ts">
import {
  Boxes,
  Gauge,
  Inbox,
  Link2Off,
  ListTodo,
  Search,
  Settings,
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
  '/organizacion': Boxes,
  '/clients': Users,
  '/projects': Boxes,
  '/tasks': ListTodo,
  '/unassigned': Inbox,
  '/sessions-without-task': Link2Off,
  '/entries': Search,
  '/settings': Settings,
}
function badgeFor(to: string): number | undefined {
  if (to === '/unassigned') return unassignedQueueCount.value
  if (to === '/sessions-without-task') return sessionsQueueCount.value
  return undefined
}

const nav = computed(() => NAV_ITEMS
  .filter(item => !['/clients', '/projects', '/tasks'].includes(item.to))
  .map(item => ({
  to: item.to,
  sectionKey: item.sectionKey,
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
    <template v-for="(item, index) in nav" :key="item.to">
      <p v-if="item.sectionKey && item.sectionKey !== 'nav.organization' && item.sectionKey !== nav[index - 1]?.sectionKey" class="px-3 pb-1 pt-3 text-xs font-medium text-muted-foreground">
        {{ t(item.sectionKey) }}
      </p>
    <NuxtLink
      :to="item.to"
      :aria-current="isActive(item.to) ? 'page' : undefined"
      class="group/nav-item flex items-center gap-3 rounded-md bg-transparent px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-muted hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-indicator focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
      @click="$emit('navigate')"
    >
      <component :is="item.icon" class="size-4 shrink-0" :class="isActive(item.to) ? 'text-sidebar-primary' : 'text-sidebar-foreground'" />
      <span class="min-w-0 flex-1 truncate" :class="{ 'text-sidebar-primary dark:text-sidebar-foreground': isActive(item.to), 'group-hover/nav-item:text-sidebar-foreground': isActive(item.to) }">{{ item.label }}</span>
      <Badge v-if="item.badge" variant="secondary" class="ml-auto shrink-0 tabular-nums">
        {{ item.badge }}
      </Badge>
    </NuxtLink>
    </template>
  </nav>
</template>
