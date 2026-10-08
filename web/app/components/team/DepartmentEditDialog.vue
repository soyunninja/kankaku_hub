<script setup lang="ts">
import { Archive, ArchiveRestore } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { useDepartmentEditor } from '@/composables/useDepartmentEditor'

const props = defineProps<{ editor: ReturnType<typeof useDepartmentEditor> }>()
const { t } = useI18n()

function preventDismiss(event: Event) {
  if (props.editor.pending.value) event.preventDefault()
}
</script>

<template>
  <Dialog :open="editor.isOpen.value" @update:open="editor.onOpenChange">
    <DialogContent
      :show-close-button="!editor.pending.value"
      :aria-describedby="undefined"
      class="sm:max-w-md"
      @escape-key-down="preventDismiss"
      @pointer-down-outside="preventDismiss"
      @interact-outside="preventDismiss"
    >
      <DialogHeader>
        <DialogTitle>{{ editor.editing.value ? t('team.editDepartment') : t('team.newDepartment') }}</DialogTitle>
      </DialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="editor.submit">
        <div class="flex flex-col gap-1.5">
          <Label for="department-name">{{ t('team.name') }}</Label>
          <Input id="department-name" v-model="editor.name.value" required maxlength="200" :disabled="editor.pending.value" />
        </div>
        <p v-if="editor.error.value" role="alert" class="text-sm text-destructive">{{ editor.error.value }}</p>
        <DialogFooter class="flex-wrap sm:justify-between">
          <Button
            v-if="editor.editing.value"
            type="button"
            variant="outline"
            :disabled="editor.pending.value"
            @click="editor.toggleActive"
          >
            <component :is="editor.active.value ? Archive : ArchiveRestore" class="size-4" aria-hidden="true" />
            {{ t(editor.active.value ? 'team.deactivate' : 'team.reactivate') }}
          </Button>
          <div class="flex gap-2 sm:ml-auto">
            <Button type="button" variant="outline" :disabled="editor.pending.value" @click="editor.cancel">{{ t('common.cancel') }}</Button>
            <Button type="submit" :disabled="editor.pending.value || !editor.name.value.trim()">
              {{ t(editor.editing.value ? 'common.save' : 'common.create') }}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
