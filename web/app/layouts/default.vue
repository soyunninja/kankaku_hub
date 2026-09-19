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
  <div class="min-h-screen bg-background">
    <aside class="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div class="flex h-14 items-center gap-2 px-4">
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

    <div class="md:pl-60">
      <Header @open-mobile-nav="mobileNavOpen = true" @open-palette="paletteOpen = true" />
      <main class="p-4 md:p-6">
        <slot />
      </main>
    </div>

    <CommandPalette v-model:open="paletteOpen" />
    <Toaster />
  </div>
</template>
