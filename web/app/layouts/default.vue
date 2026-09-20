<script setup lang="ts">
import { Gauge } from '@lucide/vue'
import CommandPalette from '@/components/app-shell/CommandPalette.vue'
import Header from '@/components/app-shell/Header.vue'
import SidebarNav from '@/components/app-shell/SidebarNav.vue'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/toast'

const { t } = useI18n()
const mobileNavOpen = ref(false)
const paletteOpen = ref(false)
</script>

<template>
  <div class="flex h-dvh bg-background">
    <aside class="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar md:flex">
      <div class="flex h-[4.5rem] shrink-0 items-center gap-2 px-4">
        <Gauge class="size-5 text-primary" />
        <span class="font-semibold tracking-tight">{{ t('app.name') }}</span>
      </div>
      <SidebarNav class="flex-1" />
    </aside>

    <Sheet v-model:open="mobileNavOpen">
      <SheetContent side="left" class="w-64">
        <div class="flex h-12 items-center gap-2 px-2">
          <Gauge class="size-5 text-primary" />
          <span class="font-semibold tracking-tight">{{ t('app.name') }}</span>
        </div>
        <SidebarNav @navigate="mobileNavOpen = false" />
      </SheetContent>
    </Sheet>

    <div data-testid="scroll-area" class="flex h-dvh min-w-0 flex-1 flex-col overflow-y-auto">
      <Header @open-mobile-nav="mobileNavOpen = true" @open-palette="paletteOpen = true" />
      <main class="flex-1 p-4 md:p-6">
        <slot />
      </main>
    </div>

    <CommandPalette v-model:open="paletteOpen" />
    <Toaster />
  </div>
</template>
