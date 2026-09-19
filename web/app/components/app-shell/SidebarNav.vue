<script setup lang="ts">
import {
  Boxes,
  Gauge,
  Inbox,
  ListTodo,
  Search,
  Settings,
  Users,
} from '@lucide/vue'

defineEmits<{ (e: 'navigate'): void }>()

const { t } = useI18n()
const route = useRoute()

const nav = computed(() => [
  { to: '/', label: t('nav.dashboard'), icon: Gauge },
  { to: '/clients', label: t('nav.clients'), icon: Users },
  { to: '/projects', label: t('nav.projects'), icon: Boxes },
  { to: '/tasks', label: t('nav.tasks'), icon: ListTodo },
  { to: '/unassigned', label: t('nav.unassigned'), icon: Inbox },
  { to: '/entries', label: t('nav.entries'), icon: Search },
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
      <span>{{ item.label }}</span>
    </NuxtLink>
  </nav>
</template>
