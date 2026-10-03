<script setup lang="ts">
import type { AcceptableValue } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { ChevronDownIcon } from "@lucide/vue"
import { reactiveOmit, useVModel } from "@vueuse/core"
import { cn } from "@/lib/utils"

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<{ modelValue?: AcceptableValue | AcceptableValue[], class?: HTMLAttributes["class"] }>()

const emit = defineEmits<{
  "update:modelValue": AcceptableValue
}>()

const modelValue = useVModel(props, "modelValue", emit, {
  passive: true,
  defaultValue: "",
})

const delegatedProps = reactiveOmit(props, "class")
</script>

<template>
  <div
    class="group/native-select relative w-fit has-[select:disabled]:opacity-50"
    data-slot="native-select-wrapper"
  >
    <select
      v-bind="{ ...$attrs, ...delegatedProps }"
      v-model="modelValue"
      data-slot="native-select"
      :class="cn(
        'control-size control-field placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground w-full min-w-0 appearance-none py-2 pr-9 transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed',
        'focus-visible:ring-focus-indicator focus-visible:ring-3',
        'aria-invalid:ring-destructive aria-invalid:focus-visible:ring-destructive aria-invalid:ring-3',
        props.class,
      )"
    >
      <slot />
    </select>
    <ChevronDownIcon
      class="text-muted-foreground pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 select-none"
      aria-hidden="true"
      data-slot="native-select-icon"
    />
  </div>
</template>
