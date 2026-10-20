<script setup lang="ts">
import { computed } from 'vue'
import { Plus } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useProjectCreate, type ProjectCreateContext } from '@/composables/useProjectCreate'

const props = defineProps<{ context: ProjectCreateContext | null }>()
const { t } = useI18n()
const { $pb } = useNuxtApp()
const { create } = useProjects()
const state = useProjectCreate(() => props.context, create, async id => {
  const context = props.context
  const sameAuth = () => !!context && $pb.authStore.isValid
    && $pb.authStore.record?.id === context.userId && $pb.authStore.record?.role === 'owner'
    && $pb.authStore.token === context.token
  if (!sameAuth() || context?.routeClientId !== id || context.clientId !== id) return false
  const client = await $pb.collection('clients').getOne<{ active?: boolean }>(id)
  return client.active === true && sameAuth() && props.context?.routeClientId === id
})
const canCreate = computed(() => props.context?.canWrite === true && props.context.isAuthenticated === true
  && props.context.role === 'owner' && props.context.clientActive === true
  && props.context.routeClientId === props.context.clientId && !!props.context.userId && !!props.context.token)
function preventDismiss(event: Event) { if (state.busy.value) event.preventDefault() }
</script>

<template>
  <Button v-if="canCreate" data-testid="client-project-create" size="sm" :disabled="state.busy.value" @click="state.openDialog">
    <Plus aria-hidden="true" class="size-4" />{{ t('projects.new') }}
  </Button>
  <Dialog :open="state.open.value" @update:open="state.requestOpenChange">
    <DialogContent :show-close-button="!state.busy.value" @escape-key-down="preventDismiss" @pointer-down-outside="preventDismiss" @interact-outside="preventDismiss">
      <DialogHeader><DialogTitle>{{ t('projects.new') }}</DialogTitle></DialogHeader>
      <div class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{{ t('common.client') }}: {{ context?.clientName }}</div>
      <form class="flex flex-col gap-4" @submit.prevent="state.submit">
        <div class="flex flex-col gap-1.5"><Label for="client-project-name">{{ t('common.name') }}</Label><Input id="client-project-name" v-model="state.form.name" required :disabled="state.busy.value" :aria-invalid="state.error.value && !state.form.name.trim()" /></div>
        <div class="flex flex-col gap-1.5"><Label for="client-project-code">{{ t('common.code') }}</Label><Input id="client-project-code" v-model="state.form.code" :disabled="state.busy.value" /></div>
        <div class="flex flex-col gap-1.5"><Label for="client-project-notes">{{ t('projects.notes') }}</Label><Textarea id="client-project-notes" v-model="state.form.notes" maxlength="5000" :disabled="state.busy.value" /></div>
        <div class="flex flex-col gap-1.5"><Label>{{ t('projects.repoPaths') }}</Label><div v-for="(_, index) in state.form.repoPaths" :key="index" class="flex gap-2"><Input v-model="state.form.repoPaths[index]" :aria-label="t('projects.repoPaths')" :disabled="state.busy.value" /><Button type="button" variant="outline" :disabled="state.busy.value" @click="state.removePath(index)">{{ t('common.delete') }}</Button></div><Button type="button" variant="outline" :disabled="state.busy.value" @click="state.addPath">{{ t('common.add') }}</Button></div>
        <p v-if="state.error.value" role="alert" class="text-sm text-destructive">{{ t('common.error') }}</p>
        <DialogFooter><Button type="submit" :disabled="state.busy.value || !canCreate" :aria-busy="state.busy.value">{{ t('common.save') }}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
