<script setup lang="ts">
/**
 * Minimal, dependency-free stacked/grouped bar chart. Renders plain SVG
 * so it inherits the app's CSS variables (--chart-1..5) and looks correct
 * in both themes without a charting library. Good enough for a daily
 * time-series with up to a few dozen points and a handful of series.
 */
const props = defineProps<{
  /** One point per day. `values` maps series key -> raw number. */
  points: { day: string, values: Record<string, number> }[]
  seriesKeys: string[]
  seriesLabels: Record<string, string>
  formatValue: (n: number) => string
  height?: number
}>()

const height = computed(() => props.height ?? 220)
const colors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

const maxTotal = computed(() => {
  const totals = props.points.map(p => props.seriesKeys.reduce((acc, k) => acc + (p.values[k] ?? 0), 0))
  return Math.max(1, ...totals)
})

const barWidth = computed(() => {
  const n = props.points.length || 1
  return Math.max(4, Math.min(28, Math.floor(600 / n) - 4))
})

function barX(i: number) {
  const n = props.points.length || 1
  const totalWidth = n * (barWidth.value + 4)
  const chartWidth = Math.max(totalWidth, 600)
  return (i / n) * chartWidth
}

const chartWidth = computed(() => Math.max(props.points.length * (barWidth.value + 4), 600))

function segments(point: { values: Record<string, number> }) {
  let offset = 0
  return props.seriesKeys.map((key) => {
    const value = point.values[key] ?? 0
    const h = maxTotal.value === 0 ? 0 : (value / maxTotal.value) * (height.value - 24)
    const y = height.value - 24 - offset - h
    offset += h
    return { key, value, y, h, color: colorFor(key) }
  })
}

const hovered = ref<number | null>(null)
const hoveredPoint = computed(() => hovered.value === null ? null : (props.points[hovered.value] ?? null))

function colorFor(key: string) {
  return colors[props.seriesKeys.indexOf(key) % colors.length] ?? colors[0]!
}
</script>

<template>
  <div class="w-full overflow-x-auto">
    <svg :width="chartWidth" :height="height" class="block min-w-full">
      <line
        v-for="frac in [0, 0.25, 0.5, 0.75, 1]"
        :key="frac"
        x1="0"
        :x2="chartWidth"
        :y1="(height - 24) * (1 - frac)"
        :y2="(height - 24) * (1 - frac)"
        stroke="var(--border)"
        stroke-width="1"
      />

      <g v-for="(point, i) in points" :key="point.day" @mouseenter="hovered = i" @mouseleave="hovered = null">
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
        <rect
          :x="barX(i) - 2"
          y="0"
          :width="barWidth + 4"
          :height="height - 24"
          fill="transparent"
        />
      </g>

      <text
        v-for="(point, i) in points"
        v-show="points.length <= 14 || i % Math.ceil(points.length / 14) === 0"
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
          <span class="size-2 rounded-full" :style="{ background: colorFor(key) }" />
          {{ seriesLabels[key] }}
        </span>
        <span class="tabular-nums">{{ formatValue(hoveredPoint.values[key] ?? 0) }}</span>
      </div>
    </div>

    <div class="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span v-for="key in seriesKeys" :key="key" class="flex items-center gap-1.5">
        <span class="size-2 rounded-full" :style="{ background: colorFor(key) }" />
        {{ seriesLabels[key] }}
      </span>
    </div>
  </div>
</template>
