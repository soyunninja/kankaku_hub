<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div
    data-slot="dialog-header"
    :class="cn('flex min-h-9 min-w-0 flex-col gap-2 pr-12 text-center sm:text-left', props.class)"
  >
    <slot />
  </div>
</template>
