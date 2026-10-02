<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import SessionMarker from '@/components/entries/SessionMarker.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { TaskEntryRecord } from '@/lib/pocketbase-types'
import { formatCompactEntryDateTime } from '@/lib/entries-compact-date'

// All values and request state belong to the page. This renderer never reads APIs.
defineProps<{
  rows: {
    key: string
    title: string
    date: string
    context: string
    uncertainty?: string
    work: string
    cost: string
    sessionId: string
    sessionName?: string
    entry?: TaskEntryRecord
    count?: number
    expanded?: boolean
    loading?: boolean
    error?: boolean
    children?: TaskEntryRecord[]
  }[]
  loading: boolean
  grouped: boolean
  sort: string
  clientName: (id: string) => string
  projectName: (id: string) => string
  taskName: (id: string) => string
  agentLabel: (id: string) => string
  bulkEnabled: boolean
  bulkBusy: boolean
  selectedIds: Set<string>
  sessionFilter?: string
}>()
const emit = defineEmits<{
  expand: [key: string]
  retry: [key: string]
  detail: [entry: TaskEntryRecord, event: MouseEvent]
  session: [id: string]
  sort: [field: string]
  select: [id: string]
}>()
const { t } = useI18n()
const { formatCost, formatDuration } = useFormatters()
const headers = computed(() => [
  { field: 'started_at', label: t('common.started') },
  { field: 'work_ms', label: t('entries.mobileLedger.work') },
  { field: 'cost', label: t('entries.mobileLedger.tokenCost') },
])
function qualityNote(entry: TaskEntryRecord) {
  return [
    entry.waiting_quality === 'unavailable' ? t('entries.qualityFilter.waitingUnavailable') : '',
    entry.cost_quality === 'unknown' ? t('entries.qualityFilter.costUnknown') : '',
    entry.cost_quality === 'estimated' ? t('entries.detail.quality.costEstimated') : '',
  ].filter(Boolean).join(' · ')
}
function detailLabel(entry: TaskEntryRecord) {
  return t('entries.detail.viewEntry', { context: `${entry.session_name || entry.id} · ${formatCompactEntryDateTime(entry.started_at)}` })
}
</script>

<template>
  <div data-testid="entries-mobile-ledger" class="mobile-ledger" role="table" :aria-label="t('entries.title')">
    <div class="ledger-row ledger-header" role="row">
      <div v-for="(header, index) in headers" :key="header.field" role="columnheader" :aria-sort="grouped ? undefined : sort === header.field ? 'ascending' : sort === `-${header.field}` ? 'descending' : 'none'">
        <span v-if="grouped">{{ index === 0 ? t('entries.session') : header.label }}</span>
        <Button v-else variant="ghost" class="min-h-11 h-auto w-full whitespace-normal px-0 text-sm" @click="emit('sort', header.field)">
          {{ header.label }}
          <ChevronDown v-if="sort.replace('-', '') === header.field" class="size-3 shrink-0" :class="{ 'rotate-180': sort === header.field }" aria-hidden="true" />
        </Button>
      </div>
    </div>
    <div v-if="loading" role="status" class="space-y-4 p-3">
      <Skeleton v-for="i in 6" :key="i" class="h-12 w-full" />
    </div>
    <template v-else>
      <div v-for="row in rows" :key="row.key" class="ledger-record" :data-testid="grouped ? 'session-group-row' : 'mobile-entry-row'">
        <div class="ledger-row" role="row">
          <div class="identity" role="cell">
            <p class="line-clamp-2 text-base font-medium" :title="row.title">{{ row.title }}</p>
            <p class="mt-1 text-sm text-muted-foreground">{{ row.date }}<br>{{ row.context }}</p>
            <p v-if="row.uncertainty || (row.entry && qualityNote(row.entry))" class="mt-1 text-sm text-muted-foreground">{{ row.uncertainty || (row.entry && qualityNote(row.entry)) }}</p>
            <Button v-if="row.entry" data-entry-detail variant="link" class="min-h-11 h-auto max-w-full whitespace-normal px-0 text-sm" :aria-label="detailLabel(row.entry)" @click="emit('detail', row.entry, $event)">{{ t('entries.mobileLedger.detail') }}</Button>
            <Button v-else variant="link" class="min-h-11 h-auto max-w-full whitespace-normal px-0 text-sm" :aria-label="`${t('entries.sessionGroup.entriesToggle')} · ${row.title}`" :aria-expanded="row.expanded" :aria-controls="`mobile-session-entries-${row.key}`" @click="emit('expand', row.key)">
              {{ t(row.count === 1 ? 'entries.mobileLedger.entryCountOne' : 'entries.mobileLedger.entryCountMany', { count: row.count }) }}
              <ChevronDown class="size-4 shrink-0" :class="{ 'rotate-180': row.expanded }" aria-hidden="true" />
            </Button>
          </div>
          <div class="metric" role="cell" data-testid="mobile-work">{{ row.work }}</div>
          <div class="metric" role="cell" data-testid="mobile-cost">{{ row.cost }}</div>
        </div>
        <div v-if="row.entry" class="context-fields">
          <SessionMarker :session-id="row.sessionId" :session-name="row.sessionName" @click="emit('session', row.sessionId)" />
          <p>{{ taskName(row.entry.task) || '—' }} · {{ agentLabel(row.entry.agent ?? '') || '—' }} · {{ t(`entries.status.${row.entry.status}`) }}</p>
          <input v-if="bulkEnabled && row.entry.session_id === sessionFilter" type="checkbox" class="size-11" :checked="selectedIds.has(row.entry.id)" :disabled="bulkBusy" :aria-label="t('entries.bulk.selectEntry')" @change="emit('select', row.entry.id)">
        </div>
        <div v-else-if="row.expanded" :id="`mobile-session-entries-${row.key}`" data-testid="session-group-entries" class="bg-muted/30">
          <div class="context-fields">
            <SessionMarker :session-id="row.sessionId" :session-name="row.sessionName" :label="row.title" @click="emit('session', row.sessionId)" />
            <slot name="context" :session-id="row.sessionId" />
          </div>
          <p v-if="row.loading" role="status" class="p-3 text-sm">{{ t('entries.sessionGroup.loadingEntries') }}</p>
          <div v-else-if="row.error" role="alert" class="p-3 text-sm text-destructive">
            {{ t('entries.sessionGroup.loadError') }}
            <Button variant="outline" class="min-h-11" @click="emit('retry', row.key)">{{ t('entries.sessionGroup.retry') }}</Button>
          </div>
          <p v-else-if="!row.children?.length" class="p-3 text-sm">{{ t('entries.empty') }}</p>
          <div v-for="entry in row.children ?? []" :key="entry.id" class="ledger-row border-t border-border">
            <div class="identity">
              <Button data-entry-detail variant="link" class="min-h-11 h-auto w-full justify-start whitespace-normal px-0 text-left text-sm" :aria-label="detailLabel(entry)" @click="emit('detail', entry, $event)">{{ formatCompactEntryDateTime(entry.started_at) }}</Button>
              <p class="text-sm text-muted-foreground">{{ clientName(entry.client) || '—' }} · {{ projectName(entry.project) }}<br>{{ taskName(entry.task) || '—' }} · {{ agentLabel(entry.agent ?? '') || '—' }} · {{ t(`entries.status.${entry.status}`) }}</p>
              <p v-if="qualityNote(entry)" class="mt-1 text-sm text-muted-foreground">{{ qualityNote(entry) }}</p>
              <input v-if="bulkEnabled && entry.session_id === sessionFilter" type="checkbox" class="size-11" :checked="selectedIds.has(entry.id)" :disabled="bulkBusy" :aria-label="t('entries.bulk.selectEntry')" @change="emit('select', entry.id)">
            </div>
            <div class="metric">{{ formatDuration(entry.work_ms) }}</div>
            <div class="metric">{{ formatCost(entry.cost) }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ledger-row { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, .9fr) minmax(0, 1fr); gap: .5rem; padding: .75rem .5rem; }
.ledger-header { align-items: center; color: var(--muted-foreground); font-size: .875rem; }
.ledger-header > div { min-width: 0; overflow-wrap: anywhere; }
.ledger-header > :not(:first-child) { text-align: right; }
.ledger-record { border-top: 1px solid var(--border); }
.identity, .context-fields { min-width: 0; overflow-wrap: anywhere; }
.metric { min-width: 0; text-align: right; font-size: 1rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.context-fields { padding: 0 .5rem .75rem; font-size: .875rem; color: var(--muted-foreground); }
.context-fields :deep(button) { min-height: 44px; min-width: 44px; max-width: 100%; }
.context-fields :deep(button span:last-child) { white-space: normal; overflow-wrap: anywhere; }
</style>
