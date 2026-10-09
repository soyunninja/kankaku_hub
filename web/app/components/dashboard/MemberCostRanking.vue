<script setup lang="ts">
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { MemberCostRow } from '@/lib/dashboard-member-ranking'

const props = defineProps<{
  rows: MemberCostRow[]
  state: 'loading' | 'ready' | 'error' | 'unavailable'
}>()
const { t } = useI18n()
const { formatCost } = useFormatters()

function href(id: string) {
  return id ? `/team/${encodeURIComponent(id)}` : undefined
}
function costText(row: MemberCostRow) {
  return row.costState === 'unknown' ? '—' : formatCost(row.costKnownSum)
}
function qualityText(row: MemberCostRow) {
  if (row.costState === 'estimated') return t('dashboard.memberRanking.estimated')
  if (row.costState === 'incomplete') return t('dashboard.memberRanking.incomplete')
  if (row.costState === 'unknown') return t('dashboard.memberRanking.unknown')
  return ''
}
</script>

<template>
  <div>
    <p v-if="props.state === 'loading'" role="status" class="text-sm text-muted-foreground">{{ t('dashboard.memberRanking.loading') }}</p>
    <p v-else-if="props.state === 'error'" role="alert" class="text-sm text-muted-foreground">{{ t('dashboard.memberRanking.error') }}</p>
    <p v-else-if="props.state === 'unavailable'" role="status" class="text-sm text-muted-foreground">{{ t('dashboard.memberRanking.unavailable') }}</p>
    <template v-else>
      <p v-if="!props.rows.length" class="py-6 text-center text-sm text-muted-foreground">{{ t('dashboard.memberRanking.empty') }}</p>
      <Table v-else>
        <TableHeader><TableRow>
          <TableHead>{{ t('dashboard.memberRanking.member') }}</TableHead>
          <TableHead class="text-right">{{ t('common.cost') }}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          <TableRow v-for="row in props.rows" :key="row.id || 'unattributed'">
            <TableCell class="font-medium">
              <NuxtLink v-if="row.resolved" :to="href(row.id)!" class="hover:underline">{{ row.label }}</NuxtLink>
              <span v-else-if="row.id">{{ t('dashboard.memberRanking.unresolved', { id: row.id }) }}</span>
              <span v-else>{{ t('dashboard.memberRanking.unattributed') }}</span>
            </TableCell>
            <TableCell class="text-right tabular-nums">
              {{ costText(row) }}
              <span v-if="qualityText(row)" class="block text-xs text-muted-foreground">{{ qualityText(row) }}</span>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </template>
  </div>
</template>
