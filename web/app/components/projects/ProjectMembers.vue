<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'
import { formatCost, formatDuration } from '@/lib/format'
import { TotalsRouteUnavailableError } from '@/composables/useTotals'
import { loadProjectMemberTotals, type ProjectMemberTotal } from '@/lib/project-member-totals'
import type { TeamMemberRecord } from '@/lib/pocketbase-types'

const props = defineProps<{ clientId: string, projectId: string }>()
const { t, locale } = useI18n()
const { isOwner } = useAuth()
const { departments, members, refresh } = useTeamCatalog()
const { fetchTotals } = useTotals()
const totals = ref<{ members: Record<string, ProjectMemberTotal>, unattributed: ProjectMemberTotal | null }>({ members: Object.create(null), unattributed: null })
const state = ref<'loading' | 'ready' | 'error' | 'unavailable'>('loading')
const costQualityWarning = computed(() => rows.value.some(({ total }) => total.costUnknownEntries > 0 || total.costEstimatedEntries > 0)
  || Boolean(totals.value.unattributed && (totals.value.unattributed.costUnknownEntries > 0 || totals.value.unattributed.costEstimatedEntries > 0)))
const rows = computed(() => Object.entries(totals.value.members).map(([id, total]) => ({
  member: members.value.find((item: TeamMemberRecord) => item.id === id), total,
})).sort((a, b) => (a.member?.name ?? '').localeCompare(b.member?.name ?? '', locale.value)))
let requestVersion = 0
async function load() {
  const version = ++requestVersion
  const client = props.clientId
  const project = props.projectId
  const owner = isOwner.value
  const current = () => version === requestVersion && client === props.clientId && project === props.projectId && owner === isOwner.value
  totals.value = { members: Object.create(null), unattributed: null }
  state.value = 'loading'
  if (!owner || !client || !project) { state.value = 'error'; return }
  try {
    await refresh()
    if (!current()) return
    const result = await loadProjectMemberTotals(fetchTotals, { client, project })
    if (!current()) return
    totals.value = result
    state.value = 'ready'
  }
  catch (error) {
    if (!current()) return
    state.value = error instanceof TotalsRouteUnavailableError ? 'unavailable' : 'error'
  }
}
onMounted(load)
watch(() => [props.clientId, props.projectId, isOwner.value], load, { flush: 'sync' })
onBeforeUnmount(() => { requestVersion++ })
function duration(total: ProjectMemberTotal) { return formatDuration(total.workMs, locale.value) }
function cost(total: ProjectMemberTotal) { return total.costUnknownEntries > 0 && total.costUnknownEntries === total.entries ? '—' : formatCost(total.cost) }
function historyPath(id: string) { return `/team/member-projects/${encodeURIComponent(id)}/${encodeURIComponent(props.projectId)}` }
</script>

<template>
  <section v-if="isOwner" class="space-y-4 pt-4" aria-labelledby="project-members-title">
    <div class="space-y-1">
      <h2 id="project-members-title" class="text-sm font-bold">{{ t('projects.detail.membersTitle') }}</h2>
    </div>
    <p v-if="state === 'loading'" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="state === 'unavailable'" role="alert">{{ t('projects.detail.membersUnavailable') }}</p>
    <p v-else-if="state === 'error'" role="alert">{{ t('projects.detail.membersFailed') }}</p>
    <template v-else>
      <p v-if="costQualityWarning" role="status" class="text-sm text-muted-foreground">{{ t('projects.detail.membersCostQuality') }}</p>
      <div v-if="rows.length || totals.unattributed" class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 lg:gap-6">
        <article v-for="({ member, total }, index) in rows" :key="member?.id ?? `unresolved-${index}`" data-testid="project-member-card" class="flex min-w-0 flex-col gap-3 rounded-3xl bg-card p-2 sm:gap-5 sm:p-5">
          <div class="min-w-0">
            <h3 class="text-sm font-semibold [overflow-wrap:anywhere] sm:text-base">{{ member?.name || t('projects.detail.membersUnknownIdentity') }}</h3>
            <p class="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">{{ member ? departments.find(department => department.id === member.department)?.name || t('projects.detail.membersNoDepartment') : t('projects.detail.membersUnresolved') }}</p>
          </div>
          <dl class="grid min-w-0 grid-cols-1 gap-3 text-sm [overflow-wrap:anywhere] sm:grid-cols-2 lg:grid-cols-2">
            <div><dt class="text-xs text-muted-foreground">{{ t('common.time') }}</dt><dd class="mt-1 font-medium tabular-nums">{{ duration(total) }}</dd></div>
            <div><dt class="text-xs text-muted-foreground">{{ t('common.cost') }}</dt><dd class="mt-1 font-medium tabular-nums">{{ cost(total) }}</dd></div>
          </dl>
          <div class="mt-auto flex flex-wrap items-center justify-between gap-1">
            <span v-if="member && !member.active" class="text-xs text-muted-foreground">{{ t('common.inactive') }}</span>
            <span v-else />
            <NuxtLink v-if="member" :to="historyPath(member.id)" :aria-label="t('projects.detail.openMemberHistory', { name: member.name })" class="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ArrowRight aria-hidden="true" class="size-5" />
            </NuxtLink>
          </div>
        </article>
        <article v-if="totals.unattributed" data-testid="project-member-unattributed" class="flex min-w-0 flex-col gap-3 rounded-3xl bg-card p-2 sm:gap-5 sm:p-5">
          <div class="min-w-0"><h3 class="text-sm font-semibold [overflow-wrap:anywhere] sm:text-base">{{ t('projects.detail.membersUnattributed') }}</h3><p class="mt-1 text-sm text-muted-foreground">{{ t('projects.detail.membersUnresolved') }}</p></div>
          <dl class="grid min-w-0 grid-cols-1 gap-3 text-sm [overflow-wrap:anywhere] sm:grid-cols-2 lg:grid-cols-2">
            <div><dt class="text-xs text-muted-foreground">{{ t('common.time') }}</dt><dd class="mt-1 font-medium tabular-nums">{{ duration(totals.unattributed) }}</dd></div>
            <div><dt class="text-xs text-muted-foreground">{{ t('common.cost') }}</dt><dd class="mt-1 font-medium tabular-nums">{{ cost(totals.unattributed) }}</dd></div>
          </dl>
        </article>
      </div>
      <p v-else class="text-sm text-muted-foreground">{{ t('projects.detail.membersEmpty') }}</p>
    </template>
  </section>
</template>
