<script setup lang="ts">
import ClientName from '@/components/clients/ClientName.vue'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { GroupTotals } from '@/lib/aggregate'
import type { ClientRecord } from '@/lib/pocketbase-types'

const { t } = useI18n()
const { formatCost, formatDuration, formatPercent } = useFormatters()

defineProps<{
  rows: (GroupTotals & { label: string })[]
  nameHeader: string
  maxRows?: number
  resolveHref?: (id: string) => string | undefined
  /** When these rows are grouped by client, resolves a row's `key` (a
   * client id) to its record so the name can render with an avatar.
   * Omit for rows grouped by anything else (e.g. project). */
  resolveClient?: (id: string) => ClientRecord | undefined
}>()

type SortKey = 'cost' | 'workMs' | 'count'
const sortKey = ref<SortKey>('cost')
const sortDir = ref<'asc' | 'desc'>('desc')

function toggleSort(key: SortKey) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  else { sortKey.value = key; sortDir.value = 'desc' }
}

function sorted(rows: (GroupTotals & { label: string })[]) {
  const copy = [...rows]
  copy.sort((a, b) => (a[sortKey.value] - b[sortKey.value]) * (sortDir.value === 'asc' ? 1 : -1))
  return copy
}
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>{{ nameHeader }}</TableHead>
        <TableHead class="cursor-pointer text-right" @click="toggleSort('workMs')">
          <span :title="t('common.timeHint')">{{ t('common.time') }}</span>
        </TableHead>
        <TableHead class="cursor-pointer text-right" @click="toggleSort('cost')">
          {{ t('common.cost') }}
        </TableHead>
        <TableHead class="text-right">
          {{ t('dashboard.share') }}
        </TableHead>
        <TableHead class="cursor-pointer text-right" @click="toggleSort('count')">
          {{ t('common.count') }}
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="row in sorted(rows).slice(0, maxRows)" :key="row.key">
        <TableCell class="font-medium">
          <NuxtLink v-if="resolveHref?.(row.key)" :to="resolveHref(row.key)" class="hover:underline">
            <ClientName v-if="resolveClient?.(row.key)" :client="resolveClient(row.key)!" size="xs">{{ row.label }}</ClientName>
            <span v-else>{{ row.label }}</span>
          </NuxtLink>
          <ClientName v-else-if="resolveClient?.(row.key)" :client="resolveClient(row.key)!" size="xs">{{ row.label }}</ClientName>
          <span v-else>{{ row.label }}</span>
        </TableCell>
        <TableCell class="text-right tabular-nums">
          {{ formatDuration(row.workMs) }}
        </TableCell>
        <TableCell class="text-right tabular-nums">
          {{ formatCost(row.cost) }}
        </TableCell>
        <TableCell class="text-right tabular-nums text-muted-foreground">
          {{ formatPercent(row.costShare) }}
        </TableCell>
        <TableCell class="text-right tabular-nums text-muted-foreground">
          {{ row.count }}
        </TableCell>
      </TableRow>
      <TableRow v-if="rows.length === 0">
        <TableCell colspan="5" class="text-center text-muted-foreground">
          —
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
