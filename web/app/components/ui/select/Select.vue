<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Check, ChevronsUpDown } from '@lucide/vue'
import Combobox from '@/components/ui/combobox/Combobox.vue'
import ComboboxAnchor from '@/components/ui/combobox/ComboboxAnchor.vue'
import ComboboxEmpty from '@/components/ui/combobox/ComboboxEmpty.vue'
import ComboboxInput from '@/components/ui/combobox/ComboboxInput.vue'
import ComboboxItem from '@/components/ui/combobox/ComboboxItem.vue'
import ComboboxList from '@/components/ui/combobox/ComboboxList.vue'
import ComboboxTrigger from '@/components/ui/combobox/ComboboxTrigger.vue'
import ComboboxViewport from '@/components/ui/combobox/ComboboxViewport.vue'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  class?: HTMLAttributes['class']
  modelValue?: string
  options: { value: string, label: string }[]
  placeholder?: string
  /** Accessible name for the trigger; native attributes belong on the trigger, not the root. */
  ariaLabel?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()
const attrs = useAttrs()
const { t } = useI18n()
const disabled = computed(() => attrs.disabled !== undefined && attrs.disabled !== false)
const selectedLabel = computed(() => props.options.find(option => option.value === (props.modelValue ?? ''))?.label ?? props.placeholder ?? '')
// Reka reserves the empty string for clearing a selection and rejects empty item values.
// Keep the public empty value unchanged while giving its explicit All/None item a private key.
const emptyOptionKey = computed(() => {
  let key = '\u0000'
  while (props.options.some(option => option.value === key)) key += '\u0000'
  return key
})
const hasEmptyOption = computed(() => props.options.some(option => option.value === ''))
const internalValue = computed(() => (props.modelValue ?? '') === '' && hasEmptyOption.value ? emptyOptionKey.value : (props.modelValue ?? ''))
const open = ref(false)

function displayValue(value: unknown): string {
  if (typeof value !== 'string') return ''
  const publicValue = value === emptyOptionKey.value ? '' : value
  return props.options.find(option => option.value === publicValue)?.label ?? ''
}

function select(value: unknown) {
  if (typeof value !== 'string') return
  emit('update:modelValue', value === emptyOptionKey.value ? '' : value)
  open.value = false
}
</script>

<template>
  <Combobox :model-value="internalValue" :open="open" :disabled="disabled" @update:model-value="select" @update:open="open = $event">
    <ComboboxAnchor as-child>
      <ComboboxTrigger as-child>
        <button
          v-bind="attrs" type="button" role="combobox" data-slot="combobox-trigger" :aria-label="ariaLabel ?? placeholder" :disabled="disabled"
          :class="cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            props.class,
          )"
        >
          <span class="truncate">{{ selectedLabel }}</span>
          <ChevronsUpDown class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxList align="start" class="min-w-(--reka-combobox-trigger-width) p-0">
      <ComboboxInput :aria-label="ariaLabel ?? placeholder ?? t('common.search')" :placeholder="placeholder" :display-value="displayValue" />
      <ComboboxViewport>
        <ComboboxEmpty>{{ t('common.noResults') }}</ComboboxEmpty>
        <ComboboxItem v-for="option in options" :key="option.value" :value="option.value === '' ? emptyOptionKey : option.value" :text-value="option.label">
          {{ option.label }}
          <Check v-if="option.value === (modelValue ?? '')" class="ml-auto size-4" aria-hidden="true" />
        </ComboboxItem>
      </ComboboxViewport>
    </ComboboxList>
  </Combobox>
</template>
