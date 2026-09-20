<script setup lang="ts">
import { LogOut, Menu, Search } from '@lucide/vue'
import { Avatar } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import LocaleSwitcher from './LocaleSwitcher.vue'
import ThemeToggle from './ThemeToggle.vue'

const emit = defineEmits<{ (e: 'openMobileNav' | 'openPalette'): void }>()

const { t } = useI18n()
const route = useRoute()
const { user, logout } = useAuth()
const router = useRouter()

const SEGMENT_LABELS: Record<string, string> = {
  clients: 'nav.clients',
  projects: 'nav.projects',
  tasks: 'nav.tasks',
  unassigned: 'nav.unassigned',
  entries: 'nav.entries',
  commands: 'nav.commands',
  settings: 'nav.settings',
}

const crumbs = computed(() => {
  const parts = route.path.split('/').filter(Boolean)
  if (parts.length === 0) return [t('nav.dashboard')]
  return parts.map(p => SEGMENT_LABELS[p] ? t(SEGMENT_LABELS[p]) : p)
})

async function onLogout() {
  logout()
  await router.push('/login')
}
</script>

<template>
  <header class="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
    <button class="rounded-md p-2 hover:bg-accent md:hidden" @click="emit('openMobileNav')">
      <Menu class="size-5" />
    </button>

    <nav class="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground md:flex">
      <template v-for="(c, i) in crumbs" :key="i">
        <span :class="i === crumbs.length - 1 ? 'font-medium text-foreground' : ''">{{ c }}</span>
        <span v-if="i < crumbs.length - 1">/</span>
      </template>
    </nav>

    <div class="flex-1" />

    <button
      class="hidden items-center gap-2 rounded-md border border-input px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent sm:flex"
      @click="emit('openPalette')"
    >
      <Search class="size-3.5" />
      {{ t('palette.trigger') }}
      <kbd class="rounded border border-border bg-muted px-1 font-mono text-[10px]">⌘K</kbd>
    </button>

    <ThemeToggle />
    <LocaleSwitcher />

    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button :aria-label="t('common.userMenu')">
          <Avatar :label="user?.email || 'kankaku'" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-48">
        <DropdownMenuLabel>{{ user?.email }}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem @click="onLogout">
          <LogOut class="size-4" />
          {{ t('nav.logout') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </header>
</template>
