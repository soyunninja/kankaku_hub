<script setup lang="ts">
import { LogOut, Menu, Search } from '@lucide/vue'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { isReadOnlyRole } from '@/lib/roles'
import { resolveBreadcrumbLabels } from '@/lib/nav-items'
import LocaleSwitcher from './LocaleSwitcher.vue'
import ThemeToggle from './ThemeToggle.vue'

const emit = defineEmits<{ (e: 'openMobileNav' | 'openPalette'): void }>()

const { t } = useI18n()
const route = useRoute()
const { user, logout } = useAuth()
const { $pb } = useNuxtApp()
const router = useRouter()

const avatarUrl = computed(() => {
  const filename = user.value?.avatar?.trim()
  if (!user.value || !filename) return ''
  try {
    return $pb.files.getURL(user.value, filename)
  }
  catch {
    return ''
  }
})

/** Small "Read only" badge next to the user avatar for the `viewer` role
 * (odd/tasks/viewer-role.md T2) — owners see today's header unchanged. */
const isReadOnly = computed(() => isReadOnlyRole(user.value?.role))

// Segment -> label comes from the shared NAV_ITEMS registry
// (app/lib/nav-items.ts), not a locally-maintained map, so a route added
// to nav can never again be missing from the breadcrumb — see
// `resolveBreadcrumbLabels` for the unmapped-segment fallback.
const crumbs = computed(() => resolveBreadcrumbLabels(route.path, t))

async function onLogout() {
  logout()
  await router.push('/login')
}
</script>

<template>
  <header class="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
    <button class="rounded-md p-2 hover:bg-accent md:hidden" :aria-label="t('common.openMenu')" :title="t('common.openMenu')" @click="emit('openMobileNav')">
      <Menu class="size-5" aria-hidden="true" />
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

    <Badge v-if="isReadOnly" data-testid="read-only-badge" variant="outline" class="shrink-0 gap-1 text-xs font-normal text-muted-foreground">
      {{ t('auth.readOnly') }}
    </Badge>

    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button :aria-label="t('common.userMenu')">
          <Avatar :label="user?.email || 'kankaku'" :src="avatarUrl" :reset-key="user?.id" />
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
