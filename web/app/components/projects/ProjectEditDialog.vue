<script setup lang="ts">
import { Plus, Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { useProjectEditor } from '@/composables/useProjectEditor'

const props = defineProps<{ editor: ReturnType<typeof useProjectEditor>, clients: { id: string, name: string }[] }>()
const { t } = useI18n()
const { canWrite } = useAuth()
const { dialogOpen, editing, form, saving, onSubmit, selectedClientActive } = props.editor
function onOpenChange(open: boolean) {
  if (!open) props.editor.close()
}
</script>

<template>
  <Dialog :open="dialogOpen" @update:open="onOpenChange">
    <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ t('projects.edit') }}</DialogTitle>
      </DialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
        <div class="flex flex-col gap-1.5">
          <Label for="p-name">{{ t('common.name') }}</Label>
          <Input id="p-name" v-model="form.name" required />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>{{ t('common.client') }}</Label>
          <Select v-model="form.client" :aria-label="t('common.client')" :options="clients.map(client => ({ value: client.id, label: client.name }))" />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="p-code">{{ t('common.code') }}</Label>
          <Input id="p-code" v-model="form.code" />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="p-notes">{{ t('projects.notes') }}</Label>
          <Textarea id="p-notes" v-model="form.notes" maxlength="5000" rows="4" />
          <p class="text-xs text-muted-foreground">{{ t('projects.notesHint') }}</p>
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>{{ t('projects.repoPaths') }}</Label>
          <p class="text-xs text-muted-foreground">{{ t('projects.repoPathsHint') }}</p>
          <div v-for="(_, index) in form.repoPaths" :key="index" class="flex gap-2">
            <Input v-model="form.repoPaths[index]" :aria-label="t('projects.repoPaths')" placeholder="/home/dev/repos/project" />
            <Button type="button" variant="ghost" size="icon" :aria-label="t('projects.removePath')" :title="t('projects.removePath')" @click="props.editor.removePath(index)">
              <Trash2 aria-hidden="true" class="size-4" />
            </Button>
          </div>
          <Button type="button" variant="outline" size="sm" class="self-start" @click="props.editor.addPath">
            <Plus aria-hidden="true" class="size-4" />{{ t('projects.addPath') }}
          </Button>
        </div>
        <p v-if="!selectedClientActive" role="status" class="text-sm text-muted-foreground">{{ t('projects.inactiveParentNotice') }}</p>
        <label class="flex items-center gap-2 text-sm">
          <Switch v-model="form.active" :disabled="!selectedClientActive" />{{ t('common.active') }}
        </label>
        <DialogFooter>
          <Button type="submit" :disabled="saving || !canWrite || !editing" :aria-busy="saving">{{ t('common.save') }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
