<script setup lang="ts">
import { Laptop, Moon, Sun } from '@lucide/vue'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const colorMode = useColorMode()
const { t } = useI18n()

const options = [
  { value: 'dark', icon: Moon, label: computed(() => t('theme.dark')) },
  { value: 'light', icon: Sun, label: computed(() => t('theme.light')) },
  { value: 'system', icon: Laptop, label: computed(() => t('theme.system')) },
] as const
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        class="inline-flex size-8 items-center justify-center rounded-md border border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        :aria-label="t('theme.label')"
      >
        <Sun v-if="colorMode.preference === 'light'" class="size-4" />
        <Moon v-else-if="colorMode.preference === 'dark'" class="size-4" />
        <Laptop v-else class="size-4" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem
        v-for="opt in options"
        :key="opt.value"
        :class="colorMode.preference === opt.value ? 'bg-accent text-accent-foreground' : ''"
        @click="colorMode.preference = opt.value"
      >
        <component :is="opt.icon" class="size-4" />
        {{ opt.label.value }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
