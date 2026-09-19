<script setup lang="ts">
import { Languages } from '@lucide/vue'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const { t, locale, locales, setLocale } = useI18n()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        class="inline-flex size-8 items-center justify-center rounded-md border border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        :aria-label="t('settings.language')"
      >
        <Languages class="size-4" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem
        v-for="l in locales"
        :key="typeof l === 'string' ? l : l.code"
        :class="locale === (typeof l === 'string' ? l : l.code) ? 'bg-accent text-accent-foreground' : ''"
        @click="setLocale(typeof l === 'string' ? l : l.code)"
      >
        {{ typeof l === 'string' ? l : l.name }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
