<script setup lang="ts">
import { Archive, ArchiveRestore, ArrowLeft, Pencil } from '@lucide/vue'
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
            <CardHeader><CardTitle class="text-sm">{{ t('team.currentMachines') }}</CardTitle></CardHeader>
            <CardContent class="space-y-2 pt-0">
              <NuxtLink v-for="machine in currentMachines" :key="machine.id" to="/team" class="block break-words rounded-lg bg-muted px-3 py-2 text-sm hover:underline">
                {{ machine.name || machine.key }} · {{ machine.key }}<span v-if="!machine.active"> ({{ t('common.inactive') }})</span>
              </NuxtLink>
              <p v-if="!currentMachines.length" class="text-sm text-muted-foreground">{{ t('team.noMachines') }}</p>
            </CardContent>
          </Card>
          <p class="border-t border-border pt-4 text-sm text-muted-foreground">{{ t('team.memberHistory') }}</p>
        </aside>
      </div>
    </template>
    <p v-else-if="!loading" role="alert">{{ t('team.memberNotFound') }}</p>
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
