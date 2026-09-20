<script setup lang="ts">
import { ArrowDown, ArrowUp, Minus } from '@lucide/vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MetricPolarity } from '@/lib/format'
import { deltaDirection, deltaTone, formatDelta } from '@/lib/format'

const props = withDefaults(defineProps<{
  title: string
  value: string
  previousValue?: number
  currentValue?: number
  /** Whether a rise/drop in this KPI is good, bad, or neither. Defaults
   * to neutral (volume metrics: work time, tasks, tokens...). */
  polarity?: MetricPolarity
}>(), {
  polarity: 'neutral',
})

const delta = computed(() => {
  if (props.previousValue === undefined || props.currentValue === undefined) return null
  return formatDelta(props.currentValue, props.previousValue)
})

const direction = computed(() => {
  if (props.previousValue === undefined || props.currentValue === undefined) return 'flat'
  return deltaDirection(props.currentValue, props.previousValue)
})

const tone = computed(() => {
  if (!delta.value || delta.value === 'n/a' || delta.value === '0%') return 'neutral'
  if (props.previousValue === undefined || props.currentValue === undefined) return 'neutral'
  return deltaTone(props.currentValue, props.previousValue, props.polarity)
})

const toneClass = computed(() => ({
  positive: 'text-success',
  negative: 'text-destructive',
  neutral: 'text-muted-foreground',
}[tone.value]))

const arrowIcon = computed(() => direction.value === 'up' ? ArrowUp : direction.value === 'down' ? ArrowDown : Minus)
</script>

<template>
  <Card class="min-w-0">
    <CardHeader class="pb-1">
      <CardTitle class="truncate" :title="title">
        {{ title }}
      </CardTitle>
    </CardHeader>
    <CardContent class="min-w-0 pt-0">
      <p data-testid="kpi-value" class="truncate text-xl font-semibold tabular-nums sm:text-2xl" :title="value">
        {{ value }}
      </p>
      <p v-if="delta" class="mt-1 flex min-w-0 items-center gap-1 whitespace-nowrap text-xs tabular-nums" :class="toneClass">
        <component :is="arrowIcon" class="size-3 shrink-0" aria-hidden="true" />
        <span class="shrink-0">{{ delta }}</span>
        <span class="truncate text-muted-foreground">
          <slot name="vsLabel" />
        </span>
      </p>
    </CardContent>
  </Card>
</template>
