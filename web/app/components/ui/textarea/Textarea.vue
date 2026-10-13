<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { useVModel } from "@vueuse/core"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
  defaultValue?: string | number
  modelValue?: string | number
}>()

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void
}>()

const modelValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: props.defaultValue,
})
</script>

<template>
  <textarea
    v-model="modelValue"
    data-slot="textarea"
    :class="cn('placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground control-field flex field-sizing-content min-h-16 w-full min-w-0 rounded-[16px] px-3 py-2 text-base transition-[color,box-shadow] outline-none focus-visible:ring-focus-indicator focus-visible:ring-3 aria-invalid:ring-destructive aria-invalid:focus-visible:ring-destructive aria-invalid:ring-3 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm', props.class)"
  />
</template>
