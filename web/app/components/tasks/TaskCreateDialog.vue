<script setup lang="ts">
import { computed } from 'vue'
import { Plus } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useTaskCreate, type TaskCreateContext } from '@/composables/useTaskCreate'

const props = defineProps<{ context: TaskCreateContext }>()
const { t } = useI18n()
const { create } = useTasks()
const state = useTaskCreate(() => props.context, create)
const canCreate = computed(() => props.context.canWrite && props.context.isAuthenticated && props.context.role === 'owner'
  && props.context.clientActive === true && props.context.projectActive === true
  && props.context.projectClientId === props.context.clientId && !!props.context.userId && !!props.context.token)
function preventDismiss(event: Event) {
  if (state.busy.value) event.preventDefault()
}
</script>

<template>
  <Button
    v-if="canCreate"
    data-testid="project-task-create"
    size="sm"
    :disabled="state.busy.value"
    @click="state.openDialog"
  >
    <Plus aria-hidden="true" class="size-4" />{{ t('tasks.new') }}
  </Button>
  <Dialog :open="state.open.value" @update:open="state.requestOpenChange">
    <DialogContent
      :show-close-button="!state.busy.value"
      @escape-key-down="preventDismiss"
      @pointer-down-outside="preventDismiss"
      @interact-outside="preventDismiss"
    >
      <DialogHeader>
        <DialogTitle>{{ t('tasks.new') }}</DialogTitle>
      </DialogHeader>
      <div class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        <p>{{ t('common.client') }}: {{ context.clientName }}</p>
        <p>{{ t('common.project') }}: {{ context.projectName }}</p>
      </div>
      <form class="flex flex-col gap-4" @submit.prevent="state.submit">
        <div class="flex flex-col gap-1.5">
          <Label for="project-task-title">{{ t('common.name') }}</Label>
          <Input id="project-task-title" v-model="state.form.title" required :disabled="state.busy.value" :aria-invalid="state.error.value && !state.form.title.trim()" />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="project-task-ref">{{ t('common.externalRef') }}</Label>
          <Input id="project-task-ref" v-model="state.form.external_ref" :disabled="state.busy.value" />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="project-task-description">{{ t('common.description') }}</Label>
          <Textarea id="project-task-description" v-model="state.form.description" :disabled="state.busy.value" />
        </div>
        <p v-if="state.error.value" role="alert" class="text-sm text-destructive">{{ t('common.error') }}</p>
        <DialogFooter>
          <Button type="submit" :disabled="state.busy.value || !canCreate" :aria-busy="state.busy.value">{{ t('common.save') }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
