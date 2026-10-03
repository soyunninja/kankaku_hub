<script setup lang="ts">
import { Gauge, Menu } from '@lucide/vue'
import CommandPalette from '@/components/app-shell/CommandPalette.vue'
import SidebarFooter from '@/components/app-shell/SidebarFooter.vue'
import SidebarNav from '@/components/app-shell/SidebarNav.vue'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/toast'

const { t } = useI18n()
const desktop = ref(false)
const mobileNavOpen = ref(false)
const paletteOpen = ref(false)
const menuTrigger = ref<InstanceType<typeof Button> | null>(null)
let media: MediaQueryList | undefined
let relocating = false
let paletteFromMobile = false

function focusMenu() {
  const button = menuTrigger.value?.$el as HTMLElement | undefined
  button?.focus({ preventScroll: true })
}

// Capture before Vue removes the old footer. Page/filter focus is never ours.
async function onBreakpoint() {
  const active = document.activeElement as HTMLElement | null
  const control = active?.closest('[data-testid="sidebar-footer"]')
    ? active.dataset.footerControl
    : undefined
  relocating = !!control
  desktop.value = media?.matches ?? false
  if (desktop.value) mobileNavOpen.value = false
  else if (control) mobileNavOpen.value = true
  await nextTick()
  if (control) {
    document.querySelector<HTMLElement>(`[data-testid="sidebar-footer"] [data-footer-control="${control}"]`)?.focus({ preventScroll: true })
  }
  relocating = false
}

function onMenuClose(event: Event) {
  event.preventDefault()
  if (!desktop.value && !paletteOpen.value && !relocating) focusMenu()
}

function openPalette() {
  paletteOpen.value = true
}

// The palette retains its existing single shortcut listener. Closing the Sheet
// synchronously prevents overlapping modal focus scopes even for Cmd/Ctrl+K.
watch(paletteOpen, (open) => {
  if (open && mobileNavOpen.value) {
    paletteFromMobile = true
    mobileNavOpen.value = false
  }
  else if (!open && paletteFromMobile) {
    paletteFromMobile = false
    nextTick(() => requestAnimationFrame(() => {
      if (!desktop.value) focusMenu()
    }))
  }
}, { flush: 'sync' })

onMounted(() => {
  media = window.matchMedia('(min-width: 768px)')
  desktop.value = media.matches
  media.addEventListener('change', onBreakpoint)
})
onBeforeUnmount(() => media?.removeEventListener('change', onBreakpoint))
</script>

<template>
  <div class="flex h-dvh bg-background">
    <aside v-show="desktop" class="m-6 flex h-[calc(100dvh-3rem)] w-60 shrink-0 flex-col rounded-3xl bg-sidebar">
      <div class="flex h-14 shrink-0 items-center gap-2 px-4">
        <Gauge class="size-5 text-primary" />
        <span class="font-semibold tracking-tight">{{ t('app.name') }}</span>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav />
      </div>
      <SidebarFooter v-if="desktop" @open-palette="openPalette" />
    </aside>

    <Sheet v-model:open="mobileNavOpen">
      <SheetContent v-if="!desktop" side="left" class="w-64 gap-0 border-r-0 bg-sidebar" @close-auto-focus="onMenuClose">
        <div class="flex h-14 shrink-0 items-center gap-2 px-4">
          <Gauge class="size-5 text-primary" />
          <SheetTitle class="font-semibold tracking-tight">{{ t('app.name') }}</SheetTitle>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav @navigate="mobileNavOpen = false" />
        </div>
        <SidebarFooter @open-palette="openPalette" />
      </SheetContent>
    </Sheet>

    <div data-testid="scroll-area" class="flex h-dvh min-w-0 flex-1 flex-col overflow-y-auto">
      <main class="flex-1 p-4 md:p-6">
        <Button
          v-if="!desktop"
          ref="menuTrigger"
          data-testid="mobile-menu-trigger"
          variant="ghost"
          class="mb-4 min-h-11 min-w-11"
          :aria-label="t('common.openMenu')"
          :title="t('common.openMenu')"
          :aria-expanded="mobileNavOpen"
          @click="mobileNavOpen = true"
        >
          <Menu class="size-5" aria-hidden="true" />
          {{ t('common.openMenu') }}
        </Button>
        <slot />
      </main>
    </div>

    <CommandPalette v-model:open="paletteOpen" />
    <Toaster />
  </div>
</template>
