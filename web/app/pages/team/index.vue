<script setup lang="ts">
import { Search, List, LayoutGrid, Plus, Pencil, ArrowRight } from '@lucide/vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonRows from '@/components/common/SkeletonRows.vue'
import { Card, CardContent } from '@/components/ui/card'
import TeamMemberCard from '@/components/team/TeamMemberCard.vue'
import DepartmentEditDialog from '@/components/team/DepartmentEditDialog.vue'
import RowActions, { type RowAction } from '@/components/common/RowActions.vue'
import type { DepartmentRecord } from '@/lib/pocketbase-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { BackfillPreview, BackfillResult } from '@/composables/useTeamCatalog'
import { useDepartmentEditor } from '@/composables/useDepartmentEditor'
import { mapPocketBaseFieldErrors } from '@/lib/client-contact'
import { TotalsRouteUnavailableError, useTotals } from '@/composables/useTotals'
import { loadTeamMemberTotals, type TeamMemberTotal } from '@/lib/team-member-totals'
import { departmentCostShare, sumDepartmentMemberTotals, sumTeamMemberCost } from '@/lib/team-department-totals'
import { formatCost, formatDuration } from '@/lib/format'

const { t, locale } = useI18n()
const { isOwner } = useAuth()
useHead({ title: computed(() => t('nav.team')) })
const { departments, members, machines, eligibleMachines, loading, refresh, save, setActive, createMemberWithMachine, previewBackfill, applyBackfill } = useTeamCatalog()
const departmentEditor = useDepartmentEditor({ save, setActive }, t)
const { fetchTotals } = useTotals()
const memberTotals = ref<Record<string, TeamMemberTotal> | null>(null)
const memberTotalsState = ref<'loading' | 'ready' | 'error' | 'unavailable'>('loading')
const search = ref('')
const view = ref<'grid' | 'list'>('grid')
const memberDialog = ref(false)
const memberForm = reactive({ name: '', department: '', machineId: '' })
const memberSuccess = ref(false)
const memberRefreshWarning = ref(false)
const machineDialog = ref(false)
const machineForm = reactive({ key: '', name: '' })
const filteredMembers = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return members.value.filter(member => [member.name, departments.value.find(row => row.id === member.department)?.name || '', machines.value.filter(row => row.member === member.id).map(row => row.name || row.key).join(' ')].some(value => value.toLocaleLowerCase().includes(query)))
})
const departmentMemberTotals = computed(() => memberTotalsState.value === 'ready' && memberTotals.value
  ? sumDepartmentMemberTotals(departments.value, members.value, memberTotals.value)
  : null)
const teamMemberCost = computed(() => memberTotalsState.value === 'ready' && memberTotals.value
  ? sumTeamMemberCost(members.value, memberTotals.value)
  : null)
const busy = ref(false)
const error = ref('')
const backfillPreview = ref<BackfillPreview | null>(null)
const backfillResult = ref<BackfillResult | null>(null)
const backfillError = ref('')

function departmentActions(department: DepartmentRecord): RowAction[] {
  return [{ icon: Pencil, label: t('common.edit'), onClick: () => departmentEditor.openEdit(department) }]
}

function departmentCostShareFor(department: DepartmentRecord) {
  const cost = departmentMemberTotals.value?.[department.id]?.cost
  if (cost === undefined || teamMemberCost.value === null) return { state: 'unavailable' as const, percentage: null }
  return departmentCostShare(cost, teamMemberCost.value)
}

function departmentCostShareLabel(department: DepartmentRecord) {
  const share = departmentCostShareFor(department)
  const cost = departmentMemberTotals.value?.[department.id]?.cost
  if (share.state === 'unavailable' || cost === undefined || teamMemberCost.value === null) {
    return t('team.departmentCostShareUnavailable', { department: department.name })
  }
  const values = { department: department.name, departmentCost: formatCost(cost), teamCost: formatCost(teamMemberCost.value) }
  if (share.state === 'zero') return t('team.departmentCostShareZero', values)
  return t('team.departmentCostShare', { ...values, percent: String(share.percentage) })
}

function openMemberCreate() {
  memberForm.name = ''
  memberForm.department = ''
  memberForm.machineId = eligibleMachines.value[0]?.id ?? ''
  memberSuccess.value = false
  memberRefreshWarning.value = false
  error.value = ''
  memberDialog.value = true
}
async function submitNewMember() {
  if (busy.value || !memberForm.machineId) return
  busy.value = true
  error.value = ''
  memberSuccess.value = false
  try {
    const response = await createMemberWithMachine({ name: memberForm.name.trim(), department: memberForm.department, machineId: memberForm.machineId })
    memberDialog.value = false
    memberSuccess.value = true
    memberRefreshWarning.value = !response.refreshed
  }
  catch (failure) {
    if ((failure as { status?: number })?.status === 409) {
      error.value = t('team.machineClaimStale')
      try {
        await refresh()
        if (!eligibleMachines.value.some(machine => machine.id === memberForm.machineId)) memberForm.machineId = eligibleMachines.value[0]?.id ?? ''
      }
      catch { /* Preserve the original conflict and entered form. */ }
    }
    else error.value = (failure as Error)?.message === 'Machine is no longer available' ? t('team.machineClaimStale') : t('team.requestFailed')
  }
  finally { busy.value = false }
}
async function submitMachine() {
  await perform(async () => {
    await save('machines', '', { name: machineForm.name.trim(), key: machineForm.key, member: '', active: true })
    machineDialog.value = false
    machineForm.key = ''; machineForm.name = ''
    memberForm.machineId = eligibleMachines.value[0]?.id ?? ''
  })
}
async function previewHistory(machineId: string) {
  await perform(async () => {
    backfillPreview.value = null
    backfillResult.value = null
    backfillError.value = ''
    try { backfillPreview.value = await previewBackfill(machineId) }
    catch { backfillError.value = t('team.backfillFailed') }
  })
}

async function confirmBackfill() {
  const preview = backfillPreview.value
  if (!preview || !preview.member || preview.count <= 0) return
  await perform(async () => {
    backfillResult.value = null
    backfillError.value = ''
    try {
      backfillResult.value = await applyBackfill(preview)
      backfillPreview.value = null
    }
    catch (failure) {
      backfillPreview.value = null
      backfillError.value = t((failure as { status?: number })?.status === 409
        ? 'team.backfillStale' : 'team.backfillFailed')
    }
  })
}
const editing = ref<'team_members' | 'machines' | null>(null)
const draft = reactive({ id: '', name: '', key: '', department: '', member: '', active: true })

async function refreshMemberTotals() {
  memberTotalsState.value = 'loading'
  try {
    const totals = await loadTeamMemberTotals(fetchTotals)
    memberTotals.value = totals
    memberTotalsState.value = 'ready'
  }
  catch (failure) {
    memberTotalsState.value = failure instanceof TotalsRouteUnavailableError ? 'unavailable' : 'error'
  }
}

async function perform(action: () => Promise<unknown>) {
  if (!isOwner.value || busy.value) return
  busy.value = true
  error.value = ''
  try { await action() }
  catch (failure) {
    const messages = Object.entries(mapPocketBaseFieldErrors(failure))
      .map(([field, message]) => `${field}: ${message}`)
    error.value = messages.join(' · ') || t('team.requestFailed')
  }
  finally { busy.value = false }
}
onMounted(() => {
  if (!isOwner.value) return
  void perform(refresh)
  void refreshMemberTotals()
})

function edit(collection: 'team_members' | 'machines', id = '') {
  const record = collection === 'machines'
    ? machines.value.find(row => row.id === id)
    : members.value.find(row => row.id === id)
  Object.assign(draft, { id, name: '', key: '', department: '', member: '', active: true }, record)
  editing.value = collection
}
async function submit() {
  const collection = editing.value
  if (!collection || !draft.name.trim() && collection !== 'machines') return
  if (collection === 'machines' && !draft.key) return
  await perform(async () => {
    const fields = collection === 'team_members'
      ? { name: draft.name.trim(), department: draft.department, active: draft.active }
      // Keep the key verbatim: it must match task_entries.machine exactly.
      : { name: draft.name.trim(), key: draft.key, member: draft.member, active: draft.active }
    await save(collection, draft.id, fields)
    editing.value = null
  })
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div><h1 class="text-xl font-semibold tracking-tight">{{ t('nav.team') }}</h1></div>
      <NuxtLink to="/team/activity" class="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium hover:bg-muted">{{ t('team.activity') }} <ArrowRight class="ml-2 size-4" /></NuxtLink>
    </header>
    <p v-if="!isOwner" class="text-sm text-muted-foreground">{{ t('team.ownerOnly') }}</p>
    <template v-else>
      <div class="grid grid-cols-2 gap-6 mb-2 sm:grid-cols-4">
        <Card>
          <CardContent>
            <p class="text-sm text-muted-foreground">{{ t('team.team_members') }}</p>
            <p class="mt-2 text-2xl font-semibold tabular-nums">{{ members.length }}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p class="text-sm text-muted-foreground">{{ t('team.machines') }}</p>
            <p class="mt-2 text-2xl font-semibold tabular-nums">{{ machines.length }}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p class="text-sm text-muted-foreground">{{ t('team.freeMachines') }}</p>
            <p class="mt-2 text-2xl font-semibold tabular-nums">{{ eligibleMachines.length }}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p class="text-sm text-muted-foreground">{{ t('team.departments') }}</p>
            <p class="mt-2 text-2xl font-semibold tabular-nums">{{ departments.length }}</p>
          </CardContent>
        </Card>
      </div>
      <div v-if="error" role="alert" class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-destructive/10 p-4 text-sm">
        <span>{{ error }}</span>
        <Button variant="outline" :disabled="busy" @click="perform(refresh)">{{ t('team.retry') }}</Button>
      </div>
      <p v-if="memberSuccess" role="status" class="rounded-2xl bg-muted p-4 text-sm">{{ t(memberRefreshWarning ? 'team.memberCreatedRefreshFailed' : 'team.memberCreated') }}</p>
      <div v-if="memberTotalsState === 'error' || memberTotalsState === 'unavailable'" role="status" class="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{{ t(memberTotalsState === 'unavailable' ? 'team.memberTotalsUnavailable' : 'team.memberTotalsFailed') }}</span>
        <Button v-if="memberTotalsState === 'error'" size="sm" variant="outline" @click="refreshMemberTotals">{{ t('team.retry') }}</Button>
      </div>
      <p v-if="backfillError" role="alert" class="text-sm text-destructive">{{ backfillError }}</p>
      <Card v-if="backfillResult">
        <CardContent class="flex flex-wrap items-center justify-between gap-3">
          <p>{{ t('team.backfillSuccess', { count: backfillResult.updated_count }) }}</p>
          <NuxtLink :to="`/team/${backfillResult.member}`" class="text-sm underline">{{ t('team.backfillViewMember') }}</NuxtLink>
        </CardContent>
      </Card>
      <Card v-if="backfillPreview">
        <CardContent class="space-y-3">
          <h2 class="font-semibold">{{ t('team.backfillTitle') }}</h2>
          <dl class="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt class="text-muted-foreground">{{ t('team.machineKey') }}</dt><dd class="break-all">{{ backfillPreview.machine_key }}</dd></div>
            <div><dt class="text-muted-foreground">{{ t('team.member') }}</dt><dd>{{ members.find(member => member.id === backfillPreview?.member)?.name }} ({{ backfillPreview.member }})</dd></div>
            <div><dt class="text-muted-foreground">{{ t('team.backfillCount') }}</dt><dd>{{ backfillPreview.count }}</dd></div>
          </dl>
          <p class="text-sm text-muted-foreground">{{ t('team.backfillNotice') }}</p>
          <p v-if="!backfillPreview.count" class="text-sm">{{ t('team.backfillEmpty') }}</p>
          <div class="flex flex-wrap gap-2">
            <Button :disabled="busy || !backfillPreview.member || backfillPreview.count <= 0" @click="confirmBackfill">{{ t('team.backfillConfirm') }}</Button>
            <Button variant="outline" :disabled="busy" @click="backfillPreview = null">{{ t('common.cancel') }}</Button>
          </div>
        </CardContent>
      </Card>
      <section class="space-y-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div class="relative min-w-0 flex-1">
            <Search aria-hidden="true" class="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="team-member-search" v-model="search" type="search" :aria-label="t('team.searchMembers')" :placeholder="t(members.length === 1 ? 'team.searchWithCountOne' : 'team.searchWithCount', { count: members.length })" class="pl-11" />
          </div>
          <div class="flex min-w-0 flex-wrap items-center gap-3">
            <div role="group" :aria-label="t('team.viewLabel')" class="control-group flex shrink-0 gap-1 self-start bg-muted sm:self-auto">
              <Button size="segment" :variant="view === 'list' ? 'secondary' : 'ghost'" :aria-pressed="view === 'list'" @click="view = 'list'"><List aria-hidden="true" class="size-4" />{{ t('team.listView') }}</Button>
              <Button size="segment" :variant="view === 'grid' ? 'secondary' : 'ghost'" :aria-pressed="view === 'grid'" @click="view = 'grid'"><LayoutGrid aria-hidden="true" class="size-4" />{{ t('team.gridView') }}</Button>
            </div>
            <Button size="sm" :disabled="busy" @click="openMemberCreate"><Plus class="size-4" />{{ t('team.newMember') }}</Button>
          </div>
        </div>
        <TooltipProvider>
          <div v-if="view === 'grid'" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-6 xl:grid-cols-3">
            <TeamMemberCard v-for="member in filteredMembers" :key="member.id" :member="member" :department="departments.find(row => row.id === member.department)?.name || t('team.unassigned')" :machines="machines.filter(row => row.member === member.id)" :actions="[]" :totals="memberTotals?.[member.id]" :totals-state="memberTotalsState" layout="grid" @edit-machine="edit('machines', $event)" />
          </div>
          <div v-else class="flex flex-col gap-2">
            <TeamMemberCard v-for="member in filteredMembers" :key="member.id" :member="member" :department="departments.find(row => row.id === member.department)?.name || t('team.unassigned')" :machines="machines.filter(row => row.member === member.id)" :actions="[]" :totals="memberTotals?.[member.id]" :totals-state="memberTotalsState" layout="list" @edit-machine="edit('machines', $event)" />
          </div>
        </TooltipProvider>
        <SkeletonRows v-if="loading && !members.length" :rows="4" :cols="5" />
        <EmptyState v-if="!loading && !filteredMembers.length" :title="members.length ? t('team.noMemberResults') : t('team.emptyMembers')" />
        <form v-if="editing === 'team_members'" class="grid gap-3 rounded-3xl bg-muted p-4 sm:grid-cols-2" @submit.prevent="submit">
          <label class="space-y-1 text-sm">{{ t('team.name') }}<Input v-model="draft.name" required maxlength="200" :disabled="busy" /></label>
          <label class="space-y-1 text-sm">
            {{ t('team.department') }}
            <Select v-model="draft.department" :options="[{ value: '', label: t('team.unassigned') }, ...departments.filter(row => row.active || row.id === draft.department).map(row => ({ value: row.id, label: row.name }))]" :disabled="busy" />
          </label>
          <div class="flex gap-2 sm:col-span-2">
            <Button type="submit" :disabled="busy">{{ t('common.save') }}</Button>
            <Button type="button" variant="outline" :disabled="busy" @click="editing = null">{{ t('common.cancel') }}</Button>
          </div>
        </form>
      </section>
      <form v-if="editing === 'machines'" class="grid gap-3 rounded-2xl bg-muted p-4 sm:grid-cols-2" @submit.prevent="submit">
        <div class="flex items-center justify-between gap-3 sm:col-span-2">
          <h2 class="font-semibold">{{ draft.name || draft.key }}</h2>
          <Button type="button" variant="ghost" size="sm" @click="editing = null">{{ t('common.cancel') }}</Button>
        </div>
        <label class="space-y-1 text-sm">{{ t('team.name') }}<Input v-model="draft.name" maxlength="200" :disabled="busy" /></label>
        <label class="space-y-1 text-sm">
          {{ t('team.machineKey') }}
          <Input v-model="draft.key" required maxlength="200" :disabled="busy || !!draft.id" />
          <span class="block text-xs text-muted-foreground">{{ t('team.machineKeyHint') }}</span>
        </label>
        <label class="space-y-1 text-sm sm:col-span-2">
          {{ t('team.member') }}
          <Select v-model="draft.member" :options="[{ value: '', label: t('team.unassigned') }, ...members.filter(row => row.active || row.id === draft.member).map(row => ({ value: row.id, label: row.name }))]" :disabled="busy" />
          <span class="block text-xs text-muted-foreground">{{ t('team.machineHistoryAssignmentHint') }}</span>
        </label>
        <div class="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" :disabled="busy">{{ t('common.save') }}</Button>
          <Button type="button" variant="outline" :disabled="busy" @click="perform(async () => { await setActive('machines', draft.id, !draft.active); draft.active = !draft.active })">{{ t(draft.active ? 'team.deactivate' : 'team.reactivate') }}</Button>
          <Button type="button" variant="ghost" :disabled="busy || !draft.member" @click="previewHistory(draft.id)">{{ t('team.backfillPreview') }}</Button>
        </div>
      </form>
      <section class="space-y-4">
        <header class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">{{ t('team.departments') }}</h2>
          </div>
          <Button size="sm" :disabled="busy" @click="departmentEditor.openCreate()">
            <Plus class="size-4" />{{ t('team.newDepartment') }}
          </Button>
        </header>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          <article v-for="department in departments" :key="department.id" class="flex min-w-0 flex-col gap-3 rounded-3xl bg-card p-6">
            <header class="flex min-w-0 items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-medium [overflow-wrap:anywhere]">{{ department.name }}</p>
              </div>
              <TooltipProvider>
                <RowActions :actions="departmentActions(department)" />
              </TooltipProvider>
            </header>
            <dl class="grid min-w-0 grid-cols-3 gap-3 text-sm [overflow-wrap:anywhere]">
              <div class="min-w-0">
                <dt class="text-xs text-muted-foreground">{{ t('team.team_members') }}</dt>
                <dd class="mt-1 font-medium tabular-nums">{{ members.filter(row => row.department === department.id).length }}</dd>
              </div>
              <div class="min-w-0">
                <dt class="text-xs text-muted-foreground">{{ t('team.memberTotalMinutes') }}</dt>
                <dd class="mt-1 font-medium tabular-nums">{{ departmentMemberTotals ? formatDuration(departmentMemberTotals[department.id]?.workMs ?? 0, locale) : '—' }}</dd>
              </div>
              <div class="min-w-0">
                <dt class="text-xs text-muted-foreground">{{ t('team.memberTotalCost') }}</dt>
                <dd class="mt-1 font-medium tabular-nums">{{ departmentMemberTotals ? formatCost(departmentMemberTotals[department.id]?.cost ?? 0) : '—' }}</dd>
              </div>
            </dl>
            <div class="w-full space-y-1">
              <div
                data-testid="department-cost-share" class="h-2 w-full overflow-hidden rounded-full bg-background"
                :role="departmentCostShareFor(department).state === 'known' ? 'meter' : 'img'"
                :aria-label="departmentCostShareLabel(department)"
                :aria-valuemin="departmentCostShareFor(department).state === 'known' ? 0 : undefined"
                :aria-valuemax="departmentCostShareFor(department).state === 'known' ? 100 : undefined"
                :aria-valuenow="departmentCostShareFor(department).percentage ?? undefined"
              >
                <div data-testid="department-cost-share-fill" aria-hidden="true" class="h-full bg-primary" :style="{ width: `${departmentCostShareFor(department).percentage ?? 0}%` }" />
              </div>
              <p v-if="departmentCostShareFor(department).state === 'unavailable'" class="text-xs text-muted-foreground">{{ departmentCostShareLabel(department) }}</p>
            </div>
          </article>
        </div>
        <EmptyState v-if="!loading && !departments.length" :title="t('team.emptyDepartments')" />
      </section>
      <form v-if="memberDialog" class="grid gap-4 rounded-3xl bg-muted p-5 sm:grid-cols-2" @submit.prevent="submitNewMember">
        <div class="sm:col-span-2">
          <h2 class="font-semibold">{{ t('team.newMember') }}</h2>
          <p class="mt-1 text-sm text-muted-foreground">{{ t('team.memberCreationHint') }}</p>
        </div>
        <label class="space-y-1 text-sm">{{ t('team.name') }}<Input v-model="memberForm.name" required maxlength="200" :disabled="busy" /></label>
        <label class="space-y-1 text-sm">
          {{ t('team.department') }}
          <Select v-model="memberForm.department" :options="[{ value: '', label: t('team.unassigned') }, ...departments.filter(row => row.active).map(row => ({ value: row.id, label: row.name }))]" :disabled="busy" />
        </label>
        <label class="space-y-1 text-sm sm:col-span-2">
          {{ t('team.requiredMachine') }}
          <Select v-model="memberForm.machineId" :options="eligibleMachines.map(row => ({ value: row.id, label: `${row.name || row.key} · ${row.key}` }))" :disabled="busy || !eligibleMachines.length" />
          <span v-if="!eligibleMachines.length" class="block text-sm text-muted-foreground">{{ t('team.noFreeMachines') }}</span>
        </label>
        <div class="flex flex-wrap gap-2 sm:col-span-2">
          <Button v-if="eligibleMachines.length" type="submit" :disabled="busy || !memberForm.machineId">{{ t('team.createMember') }}</Button>
          <Button v-else type="button" @click="machineDialog = true">{{ t('team.registerMachine') }}</Button>
          <Button type="button" variant="outline" :disabled="busy" @click="memberDialog = false">{{ t('common.cancel') }}</Button>
        </div>
      </form>
      <form v-if="machineDialog" class="grid gap-3 rounded-3xl bg-muted p-5 sm:grid-cols-2" @submit.prevent="submitMachine">
        <h2 class="font-semibold sm:col-span-2">{{ t('team.registerMachine') }}</h2>
        <label class="space-y-1 text-sm">
          {{ t('team.machineKey') }}
          <Input v-model="machineForm.key" required maxlength="200" :disabled="busy" />
          <span class="block text-xs text-muted-foreground">{{ t('team.machineKeyHint') }}</span>
        </label>
        <label class="space-y-1 text-sm">{{ t('team.name') }}<Input v-model="machineForm.name" maxlength="200" :disabled="busy" /></label>
        <div class="flex gap-2 sm:col-span-2">
          <Button type="submit" :disabled="busy">{{ t('common.create') }}</Button>
          <Button type="button" variant="outline" :disabled="busy" @click="machineDialog = false">{{ t('common.cancel') }}</Button>
        </div>
      </form>
      <DepartmentEditDialog :editor="departmentEditor" />
    </template>
  </div>
</template>
