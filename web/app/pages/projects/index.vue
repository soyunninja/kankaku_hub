<script setup lang="ts">
import { Plus, Trash2 } from '@lucide/vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonRows from '@/components/common/SkeletonRows.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { groupByProject } from '@/lib/aggregate'
import { formatCost, formatDuration } from '@/lib/format'
import { resolvePreset } from '@/lib/period'
import type { ProjectRecord } from '@/lib/pocketbase-types'

const { t } = useI18n()
useHead({ title: computed(() => t('projects.title')) })

const { clients, ensureLoaded: ensureClients } = useClients()
const { projects, loading, ensureLoaded, create, update } = useProjects()
const { fetchRange } = useTaskEntries()
const toast = useToast()

const filterClient = ref('')
const totalsByProject = ref<Record<string, { cost: number, workMs: number }>>({})

onMounted(async () => {
  await Promise.all([ensureClients(), ensureLoaded()])
  const entries = await fetchRange({ start: resolvePreset('lastMonth').start, end: resolvePreset('today').end })
  const grouped = groupByProject(entries.filter(e => e.project))
  totalsByProject.value = Object.fromEntries(grouped.map(g => [g.key, { cost: g.cost, workMs: g.workMs }]))
})

function clientName(id: string) {
  return clients.value.find(c => c.id === id)?.name ?? id
}

const filtered = computed(() => filterClient.value ? projects.value.filter(p => p.client === filterClient.value) : projects.value)

const dialogOpen = ref(false)
const editing = ref<ProjectRecord | null>(null)
const form = reactive({ name: '', client: '', code: '', active: true, repoPaths: [] as string[] })

function openCreate() {
  editing.value = null
  form.name = ''
  form.client = clients.value[0]?.id ?? ''
  form.code = ''
  form.active = true
  form.repoPaths = []
  dialogOpen.value = true
}

function openEdit(project: ProjectRecord) {
  editing.value = project
  form.name = project.name
  form.client = project.client
  form.code = project.code
  form.active = project.active
  form.repoPaths = [...(project.repo_paths || [])]
  dialogOpen.value = true
}

function addPath() {
  form.repoPaths.push('')
}
function removePath(i: number) {
  form.repoPaths.splice(i, 1)
}

async function onSubmit() {
  const repo_paths = form.repoPaths.map(p => p.trim()).filter(Boolean)
  try {
    if (editing.value) {
      await update(editing.value.id, { name: form.name, client: form.client, code: form.code, active: form.active, repo_paths })
    }
    else {
      await create({ name: form.name, client: form.client, code: form.code, active: form.active, repo_paths })
    }
    toast.success(t('common.saved'))
    dialogOpen.value = false
  }
  catch {
    toast.error(t('common.error'))
  }
}

async function toggleArchive(project: ProjectRecord) {
  try {
    await update(project.id, { active: !project.active })
  }
  catch {
    toast.error(t('common.error'))
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold tracking-tight">
        {{ t('projects.title') }}
      </h1>
      <div class="flex items-center gap-2">
        <Select
          v-model="filterClient" class="w-48" :placeholder="t('projects.filterByClient')"
          :options="[{ value: '', label: t('common.all') }, ...clients.map(c => ({ value: c.id, label: c.name }))]"
        />
        <Button size="sm" @click="openCreate">
          <Plus class="size-4" />
          {{ t('projects.new') }}
        </Button>
      </div>
    </div>

    <Card>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ t('common.name') }}</TableHead>
              <TableHead>{{ t('common.client') }}</TableHead>
              <TableHead>{{ t('common.status') }}</TableHead>
              <TableHead class="text-right">
                {{ t('common.work') }}
              </TableHead>
              <TableHead class="text-right">
                {{ t('common.cost') }}
              </TableHead>
              <TableHead class="text-right">
                {{ t('common.actions') }}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SkeletonRows v-if="loading && projects.length === 0" :rows="4" :cols="6" />
            <TableRow v-for="p in filtered" :key="p.id" class="cursor-pointer" @click="navigateTo(`/projects/${p.id}`)">
              <TableCell class="font-medium">
                {{ p.name }}
              </TableCell>
              <TableCell class="text-muted-foreground">
                {{ clientName(p.client) }}
              </TableCell>
              <TableCell>
                <Badge :variant="p.active ? 'success' : 'outline'">
                  {{ p.active ? t('common.active') : t('common.inactive') }}
                </Badge>
              </TableCell>
              <TableCell class="text-right tabular-nums">
                {{ formatDuration(totalsByProject[p.id]?.workMs ?? 0) }}
              </TableCell>
              <TableCell class="text-right tabular-nums">
                {{ formatCost(totalsByProject[p.id]?.cost ?? 0) }}
              </TableCell>
              <TableCell class="text-right" @click.stop>
                <div class="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" @click="openEdit(p)">
                    {{ t('common.edit') }}
                  </Button>
                  <Button variant="ghost" size="sm" @click="toggleArchive(p)">
                    {{ p.active ? t('common.archive') : t('common.unarchive') }}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <EmptyState v-if="!loading && filtered.length === 0" :title="t('projects.empty')" class="m-4" />
      </CardContent>
    </Card>

    <Dialog v-model:open="dialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ editing ? t('projects.edit') : t('projects.new') }}</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
          <div class="flex flex-col gap-1.5">
            <Label for="p-name">{{ t('common.name') }}</Label>
            <Input id="p-name" v-model="form.name" required />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>{{ t('common.client') }}</Label>
            <Select v-model="form.client" :options="clients.map(c => ({ value: c.id, label: c.name }))" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="p-code">{{ t('common.code') }}</Label>
            <Input id="p-code" v-model="form.code" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>{{ t('projects.repoPaths') }}</Label>
            <p class="text-xs text-muted-foreground">
              {{ t('projects.repoPathsHint') }}
            </p>
            <div v-for="(_, i) in form.repoPaths" :key="i" class="flex gap-2">
              <Input v-model="form.repoPaths[i]" placeholder="/home/dev/repos/project" />
              <Button type="button" variant="ghost" size="icon" @click="removePath(i)">
                <Trash2 class="size-4" />
              </Button>
            </div>
            <Button type="button" variant="outline" size="sm" class="self-start" @click="addPath">
              <Plus class="size-4" />
              {{ t('projects.addPath') }}
            </Button>
          </div>
          <label class="flex items-center gap-2 text-sm">
            <Switch v-model="form.active" />
            {{ t('common.active') }}
          </label>
          <DialogFooter>
            <Button type="submit">
              {{ t('common.save') }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
