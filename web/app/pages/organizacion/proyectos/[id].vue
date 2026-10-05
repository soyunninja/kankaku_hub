<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { Button } from '@/components/ui/button'

definePageMeta({})
const { t } = useI18n()
const route = useRoute()
const { byId, ensureLoaded: ensureProjects } = useProjects()
const { byId: clientById, ensureLoaded: ensureClients } = useClients()
const loading = ref(true)
const error = ref(false)
let version = 0
onBeforeUnmount(() => { version++ })

async function resolveProject() {
  const request = ++version
  const id = String(route.params.id)
  const current = () => request === version && id === String(route.params.id)
  loading.value = true
  error.value = false
  try {
    await Promise.all([ensureProjects(), ensureClients()])
    if (!current()) return
    const project = byId(id)
    if (!project?.client || !clientById(project.client)) return
    await navigateTo({
      path: `/organizacion/clientes/${project.client}/proyectos/${project.id}`,
      query: route.query,
      hash: route.hash,
    }, { replace: true })
  }
  catch {
    if (current()) error.value = true
  }
  finally {
    if (current()) loading.value = false
  }
}
onMounted(resolveProject)
watch(() => route.fullPath, resolveProject, { flush: 'sync' })
</script>

<template>
  <div class="flex flex-col gap-6">
    <Button variant="ghost" size="icon" class="self-start" :aria-label="t('common.back')" :title="t('common.back')" @click="navigateTo('/organizacion?tab=projects')">
      <ArrowLeft aria-hidden="true" class="size-4" />
    </Button>
    <p v-if="loading" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="error" role="alert">{{ t('common.error') }}</p>
    <p v-else role="status">{{ t('projects.detail.notFound') }}</p>
  </div>
</template>
