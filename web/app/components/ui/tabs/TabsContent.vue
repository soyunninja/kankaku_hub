<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { TabsContent } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'], value: string }>()
</script>

<template>
  <TabsContent :value="value" :class="cn('mt-3 focus-visible:outline-none', props.class)">
    <slot />
  </TabsContent>
</template>
