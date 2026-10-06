<script setup lang="ts">
import ClientsPage from '@/pages/clients/index.vue'
import ProjectsPage from '@/pages/projects/index.vue'
import TasksPage from '@/pages/tasks/index.vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ORGANIZATION_TABS, organizationTabQuery, resolveOrganizationTab } from '@/components/organization/tabs'
import type { OrganizationTab } from '@/components/organization/tabs'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
useHead({ title: computed(() => t('nav.organization')) })

const activeTab = computed(() => resolveOrganizationTab(route.query.tab))
const views = { clients: ClientsPage, projects: ProjectsPage, tasks: TasksPage }
// Mount only visited views; retain their local filters without eager data requests.
const visited = reactive(new Set<OrganizationTab>([activeTab.value]))
watch(activeTab, tab => visited.add(tab), { flush: 'sync' })

function selectTab(value: string | number) {
  void router.replace({ query: organizationTabQuery(route.query, value) })
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-6">
    <header class="space-y-2">
      <h1 class="text-xl font-semibold tracking-tight">{{ t('nav.organization') }}</h1>
    </header>
    <Tabs :model-value="activeTab" @update:model-value="selectTab">
      <TabsList :aria-label="t('nav.organization')">
        <TabsTrigger v-for="tab in ORGANIZATION_TABS" :key="tab" :value="tab">
          {{ t(`nav.${tab}`) }}
        </TabsTrigger>
      </TabsList>
      <TabsContent
        v-for="tab in ORGANIZATION_TABS"
        v-show="activeTab === tab"
        :key="tab"
        :value="tab"
        force-mount
        class="mt-4"
      >
        <component :is="views[tab]" v-if="visited.has(tab)" embedded />
      </TabsContent>
    </Tabs>
  </div>
</template>
