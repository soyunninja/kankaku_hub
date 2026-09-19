<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { type ButtonVariants, buttonVariants } from '.'

const props = withDefaults(defineProps<{
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  as?: string
  class?: HTMLAttributes['class']
}>(), {
  as: 'button',
  variant: 'default',
  size: 'default',
  class: undefined,
})
</script>

<template>
  <component :is="as" :class="cn(buttonVariants({ variant, size }), props.class)">
    <slot />
  </component>
</template>
