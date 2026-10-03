<script setup lang="ts">
import { CalendarRange } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DateRange, PresetKey } from '@/lib/period'
import { resolvePreset } from '@/lib/period'

const preset = defineModel<PresetKey>('preset', { default: '30d' })
const range = defineModel<DateRange>('range', { required: true })

const { t } = useI18n()
const dateId = useId()

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
      <Button variant="toolbar" class="control-field">
        <CalendarRange class="size-4" />
        <span class="tabular-nums">{{ range.start }} → {{ range.end }}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-80 max-w-[calc(100vw-2rem)]" align="start">
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
        <div class="flex flex-col gap-2">
          <label :for="`${dateId}-start`" class="text-sm text-muted-foreground">{{ t('entries.filtersFields.dateStart') }}</label>
          <input
            :id="`${dateId}-start`"
            v-model="range.start"
            type="date"
            class="control-size control-field w-full min-w-0 [color-scheme:light] dark:[color-scheme:dark] outline-none focus-visible:ring-3 focus-visible:ring-focus-indicator"
            @change="onCustomChange"
          >
          <span class="text-muted-foreground">→</span>
          <label :for="`${dateId}-end`" class="text-sm text-muted-foreground">{{ t('entries.filtersFields.dateEnd') }}</label>
          <input
            :id="`${dateId}-end`"
            v-model="range.end"
            type="date"
            class="control-size control-field w-full min-w-0 [color-scheme:light] dark:[color-scheme:dark] outline-none focus-visible:ring-3 focus-visible:ring-focus-indicator"
            @change="onCustomChange"
          >
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
