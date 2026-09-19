<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDelta } from '@/lib/format'

const props = defineProps<{
  title: string
  value: string
  previousValue?: number
  currentValue?: number
}>()

const delta = computed(() => {
  if (props.previousValue === undefined || props.currentValue === undefined) return null
  return formatDelta(props.currentValue, props.previousValue)
})

const deltaTone = computed(() => {
  if (!delta.value || delta.value === 'n/a' || delta.value === '0%') return 'text-muted-foreground'
  return delta.value.startsWith('+') ? 'text-success' : 'text-destructive'
})
</script>

<template>
  <Card>
    <CardHeader class="pb-1">
      <CardTitle>{{ title }}</CardTitle>
    </CardHeader>
    <CardContent class="pt-0">
      <p class="text-2xl font-semibold tabular-nums">
        {{ value }}
      </p>
      <p v-if="delta" class="mt-1 text-xs tabular-nums" :class="deltaTone">
        {{ delta }}
        <span class="text-muted-foreground">
          <slot name="vsLabel" />
        </span>
      </p>
    </CardContent>
  </Card>
</template>
