<script setup lang="ts">
/**
 * Minimal, dependency-free stacked/grouped bar chart. Renders plain SVG
 * so it inherits the app's CSS variables (--chart-1..5) and looks correct
 * in both themes without a charting library. Good enough for a daily
 * time-series with up to a few dozen points and a handful of series.
 *
 * Fully responsive: the container is measured with a ResizeObserver
 * (via VueUse) and the SVG viewBox is recomputed to fill the available
 * width, instead of a fixed pixel width with left-over empty space.
 */
import { useElementSize } from '@vueuse/core'
import ClientAvatar from '@/components/clients/ClientAvatar.vue'
import { niceTicks } from '@/lib/ticks'
import type { ClientRecord } from '@/lib/pocketbase-types'

const props = defineProps<{
  /** One point per day. `values` maps series key -> raw number. */
  points: { day: string, values: Record<string, number> }[]
  seriesKeys: string[]
  seriesLabels: Record<string, string>
  formatValue: (n: number) => string
  height?: number
  /**
   * Human unit the raw values are expressed in, for "nice" tick rounding
   * (see `niceTicks`). E.g. `3_600_000` (1 hour in ms) for a duration
   * metric so the y-axis rounds to clean hour steps; omit (defaults to
   * `1`) for a metric already in its natural unit, like currency.
   */
  tickUnit?: number
  /**
   * When stacked/grouped by client, maps each series key (a client id)
   * to its record so the legend and tooltip can show its avatar next to
   * the name. Omitted (or a key with no entry, e.g. `stackBy === 'none'`
   * where the only key is `'total'`) falls back to a plain color dot.
   */
  seriesClients?: Record<string, ClientRecord>
}>()

const height = computed(() => props.height ?? 220)
const colors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

const AXIS_WIDTH = 52
const BOTTOM_AXIS_HEIGHT = 24
// Reserves room above the plot so the topmost y-axis tick label doesn't
// get clipped by the SVG's top edge (it's vertically centered on the
// gridline, so it needs half its own height above y=0).
const TOP_PADDING = 14
const MIN_BAR_WIDTH = 3
const MAX_BAR_WIDTH = 40

const containerRef = ref<HTMLElement | null>(null)
const { width: containerWidth } = useElementSize(containerRef)

/** Falls back to a sane width before the ResizeObserver has fired once
 * (e.g. during SSR/first paint), so the chart never renders at 0 width. */
const chartWidth = computed(() => Math.max(containerWidth.value || 0, 320))
const plotWidth = computed(() => Math.max(chartWidth.value - AXIS_WIDTH, 40))
const plotHeight = computed(() => height.value - BOTTOM_AXIS_HEIGHT - TOP_PADDING)

const maxTotal = computed(() => {
  const totals = props.points.map(p => props.seriesKeys.reduce((acc, k) => acc + (p.values[k] ?? 0), 0))
  return Math.max(1, ...totals)
})

/** "Nice" rounded ticks (0, 5h, 10h, ... or clean $ steps) covering the
 * data's max, used both for the gridlines/labels and as the axis
 * ceiling — bars scale against this, not the raw max, so the tallest bar
 * never overshoots the topmost gridline. */
const axisTicks = computed(() => niceTicks(maxTotal.value, 5, props.tickUnit ?? 1))
const axisMax = computed(() => axisTicks.value[axisTicks.value.length - 1] || maxTotal.value)

const barWidth = computed(() => {
  const n = props.points.length || 1
  const slot = plotWidth.value / n
  return Math.max(MIN_BAR_WIDTH, Math.min(MAX_BAR_WIDTH, slot * 0.7))
})

function barX(i: number) {
  const n = props.points.length || 1
  const slot = plotWidth.value / n
  return AXIS_WIDTH + i * slot + (slot - barWidth.value) / 2
}

function segments(point: { values: Record<string, number> }) {
  let offset = 0
  return props.seriesKeys.map((key) => {
    const value = point.values[key] ?? 0
    const h = axisMax.value === 0 ? 0 : (value / axisMax.value) * plotHeight.value
    const y = TOP_PADDING + plotHeight.value - offset - h
    offset += h
    return { key, value, y, h, color: colorFor(key) }
  })
}

const yTicks = computed(() => axisTicks.value.map(tick => ({
  tick,
  y: TOP_PADDING + plotHeight.value * (1 - (axisMax.value === 0 ? 0 : tick / axisMax.value)),
  label: props.formatValue(tick),
})))

const hovered = ref<number | null>(null)
const hoveredPoint = computed(() => hovered.value === null ? null : (props.points[hovered.value] ?? null))

function colorFor(key: string) {
  return colors[props.seriesKeys.indexOf(key) % colors.length] ?? colors[0]!
}

function pointLabel(point: { day: string, values: Record<string, number> }) {
  return props.seriesKeys
    .map(key => `${props.seriesLabels[key] ?? key}: ${props.formatValue(point.values[key] ?? 0)}`)
    .join(', ')
}

function labelStep() {
  if (!props.points.length) return 1
  // Roughly one label per 70px of plot width, at least every point.
  const maxLabels = Math.max(2, Math.floor(plotWidth.value / 70))
  return Math.max(1, Math.ceil(props.points.length / maxLabels))
}
</script>

<template>
  <div ref="containerRef" data-testid="chart-container" class="w-full">
    <svg data-testid="chart-svg" :viewBox="`0 0 ${chartWidth} ${height}`" :width="chartWidth" :height="height" class="block w-full" preserveAspectRatio="xMinYMid meet">
      <!-- Gridlines + y-axis labels -->
      <g v-for="tick in yTicks" :key="tick.tick">
        <line
          :x1="AXIS_WIDTH"
          :x2="chartWidth"
          :y1="tick.y"
          :y2="tick.y"
          stroke="var(--border)"
          stroke-width="1"
        />
        <text
          :x="AXIS_WIDTH - 8"
          :y="tick.y"
          text-anchor="end"
          dominant-baseline="middle"
          class="fill-muted-foreground"
          font-size="10"
        >
          {{ tick.label }}
        </text>
      </g>

      <g
        v-for="(point, i) in points"
        :key="point.day"
        tabindex="0"
        role="img"
        :aria-label="`${point.day}: ${pointLabel(point)}`"
        class="cursor-pointer outline-none"
        @mouseenter="hovered = i"
        @mouseleave="hovered = null"
        @focus="hovered = i"
        @blur="hovered = null"
      >
        <rect
          v-if="hovered === i"
          :x="AXIS_WIDTH + (i * plotWidth) / (points.length || 1)"
          :y="TOP_PADDING"
          :width="plotWidth / (points.length || 1)"
          :height="plotHeight"
          class="fill-accent/40"
        />
        <rect
          v-for="seg in segments(point)"
          :key="seg.key"
          :x="barX(i)"
          :y="seg.y"
          :width="barWidth"
          :height="Math.max(seg.h, seg.value > 0 ? 1 : 0)"
          :fill="seg.color"
          rx="1"
          :opacity="hovered === null || hovered === i ? 1 : 0.35"
        />
      </g>

      <text
        v-for="(point, i) in points"
        v-show="i % labelStep() === 0"
        :key="`label-${point.day}`"
        :x="barX(i) + barWidth / 2"
        :y="height - 6"
        text-anchor="middle"
        class="fill-muted-foreground"
        font-size="10"
      >
        {{ point.day.slice(5) }}
      </text>
    </svg>

    <div v-if="hoveredPoint" class="mt-2 rounded-md border border-border bg-popover p-2 text-xs text-popover-foreground">
      <p class="mb-1 font-medium tabular-nums">
        {{ hoveredPoint.day }}
      </p>
      <div v-for="key in seriesKeys" :key="key" class="flex items-center justify-between gap-4">
        <span class="flex items-center gap-1.5 text-muted-foreground">
          <ClientAvatar v-if="seriesClients?.[key]" :client="seriesClients[key]!" size="xs" />
          <span v-else class="size-2 rounded-full" :style="{ background: colorFor(key) }" />
          {{ seriesLabels[key] }}
        </span>
        <span class="tabular-nums">{{ formatValue(hoveredPoint.values[key] ?? 0) }}</span>
      </div>
    </div>

    <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span v-for="key in seriesKeys" :key="key" class="flex items-center gap-1.5">
        <ClientAvatar v-if="seriesClients?.[key]" :client="seriesClients[key]!" size="xs" />
        <span v-else class="size-2 shrink-0 rounded-full" :style="{ background: colorFor(key) }" />
        <span class="truncate">{{ seriesLabels[key] }}</span>
      </span>
    </div>
  </div>
</template>
