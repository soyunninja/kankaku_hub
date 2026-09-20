<script setup lang="ts">
import { Search, Terminal } from '@lucide/vue'
import CommandRow from '@/components/commands/CommandRow.vue'
import CopyButton from '@/components/commands/CopyButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  COMMAND_GROUPS,
  filterCommands,
  KANKAKU_COMMANDS,
  KANKAKU_ENV_VARS,
} from '@/lib/kankaku-commands'
import type { SearchableCommand } from '@/lib/kankaku-commands'

const { t } = useI18n()
useHead({ title: computed(() => t('commands.title')) })

const config = useRuntimeConfig()
const query = ref('')

/** kankaku's commands, with their descriptions resolved through the active locale. */
const localizedCommands = computed<SearchableCommand[]>(() =>
  KANKAKU_COMMANDS.map(c => ({
    ...c,
    description: t(`commands.items.${c.id}.description`),
    whenToUse: t(`commands.items.${c.id}.whenToUse`),
  })),
)

const filtered = computed(() => filterCommands(localizedCommands.value, query.value))

const groupedFiltered = computed(() =>
  COMMAND_GROUPS
    .map(group => ({ group, commands: filtered.value.filter(c => c.group === group) }))
    .filter(g => g.commands.length > 0),
)

const noResults = computed(() => query.value.trim().length > 0 && groupedFiltered.value.length === 0)

// Same-origin resolution as app/pages/settings/index.vue and
// app/plugins/pocketbase.client.ts: in the production build this app IS
// served by the target hub, so `window.location.origin` is always this
// hub's own URL.
const hubUrl = computed(() => config.public.pbUrl || window.location.origin)

const connectSnippet = computed(() =>
  [
    `export KANKAKU_PB_URL="${hubUrl.value}"`,
    'export KANKAKU_PB_EMAIL="kankaku-sync@example.com"',
    'export KANKAKU_PB_PASSWORD="<service-account-password>"',
  ].join('\n'),
)

const credentialsSnippet = computed(() =>
  JSON.stringify(
    { url: hubUrl.value, email: 'kankaku-sync@example.com', password: '<service-account-password>' },
    null,
    2,
  ),
)

const LOAD_IN_PI_SNIPPET = 'pi -e /absolute/path/to/kankaku'
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6">
    <div class="flex items-start gap-3">
      <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Terminal class="size-5" />
      </div>
      <div class="min-w-0">
        <h1 class="text-xl font-semibold tracking-tight">
          {{ t('commands.title') }}
        </h1>
        <p class="text-sm text-muted-foreground">
          {{ t('commands.subtitle') }}
        </p>
      </div>
    </div>

    <div class="relative">
      <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        v-model="query"
        :placeholder="t('commands.filterPlaceholder')"
        class="pl-9"
        :aria-label="t('commands.filterPlaceholder')"
      />
    </div>

    <EmptyState v-if="noResults" :title="t('commands.filterEmpty')" />

    <section v-for="g in groupedFiltered" :key="g.group" class="flex flex-col gap-2">
      <h2 class="text-sm font-semibold tracking-tight text-foreground">
        {{ t(`commands.groups.${g.group}`) }}
      </h2>
      <Card>
        <CardContent class="flex flex-col divide-border">
          <CommandRow v-for="cmd in g.commands" :key="cmd.id" :command="cmd" />
        </CardContent>
      </Card>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="text-sm font-semibold tracking-tight text-foreground">
        {{ t('commands.workflow.title') }}
      </h2>
      <Card>
        <CardContent class="flex flex-col gap-4 text-sm">
          <div>
            <p class="font-medium text-foreground">
              {{ t('commands.workflow.firstRun.title') }}
            </p>
            <p class="text-muted-foreground">
              {{ t('commands.workflow.firstRun.body') }}
            </p>
          </div>
          <div>
            <p class="font-medium text-foreground">
              {{ t('commands.workflow.dailyUse.title') }}
            </p>
            <p class="text-muted-foreground">
              {{ t('commands.workflow.dailyUse.body') }}
            </p>
          </div>
          <div>
            <p class="font-medium text-foreground">
              {{ t('commands.workflow.reassigning.title') }}
            </p>
            <p class="text-muted-foreground">
              {{ t('commands.workflow.reassigning.body') }}
            </p>
            <NuxtLink to="/unassigned" class="text-xs font-medium text-primary hover:underline">
              {{ t('commands.relatedLink', { screen: t('nav.unassigned') }) }}
            </NuxtLink>
          </div>
          <p class="rounded-md border border-dashed border-border px-3 py-2 text-xs text-foreground">
            {{ t('commands.workflow.keyRule') }}
          </p>
        </CardContent>
      </Card>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="text-sm font-semibold tracking-tight text-foreground">
        {{ t('commands.config.title') }}
      </h2>

      <Card>
        <CardHeader>
          <CardTitle class="text-sm font-medium text-foreground">
            {{ t('commands.config.envTitle') }}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{{ t('commands.config.envColumns.name') }}</TableHead>
                  <TableHead>{{ t('commands.config.envColumns.default') }}</TableHead>
                  <TableHead>{{ t('commands.config.envColumns.meaning') }}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="ev in KANKAKU_ENV_VARS" :key="ev.name">
                  <TableCell class="align-top font-mono text-xs">
                    {{ ev.name }}
                  </TableCell>
                  <TableCell class="align-top font-mono text-xs text-muted-foreground">
                    {{ ev.default }}
                  </TableCell>
                  <TableCell class="max-w-xs align-top text-xs whitespace-normal text-muted-foreground">
                    {{ t(`commands.config.env.${ev.i18nKey}`) }}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-sm font-medium text-foreground">
            {{ t('commands.config.credentialsTitle') }}
          </CardTitle>
          <CardDescription>~/.kankaku/credentials.json</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-2 text-sm">
          <p class="text-muted-foreground">
            {{ t('commands.config.credentialsBody') }}
          </p>
          <div class="flex items-start gap-2">
            <pre class="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap break-words text-foreground">{{ credentialsSnippet }}</pre>
            <CopyButton :text="credentialsSnippet" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-sm font-medium text-foreground">
            {{ t('commands.config.connectTitle') }}
          </CardTitle>
          <CardDescription>{{ t('commands.config.connectBody') }}</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-3 text-sm">
          <div class="flex items-start gap-2">
            <pre class="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap break-words text-foreground">{{ connectSnippet }}</pre>
            <CopyButton :text="connectSnippet" />
          </div>
          <p class="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {{ t('commands.config.serviceAccountNote') }}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-sm font-medium text-foreground">
            {{ t('commands.config.loadInPiTitle') }}
          </CardTitle>
          <CardDescription>{{ t('commands.config.loadInPiBody') }}</CardDescription>
        </CardHeader>
        <CardContent class="flex items-start gap-2 text-sm">
          <pre class="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap break-words text-foreground">{{ LOAD_IN_PI_SNIPPET }}</pre>
          <CopyButton :text="LOAD_IN_PI_SNIPPET" />
        </CardContent>
        <CardContent class="pt-0 text-xs text-muted-foreground">
          {{ t('commands.config.loadInPiNote') }}
        </CardContent>
      </Card>
    </section>
  </div>
</template>
