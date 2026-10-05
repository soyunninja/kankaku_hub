<script setup lang="ts">
import { Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { TaskRecord, TaskStatus } from '@/lib/pocketbase-types'

const props = defineProps<{ task: TaskRecord, canWrite: boolean, isAuthorized?: () => boolean }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ deleted: [] }>()
const { t } = useI18n()
const { projects, ensureLoaded } = useProjects()
const toast = useToast()
const statuses: TaskStatus[] = ['open', 'doing', 'done']
const editor = useTaskEditor(() => props.task, () => props.canWrite && (props.isAuthorized?.() ?? true), () => emit('deleted'))
const { form, reset, submit: onSubmit, deleteTask: onDelete } = editor
watch(open, async (value) => {
  editor.open.value = value
  if (!value) return
  reset()
  try { await ensureLoaded() }
  catch { toast.error(t('common.error')) }
})
watch(editor.open, value => { open.value = value })
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('tasks.edit') }}</DialogTitle>
      </DialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
        <div class="flex flex-col gap-1.5">
          <Label for="t-title">{{ t('common.name') }}</Label>
          <Input id="t-title" v-model="form.title" required />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>{{ t('common.project') }}</Label>
          <Select v-model="form.project" :aria-label="t('common.project')" :options="projects.map(p => ({ value: p.id, label: p.name }))" />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>{{ t('common.status') }}</Label>
          <Select v-model="form.status" :aria-label="t('common.status')" :options="statuses.map(s => ({ value: s, label: t(`tasks.status.${s}`) }))" />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="t-ref">{{ t('common.externalRef') }}</Label>
          <Input id="t-ref" v-model="form.external_ref" />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="t-desc">{{ t('common.description') }}</Label>
          <Textarea id="t-desc" v-model="form.description" />
        </div>
        <DialogFooter v-if="canWrite" class="justify-between sm:justify-between">
          <Button data-testid="write-action" type="button" variant="ghost" class="text-destructive" @click="onDelete">
            <Trash2 class="size-4" />{{ t('common.delete') }}
          </Button>
          <Button data-testid="write-action" type="submit">{{ t('common.save') }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
