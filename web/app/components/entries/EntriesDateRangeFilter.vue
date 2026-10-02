<script setup lang="ts">
import { CalendarRange } from '@lucide/vue'
import EntriesDateFilter from '@/components/entries/EntriesDateFilter.vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { resolvePreset, type PresetKey } from '@/lib/period'

const start = defineModel<string | undefined>('start', { default: undefined })
const end = defineModel<string | undefined>('end', { default: undefined })
const { t } = useI18n()
const open = ref(false)
const presets: Exclude<PresetKey, 'custom'>[] = ['today', '7d', '30d', 'thisMonth', 'lastMonth']
const text = computed(() => {
  if (start.value && end.value) return `${start.value} → ${end.value}`
  if (start.value) return t('entries.filtersFields.fromDate', { date: start.value })
  if (end.value) return t('entries.filtersFields.untilDate', { date: end.value })
  return t('entries.filtersFields.allTime')
})
function choose(preset?: Exclude<PresetKey, 'custom'>) {
  const range = preset ? resolvePreset(preset) : undefined
  // Both updates happen synchronously: Entries batches its refresh watcher.
  start.value = range?.start
  end.value = range?.end
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label for="entries-date-range" class="text-xs text-muted-foreground">{{ t('entries.filtersFields.dateRange') }}</label>
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button id="entries-date-range" variant="outline" size="sm" :aria-label="`${t('entries.filtersFields.dateRange')}: ${text}`">
          <CalendarRange class="size-4" aria-hidden="true" />
          <span class="tabular-nums">{{ text }}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-80 max-w-[calc(100vw-2rem)]" align="start">
        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" @click="choose()">{{ t('entries.filtersFields.allTime') }}</Button>
            <Button v-for="p in presets" :key="p" size="sm" variant="outline" @click="choose(p)">{{ t(`dashboard.presets.${p}`) }}</Button>
          </div>
          <EntriesDateFilter id="entries-date-start" v-model="start" :label="t('entries.filtersFields.dateStart')" />
          <EntriesDateFilter id="entries-date-end" v-model="end" :label="t('entries.filtersFields.dateEnd')" />
        </div>
      </PopoverContent>
    </Popover>
  </div>
</template>
