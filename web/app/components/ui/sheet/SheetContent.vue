<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { X } from '@lucide/vue'
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{ class?: HTMLAttributes['class'], side?: 'left' | 'right' }>(), { side: 'left', class: undefined })
const emits = defineEmits<{ (e: 'escapeKeyDown' | 'pointerDownOutside', ev: Event): void }>()
const forwarded = useForwardPropsEmits(props, emits)

const sideClass = props.side === 'left'
  ? 'inset-y-0 left-0 h-full w-72 data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left'
  : 'inset-y-0 right-0 h-full w-72 data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right'
</script>

<template>
  <DialogPortal>
    <DialogOverlay class="fixed inset-0 z-50 bg-black/60" />
    <DialogContent
      v-bind="forwarded"
      :class="cn('fixed z-50 flex flex-col border-border bg-background p-4 shadow-lg', sideClass, props.class)"
    >
      <slot />
      <DialogClose class="absolute right-3 top-3 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
        <X class="size-4" />
        <span class="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
