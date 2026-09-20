<script setup lang="ts">
import { Check, Languages } from '@lucide/vue'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const { t, locale, locales, setLocale } = useI18n()

function codeOf(l: (typeof locales.value)[number]): Parameters<typeof setLocale>[0] {
  return (typeof l === 'string' ? l : l.code) as Parameters<typeof setLocale>[0]
}
function nameOf(l: (typeof locales.value)[number]): string {
  return typeof l === 'string' ? l : (l.name ?? l.code)
}
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
        :key="codeOf(l)"
        role="menuitemradio"
        :aria-checked="locale === codeOf(l)"
        :class="locale === codeOf(l) ? 'bg-accent text-accent-foreground' : ''"
        class="justify-between gap-4"
        @click="setLocale(codeOf(l))"
      >
        {{ nameOf(l) }}
        <Check v-if="locale === codeOf(l)" class="size-4" />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
