<script setup lang="ts">
import { Archive, ArchiveRestore, ArrowLeft, Pencil, Plus, Unlink } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import MemberWorkViews from '@/components/team/MemberWorkViews.vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const route = useRoute()
const { t } = useI18n()
const { isOwner } = useAuth()
const { departments, members, machines, refresh } = useTeamCatalog()
const memberId = computed(() => String(route.params.id || ''))
const member = computed(() => members.value.find(row => row.id === memberId.value))
const currentDepartment = computed(() => departments.value.find(row => row.id === member.value?.department)?.name || t('team.unassigned'))
const currentMachines = computed(() => machines.value.filter(row => row.member === memberId.value))
const editing = ref(false)
const draft = reactive({ name: '', department: '', active: true })
const saving = ref(false)
const machineSaving = ref(false)
const machineDialog = ref(false)
const unlinkTarget = ref('')
const unlinkMachine = computed(() => machines.value.find(row => row.id === unlinkTarget.value))
const machineError = ref('')
const machineErrorLocation = ref<'card' | 'dialog' | ''>('')
const machineNotice = ref('')
const selectedMachine = ref('')
const machineDraft = reactive({ key: '', name: '' })
const generation = ref(0)
async function editMember() {
  if (!isOwner.value || !member.value || saving.value || editing.value) return
  Object.assign(draft, { name: member.value.name, department: member.value.department, active: member.value.active })
  editError.value = ''
  editing.value = true
}
function cancelEdit() {
  if (saving.value) return
  editing.value = false
  editError.value = ''
}
function onEditOpenChange(open: boolean) {
  if (open) void editMember()
  else cancelEdit()
}
function preventEditDismiss(event: Event) {
  if (saving.value) event.preventDefault()
}
function onMachineDialogOpenChange(open: boolean) {
  if (machineSaving.value) return
  machineDialog.value = open
  if (!open && machineErrorLocation.value === 'dialog') {
    machineError.value = ''
    machineErrorLocation.value = ''
  }
}
function preventMachineDismiss(event: Event) {
  if (machineSaving.value) event.preventDefault()
}
function openUnlinkConfirmation(machineId: string) {
  if (!isOwner.value || !member.value || machineSaving.value) return
  unlinkTarget.value = machineId
}
function closeUnlinkConfirmation() {
  if (machineSaving.value) return
  unlinkTarget.value = ''
}
function onUnlinkDialogOpenChange(open: boolean) {
  if (!open) closeUnlinkConfirmation()
}
async function confirmUnlinkMachine() {
  const machineId = unlinkTarget.value
  if (!machineId || machineSaving.value) return
  await manageMemberMachine('unlink', machineId)
}
async function saveMember() {
  const target = member.value
  if (!isOwner.value || !target || !editing.value || saving.value) return
  const targetId = target.id
  const request = generation.value
  saving.value = true
  editError.value = ''
  try {
    await useTeamCatalog().save('team_members', targetId, { name: draft.name.trim(), department: draft.department, active: draft.active })
    if (request === generation.value && isOwner.value && memberId.value === targetId && member.value?.id === targetId) editing.value = false
  }
  catch {
    if (request === generation.value && isOwner.value && memberId.value === targetId && member.value?.id === targetId) editError.value = t('team.requestFailed')
  }
  finally { saving.value = false }
}
async function manageMemberMachine(action: 'assign' | 'register' | 'unlink', machineId?: string) {
  const target = member.value
  if (!isOwner.value || !target || saving.value || editing.value || machineSaving.value) return
  const targetId = target.id
  const request = generation.value
  machineSaving.value = true
  machineError.value = ''
  machineErrorLocation.value = ''
  machineNotice.value = ''
  try {
    const catalog = useTeamCatalog()
    let refreshed = true
    if (action === 'assign' && machineId) refreshed = await catalog.assignMachine(machineId, targetId)
    else if (action === 'register') refreshed = await catalog.registerMachine({ key: machineDraft.key.trim(), name: machineDraft.name.trim(), memberId: targetId })
    else if (action === 'unlink' && machineId) refreshed = await catalog.unlinkMachine(machineId, targetId)
    if (request === generation.value && isOwner.value && memberId.value === targetId && member.value?.id === targetId) {
      selectedMachine.value = ''
      machineDraft.key = ''
      machineDraft.name = ''
      if (action !== 'unlink') machineDialog.value = false
      else unlinkTarget.value = ''
      if (!refreshed) machineNotice.value = t('team.machineSavedRefreshFailed')
    }
  }
  catch {
    if (request === generation.value && isOwner.value && memberId.value === targetId && member.value?.id === targetId) {
      machineError.value = t('team.machineRequestFailed')
      machineErrorLocation.value = action === 'unlink' ? 'card' : 'dialog'
    }
  }
  finally { machineSaving.value = false }
}
async function toggleMemberActive() {
  const target = member.value
  if (!isOwner.value || !target || saving.value || editing.value) return
  const targetId = target.id
  const nextActive = !target.active
  const request = generation.value
  saving.value = true
  error.value = ''
  try {
    await useTeamCatalog().setActive('team_members', targetId, nextActive)
    if (request === generation.value && memberId.value === targetId && member.value?.id === targetId) draft.active = nextActive
  }
  catch {
    if (request === generation.value && memberId.value === targetId && member.value?.id === targetId) error.value = t('team.requestFailed')
  }
  finally { saving.value = false }
}
const loading = ref(true)
const error = ref('')
const editError = ref('')
async function load() {
  const request = ++generation.value
  error.value = ''
  if (!isOwner.value) { loading.value = false; return }
  loading.value = true
  try { await refresh() }
  catch { if (request === generation.value) error.value = t('team.requestFailed') }
  finally { if (request === generation.value) loading.value = false }
}
watch([memberId, isOwner], () => {
  editing.value = false
  editError.value = ''
  machineError.value = ''
  machineErrorLocation.value = ''
  machineNotice.value = ''
  machineDialog.value = false
  unlinkTarget.value = ''
  selectedMachine.value = ''
  machineDraft.key = ''
  machineDraft.name = ''
  void load()
})
onMounted(() => { void load() })
onBeforeUnmount(() => { generation.value++ })
useHead({ title: computed(() => member.value?.name || t('team.memberWork')) })
</script>

<template>
  <div class="flex w-full min-w-0 flex-col gap-6">
    <p v-if="!isOwner" role="alert">{{ t('team.ownerOnly') }}</p>
    <p v-else-if="loading" role="status">{{ t('common.loading') }}</p>
    <div v-else-if="error" role="alert" class="flex flex-wrap items-center gap-3 rounded-xl border p-4">{{ error }} <Button variant="outline" @click="load">{{ t('team.retry') }}</Button></div>
    <template v-else-if="member">
      <header class="flex min-w-0 flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" class="shrink-0" :aria-label="t('common.back')" :title="t('common.back')" @click="navigateTo('/team')"><ArrowLeft aria-hidden="true" class="size-4" /></Button>
        <div class="min-w-0 flex-1">
          <h1 class="break-words text-xl font-semibold tracking-tight sm:text-2xl">{{ member.name }}</h1>
          <p class="text-sm text-muted-foreground">{{ currentDepartment }}</p>
        </div>
        <Badge class="shrink-0" :variant="member.active ? 'success' : 'outline'">{{ t(member.active ? 'common.active' : 'common.inactive') }}</Badge>
      </header>
      <div class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <main class="min-w-0 space-y-6">
          <MemberWorkViews :key="member.id" :member-id="member.id" />
        </main>
        <aside class="min-w-0 space-y-4 [overflow-wrap:anywhere]">
          <div v-if="isOwner && member" data-testid="member-actions" class="flex flex-wrap justify-end gap-2">
            <Button v-if="!editing" data-testid="member-edit" :disabled="saving" @click="editMember">
              <Pencil aria-hidden="true" class="size-4" />{{ t('common.edit') }}
            </Button>
            <Button data-testid="member-active-toggle" variant="outline" :disabled="saving || editing" :aria-busy="saving" @click="toggleMemberActive">
              <component :is="member.active ? Archive : ArchiveRestore" aria-hidden="true" class="size-4" />
              {{ member.active ? t('common.archive') : t('common.unarchive') }}
            </Button>
          </div>
          <Card>
            <CardHeader class="grid-cols-[1fr_auto] grid-rows-[auto] items-center gap-3">
              <CardTitle class="text-sm">{{ t('team.machines') }}</CardTitle>
              <Button v-if="isOwner && member" variant="ghost" size="icon" :aria-label="t('team.addMachine')" :title="t('team.addMachine')" :disabled="machineSaving || saving || editing" @click="onMachineDialogOpenChange(true)"><Plus aria-hidden="true" class="size-4" /></Button>
            </CardHeader>
            <CardContent class="space-y-3 pt-0">
              <div v-for="machine in currentMachines" :key="machine.id" class="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                <NuxtLink to="/team" class="min-w-0 flex-1 break-words hover:underline">
                  {{ machine.name || machine.key }} · {{ machine.key }}<span v-if="!machine.active"> ({{ t('common.inactive') }})</span>
                </NuxtLink>
                <Button variant="outline" size="icon" class="shrink-0" :aria-label="t('team.unlinkMachine')" :title="t('team.unlinkMachine')" :disabled="machineSaving || saving || editing" :aria-busy="machineSaving" @click="openUnlinkConfirmation(machine.id)"><Unlink aria-hidden="true" class="size-4" /></Button>
              </div>
              <p v-if="!currentMachines.length" class="text-sm text-muted-foreground">{{ t('team.noMachines') }}</p>
              <p v-if="machineError && machineErrorLocation === 'card'" role="alert" class="text-sm text-destructive">{{ machineError }}</p>
            </CardContent>
          </Card>
          <p v-if="machineNotice" role="status" class="text-sm text-muted-foreground">{{ machineNotice }}</p>
          <p class="border-t border-border pt-4 text-sm text-muted-foreground">{{ t('team.memberHistory') }}</p>
        </aside>
      </div>
    </template>
    <p v-else-if="!loading" role="alert">{{ t('team.memberNotFound') }}</p>
    <Dialog v-if="isOwner && member" :open="machineDialog" @update:open="onMachineDialogOpenChange">
      <DialogContent
        :show-close-button="!machineSaving"
        :aria-describedby="undefined"
        class="sm:max-w-md"
        @escape-key-down="preventMachineDismiss"
        @pointer-down-outside="preventMachineDismiss"
        @interact-outside="preventMachineDismiss"
      >
        <DialogHeader><DialogTitle>{{ t('team.addMachine') }} · {{ member.name }}</DialogTitle></DialogHeader>
        <div class="flex flex-col gap-5">
          <section data-testid="member-machine-actions" class="space-y-3">
            <h3 class="text-sm font-medium">{{ t('team.assignMachine') }}</h3>
            <div class="flex flex-col gap-3 sm:flex-row">
              <div class="min-w-0 flex-1 space-y-1.5">
                <Label>{{ t('team.selectFreeMachine') }}</Label>
                <Select v-model="selectedMachine" :aria-label="t('team.selectFreeMachine')" :options="[{ value: '', label: t('team.selectFreeMachine') }, ...machines.filter(machine => machine.active && !machine.member).map(machine => ({ value: machine.id, label: `${machine.name || machine.key} · ${machine.key}` }))]" :disabled="machineSaving || saving || editing" />
              </div>
              <Button class="self-end" variant="outline" :disabled="!selectedMachine || machineSaving || saving || editing" :aria-busy="machineSaving" @click="manageMemberMachine('assign', selectedMachine)">{{ t('team.assignMachine') }}</Button>
            </div>
          </section>
          <div class="border-t" />
          <form class="flex flex-col gap-4" @submit.prevent="manageMemberMachine('register')">
            <h3 class="text-sm font-medium">{{ t('team.registerMachine') }}</h3>
          <div class="flex flex-col gap-1.5">
            <Label for="machine-key">{{ t('team.machineKey') }}</Label>
            <Input id="machine-key" v-model="machineDraft.key" required maxlength="200" :disabled="machineSaving || saving || editing" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="machine-name">{{ t('team.machineName') }}</Label>
            <Input id="machine-name" v-model="machineDraft.name" required maxlength="200" :disabled="machineSaving || saving || editing" />
          </div>
            <p v-if="machineError && machineErrorLocation === 'dialog'" role="alert" class="text-sm text-destructive">{{ machineError }}</p>
            <DialogFooter>
              <Button type="button" variant="outline" :disabled="machineSaving" @click="onMachineDialogOpenChange(false)">{{ t('common.cancel') }}</Button>
              <Button type="submit" :disabled="machineSaving || saving || editing" :aria-busy="machineSaving">{{ t('team.registerMachine') }}</Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog v-if="isOwner && member && unlinkMachine" :open="Boolean(unlinkTarget)" @update:open="onUnlinkDialogOpenChange">
      <DialogContent :show-close-button="!machineSaving" :aria-describedby="undefined" @escape-key-down="preventMachineDismiss" @pointer-down-outside="preventMachineDismiss" @interact-outside="preventMachineDismiss">
        <DialogHeader><DialogTitle>{{ t('team.unlinkMachine') }}</DialogTitle></DialogHeader>
        <p>{{ t('team.unlinkMachineConfirm', { machine: `${unlinkMachine.name || unlinkMachine.key} · ${unlinkMachine.key}`, member: member.name }) }}</p>
        <p v-if="machineError && machineErrorLocation === 'card'" role="alert" class="text-sm text-destructive">{{ machineError }}</p>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="machineSaving" @click="closeUnlinkConfirmation">{{ t('common.cancel') }}</Button>
          <Button type="button" :disabled="machineSaving" :aria-busy="machineSaving" @click="confirmUnlinkMachine">{{ t('team.unlinkMachine') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog v-if="isOwner && member" :open="editing" @update:open="onEditOpenChange">
      <DialogContent
        :show-close-button="!saving"
        :aria-describedby="undefined"
        class="sm:max-w-md"
        @escape-key-down="preventEditDismiss"
        @pointer-down-outside="preventEditDismiss"
        @interact-outside="preventEditDismiss"
      >
        <DialogHeader>
          <DialogTitle>{{ t('common.edit') }} · {{ member.name }}</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-4" @submit.prevent="saveMember">
          <div class="flex flex-col gap-1.5">
            <Label for="member-name">{{ t('team.name') }}</Label>
            <Input id="member-name" v-model="draft.name" required maxlength="200" :disabled="saving" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="member-department">{{ t('team.department') }}</Label>
            <Select id="member-department" v-model="draft.department" :options="[{ value: '', label: t('team.unassigned') }, ...departments.filter(row => row.active || row.id === draft.department).map(row => ({ value: row.id, label: row.name }))]" :disabled="saving" />
          </div>
          <label class="flex items-center gap-2 text-sm"><input v-model="draft.active" type="checkbox" :disabled="saving">{{ t('common.active') }}</label>
          <p v-if="editError" role="alert" class="text-sm text-destructive">{{ editError }}</p>
          <DialogFooter>
            <Button type="button" variant="outline" :disabled="saving" @click="cancelEdit">{{ t('common.cancel') }}</Button>
            <Button type="submit" :disabled="saving">{{ t('common.save') }}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
