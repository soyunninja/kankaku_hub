<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
  label: string
  src?: string
  resetKey?: string
}>()

const imageFailed = ref(false)
watch([() => props.src, () => props.resetKey], () => {
  imageFailed.value = false
})
const showImage = computed(() => !!props.src && !imageFailed.value)

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?'
}
</script>

<template>
  <div :class="cn('flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-semibold text-primary-foreground', props.class)">
    <img v-if="showImage" :src="src" alt="" class="size-full object-cover" @error="imageFailed = true">
    <template v-else>{{ initials(label) }}</template>
  </div>
</template>
