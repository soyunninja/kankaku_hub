<script setup lang="ts">
import { ChevronUp, LogOut, Search } from '@lucide/vue'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import Kbd from '@/components/ui/kbd/Kbd.vue'
import { isReadOnlyRole } from '@/lib/roles'

const emit = defineEmits<{ openPalette: [] }>()
const { t } = useI18n()
const { user, logout } = useAuth()
const { $pb } = useNuxtApp()
const router = useRouter()
const isReadOnly = computed(() => isReadOnlyRole(user.value?.role))
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

async function onLogout() {
  logout()
  await router.push('/login')
}
</script>

<template>
  <footer data-testid="sidebar-footer" class="shrink-0 space-y-2 p-3 text-sidebar-foreground">
    <button
      data-footer-control="search"
      class="control-size control-field flex w-full items-center gap-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-indicator"
      :aria-label="t('palette.trigger')"
      @click="emit('openPalette')"
    >
      <Search class="size-4 shrink-0" aria-hidden="true" />
      <span class="min-w-0 flex-1 text-left">{{ t('palette.trigger') }}</span>
      <Kbd aria-hidden="true">⌘K</Kbd>
    </button>
    <Badge v-if="isReadOnly" data-testid="read-only-badge" variant="outline" class="max-w-full text-xs font-normal text-muted-foreground">
      {{ t('auth.readOnly') }}
    </Badge>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button
          data-footer-control="account"
          class="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-indicator"
          :aria-label="`${t('common.userMenu')}: ${user?.email || t('app.name')}`"
          :title="user?.email"
        >
          <Avatar :label="user?.email || 'kankaku'" :src="avatarUrl" :reset-key="user?.id" />
          <span class="min-w-0 flex-1 truncate text-sm">{{ user?.email }}</span>
          <ChevronUp class="size-4 shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" class="w-60 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel class="break-all">{{ user?.email }}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem @click="onLogout">
          <LogOut class="size-4" />
          {{ t('nav.logout') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </footer>
</template>
