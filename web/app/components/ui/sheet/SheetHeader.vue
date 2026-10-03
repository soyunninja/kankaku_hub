<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{ class?: HTMLAttributes["class"] }>()
</script>

<template>
  <div
    data-slot="sheet-header"
    :class="cn('flex min-h-[60px] min-w-0 flex-col gap-1.5 p-4 pr-[76px]', props.class)"
  >
    <slot />
  </div>
</template>
