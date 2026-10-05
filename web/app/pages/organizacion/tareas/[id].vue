<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { TaskRecord } from '@/lib/pocketbase-types'

const { t } = useI18n()
const route = useRoute()
const { $pb } = useNuxtApp()
const { byId: projectById, ensureLoaded: ensureProjects } = useProjects()
const { byId: clientById, ensureLoaded: ensureClients } = useClients()
const loading = ref(true)
const error = ref(false)
let version = 0
useHead({ title: computed(() => t('tasks.title')) })

async function resolveTask() {
  const current = ++version
  const id = String(route.params.id)
  const valid = () => current === version && id === String(route.params.id)
  loading.value = true
  error.value = false
  try {
    const task = await $pb.collection('tasks').getOne<TaskRecord>(id)
    if (!valid()) return
    await Promise.all([ensureProjects(), ensureClients()])
    if (!valid()) return
    const project = projectById(task.project)
    if (!project || !clientById(project.client)) return
    await navigateTo({
      path: `/organizacion/clientes/${project.client}/proyectos/${project.id}/tareas/${task.id}`,
      query: route.query,
      hash: route.hash,
    }, { replace: true })
  }
  catch (err) { if (valid() && (err as { status?: number }).status !== 404) error.value = true }
  finally { if (valid()) loading.value = false }
}
onMounted(resolveTask)
watch(() => route.params.id, resolveTask, { flush: 'sync' })
onBeforeUnmount(() => { version++ })
</script>

<template>
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
    <Button variant="ghost" class="self-start" @click="navigateTo('/organizacion?tab=tasks')">
      <ArrowLeft aria-hidden="true" class="size-4" />{{ t('common.back') }}
    </Button>
    <p v-if="loading" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="error" role="alert">{{ t('common.error') }}</p>
    <p v-else role="status">{{ t('tasks.detail.notFound') }}</p>
  </div>
</template>
