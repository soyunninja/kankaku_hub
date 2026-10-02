<script setup lang="ts">
import { CalendarDays, X } from '@lucide/vue'
import { CalendarDate, parseDate, today, getLocalTimeZone } from '@internationalized/date'
import type { DateValue } from 'reka-ui'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatShortFilterDate, parseShortFilterDate } from '@/lib/entries-compact-date'

const props = defineProps<{ id: string, label: string, modelValue?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>()
const { t, locale } = useI18n()
const draft = ref(formatShortFilterDate(props.modelValue ?? ''))
const invalid = ref(false)
const open = ref(false)
const errorId = computed(() => `${props.id}-error`)

// Route-driven changes replace drafts too, including drafts left incomplete.
watch(() => props.modelValue, value => {
  draft.value = formatShortFilterDate(value ?? '')
  invalid.value = false
})

const selected = computed<DateValue | undefined>(() => {
  if (!props.modelValue || formatShortFilterDate(props.modelValue) === '—') return undefined
  return parseDate(props.modelValue)
})
const placeholder = shallowRef<DateValue>(selected.value ?? today(getLocalTimeZone()))
watch(selected, value => { if (value) placeholder.value = value })

function commit() {
  const result = parseShortFilterDate(draft.value)
  invalid.value = result.status === 'invalid'
  if (result.status === 'invalid') return
  const next = result.status === 'clear' ? undefined : result.value
  if (next !== props.modelValue) emit('update:modelValue', next)
}
function clear() {
  draft.value = ''
  invalid.value = false
  open.value = false
  if (props.modelValue !== undefined) emit('update:modelValue', undefined)
}
function selectDate(value: DateValue | undefined) {
  if (!value || value.year < 2000 || value.year > 2099) return
  const day = value.toString()
  draft.value = formatShortFilterDate(day)
  invalid.value = false
  if (day !== props.modelValue) emit('update:modelValue', day)
  open.value = false
}
const minDate = markRaw(new CalendarDate(2000, 1, 1))
const maxDate = markRaw(new CalendarDate(2099, 12, 31))
</script>

<template>
  <div class="flex flex-col gap-1">
    <label class="text-xs text-muted-foreground" :for="id">{{ label }}</label>
    <div class="flex items-center gap-1">
      <Input
        :id="id" v-model="draft" type="text" inputmode="numeric" maxlength="8"
        placeholder="YY/MM/DD" class="w-28" :aria-invalid="invalid"
        :aria-describedby="invalid ? errorId : undefined"
        @update:model-value="invalid = false" @blur="commit" @keydown.enter="commit"
      />
      <Popover v-model:open="open">
        <PopoverTrigger as-child>
          <Button type="button" size="icon" variant="outline" :aria-label="t('entries.filtersFields.openCalendar', { label })" :title="t('entries.filtersFields.openCalendar', { label })">
            <CalendarDays class="size-4" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-auto p-0" align="start">
          <Calendar
            v-model:placeholder="placeholder" :model-value="selected" :locale="locale"
            :min-value="minDate" :max-value="maxDate" initial-focus
            @update:model-value="selectDate"
          />
        </PopoverContent>
      </Popover>
      <Button type="button" size="icon" variant="ghost" :aria-label="t('entries.filtersFields.clearDate', { label })" :title="t('entries.filtersFields.clearDate', { label })" @click="clear">
        <X class="size-4" aria-hidden="true" />
      </Button>
    </div>
    <span v-if="invalid" :id="errorId" role="alert" class="text-xs text-destructive">{{ t('entries.filtersFields.invalidDate') }}</span>
  </div>
</template>
