<script setup lang="ts">
import RowActions, { type RowAction } from '@/components/common/RowActions.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowRight } from '@lucide/vue'
import type { MachineRecord, TeamMemberRecord } from '@/lib/pocketbase-types'
import { formatCost, formatDuration } from '@/lib/format'
import type { TeamMemberTotal } from '@/lib/team-member-totals'

withDefaults(defineProps<{
  member: TeamMemberRecord
  department: string
  machines: MachineRecord[]
  actions: RowAction[]
  totals?: TeamMemberTotal
  totalsState: 'loading' | 'ready' | 'error' | 'unavailable'
  layout: 'grid' | 'list'
}>(), { layout: 'grid' })

const emit = defineEmits<{ 'edit-machine': [id: string] }>()
const { t, locale } = useI18n()
function number(value: number) {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value)
}
</script>

<template>
  <article :class="layout === 'grid' ? 'flex min-w-0 flex-col gap-3 rounded-3xl bg-card p-2 sm:gap-5 sm:p-5' : 'rounded-2xl border bg-card p-4'">
    <div :class="layout === 'grid' ? 'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:gap-3' : 'flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'">
      <div :class="layout === 'grid' ? 'col-start-1 row-start-1 min-w-0' : 'min-w-0 space-y-2'">
        <h2 :class="layout === 'grid' ? 'flex items-start gap-1 text-sm font-semibold sm:text-base' : 'font-semibold'">
          <NuxtLink v-if="layout === 'list'" :to="`/team/${member.id}`" class="block truncate hover:underline" :title="member.name">{{ member.name }}</NuxtLink>
          <span v-else class="min-w-0 [overflow-wrap:anywhere]">{{ member.name }}</span>
        </h2>
        <p :class="layout === 'grid' ? 'mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]' : 'text-sm text-muted-foreground'">{{ department }}</p>
      </div>
      <RowActions v-if="actions.length" :actions="actions" :class="layout === 'grid' ? 'col-start-2 row-start-1 flex-wrap' : ''" />
    </div>
    <div v-if="layout === 'list'" class="flex flex-wrap items-center gap-2">
      <Badge :variant="member.active ? 'success' : 'outline'">{{ t(member.active ? 'common.active' : 'common.inactive') }}</Badge>
      <div v-if="machines.length" class="flex flex-wrap gap-1">
        <Button
          v-for="machine in machines"
          :key="machine.id"
          size="sm"
          variant="outline"
          class="h-7 rounded-full px-2 text-xs"
          @click="emit('edit-machine', machine.id)"
        >{{ machine.name || machine.key }}</Button>
      </div>
      <span v-else class="text-sm text-muted-foreground">{{ t('team.noMachines') }}</span>
    </div>
    <dl :class="layout === 'grid' ? 'grid min-w-0 grid-cols-1 gap-3 text-sm [overflow-wrap:anywhere] sm:grid-cols-2 lg:grid-cols-3' : 'grid grid-cols-3 gap-2 border-t pt-3 text-xs'">
      <div class="min-w-0">
        <dt :class="layout === 'grid' ? 'text-xs text-muted-foreground' : 'text-muted-foreground'">{{ t('team.activeProjects') }}</dt>
        <dd :class="layout === 'grid' ? 'mt-1 font-medium tabular-nums' : 'font-medium tabular-nums'">{{ totals ? number(totals.activeProjects) : totalsState === 'ready' ? '0' : '—' }}</dd>
      </div>
      <div class="min-w-0">
        <dt :class="layout === 'grid' ? 'text-xs text-muted-foreground' : 'text-muted-foreground'">{{ t('team.memberTotalMinutes') }}</dt>
        <dd :class="layout === 'grid' ? 'mt-1 font-medium tabular-nums' : 'font-medium tabular-nums'">{{ totals ? formatDuration(totals.workMs, locale) : totalsState === 'ready' ? formatDuration(0, locale) : '—' }}</dd>
      </div>
      <div class="min-w-0">
        <dt :class="layout === 'grid' ? 'text-xs text-muted-foreground' : 'text-muted-foreground'">{{ t('team.memberTotalCost') }}</dt>
        <dd :class="layout === 'grid' ? 'mt-1 font-medium tabular-nums' : 'font-medium tabular-nums'">{{ totals ? formatCost(totals.cost) : totalsState === 'ready' ? formatCost(0) : '—' }}</dd>
      </div>
    </dl>
    <div v-if="layout === 'grid'" class="mt-auto flex flex-wrap items-center justify-between gap-1">
      <div class="min-w-0 flex flex-wrap items-center gap-1 [overflow-wrap:anywhere]">
        <template v-if="machines.length">
          <span v-for="machine in machines" :key="machine.id" class="text-xs">{{ machine.name || machine.key }}</span>
        </template>
        <span v-else class="text-sm text-muted-foreground">{{ t('team.noMachines') }}</span>
      </div>
      <NuxtLink :to="`/team/${member.id}`" :aria-label="t('team.openDetail', { name: member.name })" class="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowRight aria-hidden="true" class="size-5" />
      </NuxtLink>
    </div>
  </article>
</template>
