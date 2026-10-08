<script setup lang="ts">
import CatalogNavigation from '@/components/organization/CatalogNavigation.vue'
const { t } = useI18n()
const route = useRoute()
const links = [
  { to: '/clients', label: 'nav.clients' },
  { to: '/projects', label: 'nav.projects' },
  { to: '/tasks', label: 'nav.tasks' },
]
function isActive(to: string) {
  return route.path === to
}
</script>

<template>
  <nav class="flex flex-wrap items-center gap-1 border-b" :aria-label="t('nav.organization')">
    <NuxtLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      :aria-current="isActive(link.to) ? 'page' : undefined"
      class="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium ring-offset-background transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      :class="isActive(link.to) ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'"
    >
      {{ t(link.label) }}
    </NuxtLink>
    <CatalogNavigation />
  </nav>
</template>
