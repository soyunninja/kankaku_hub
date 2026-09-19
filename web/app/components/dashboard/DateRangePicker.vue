<script setup lang="ts">
import { CalendarRange } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DateRange, PresetKey } from '@/lib/period'
import { resolvePreset } from '@/lib/period'

const preset = defineModel<PresetKey>('preset', { default: '30d' })
const range = defineModel<DateRange>('range', { required: true })

const { t } = useI18n()

const presets: Exclude<PresetKey, 'custom'>[] = ['today', '7d', '30d', 'thisMonth', 'lastMonth']

function choose(p: Exclude<PresetKey, 'custom'>) {
  preset.value = p
  range.value = resolvePreset(p)
}

function onCustomChange() {
  preset.value = 'custom'
}

const open = ref(false)
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="outline" size="sm">
        <CalendarRange class="size-4" />
        <span class="tabular-nums">{{ range.start }} → {{ range.end }}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto" align="start">
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap gap-1.5">
          <Button
            v-for="p in presets"
            :key="p"
            size="sm"
            :variant="preset === p ? 'default' : 'outline'"
            @click="choose(p)"
          >
            {{ t(`dashboard.presets.${p}`) }}
          </Button>
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model="range.start"
            type="date"
            class="h-8 rounded-md border border-input bg-background px-2 text-sm"
            @change="onCustomChange"
          >
          <span class="text-muted-foreground">→</span>
          <input
            v-model="range.end"
            type="date"
            class="h-8 rounded-md border border-input bg-background px-2 text-sm"
            @change="onCustomChange"
          >
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
