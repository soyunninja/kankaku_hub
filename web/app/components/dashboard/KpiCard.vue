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
  /** Comparison label, e.g. "vs. previous period". Plain string (not a
   * slot) so it can double as the delta line's accessible name — on
   * narrow screens only the arrow + percentage show visually, but the
   * full text stays available to assistive tech via title/aria-label. */
  vsLabel?: string
}>(), {
  polarity: 'neutral',
})

const delta = computed(() => {
  if (props.previousValue === undefined || props.currentValue === undefined) return null
  return formatDelta(props.currentValue, props.previousValue)
})

/** Full accessible text for the delta line, always including the
 * comparison label even when it's visually hidden below `sm`. */
const deltaAccessibleText = computed(() => {
  if (!delta.value) return undefined
  return props.vsLabel ? `${delta.value} ${props.vsLabel}` : delta.value
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
  <Card class="min-w-0 gap-1.5 py-5">
    <CardHeader class="pb-0">
      <CardTitle class="line-clamp-2 text-sm leading-snug font-semibold" :title="title">
        {{ title }}
      </CardTitle>
    </CardHeader>
    <CardContent class="mt-auto min-w-0 pt-0">
      <p data-testid="kpi-value" class="truncate text-xl font-semibold tabular-nums sm:text-2xl" :title="value">
        {{ value }}
      </p>
      <p
        v-if="delta"
        data-testid="kpi-delta"
        class="mt-1 flex min-w-0 items-center gap-1 whitespace-nowrap text-xs tabular-nums"
        :class="toneClass"
        :title="deltaAccessibleText"
        :aria-label="deltaAccessibleText"
      >
        <component :is="arrowIcon" class="size-3 shrink-0" aria-hidden="true" />
        <span class="shrink-0">{{ delta }}</span>
        <span v-if="vsLabel" class="hidden truncate text-muted-foreground sm:inline" aria-hidden="true">
          {{ vsLabel }}
        </span>
      </p>
      <!-- Keeps the value at the same height as sibling cards that do show a delta. -->
      <p v-else class="mt-1 text-xs" aria-hidden="true">&nbsp;</p>
      <!-- Optional per-KPI notice (e.g. a measurement-quality caveat) — empty by
           default, so a card with nothing to say renders pixel-identical to before. -->
      <slot />
    </CardContent>
  </Card>
</template>
