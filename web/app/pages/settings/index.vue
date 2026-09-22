<script setup lang="ts">
import type { EngramStatus } from '@/composables/useEngramNarrative'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const { t, locale, locales, setLocale } = useI18n()
useHead({ title: computed(() => t('settings.title')) })

const colorMode = useColorMode()
const { user } = useAuth()
const config = useRuntimeConfig()

const hubUrl = useHubUrl()

/** Read-only mirror of `/api/kankaku/engram/status` — informational
 * only, same idiom as the Connection card above it. `null` (not yet
 * loaded, or Engram unreachable-to-the-point-of-erroring) renders as
 * "not configured", which is also the correct state when the operator
 * never set `KANKAKU_ENGRAM_URL` at all. */
const { ensureStatus: ensureEngramStatus } = useEngramNarrative()
const engramStatus = ref<EngramStatus | null>(null)
onMounted(async () => {
  engramStatus.value = await ensureEngramStatus()
})
</script>

<template>
  <div class="flex max-w-5xl flex-col gap-4">
    <h1 class="text-xl font-semibold tracking-tight">
      {{ t('settings.title') }}
    </h1>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
    <Card>
      <CardHeader>
        <CardTitle class="text-sm font-medium text-foreground">
          {{ t('settings.appearance') }}
        </CardTitle>
        <CardDescription>{{ t('theme.label') }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-wrap gap-2">
        <Button
          v-for="opt in ['dark', 'light', 'system']" :key="opt"
          size="sm" :variant="colorMode.preference === opt ? 'default' : 'outline'"
          @click="colorMode.preference = opt"
        >
          {{ t(`theme.${opt}`) }}
        </Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="text-sm font-medium text-foreground">
          {{ t('settings.language') }}
        </CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-2">
        <div class="flex flex-wrap gap-2">
          <Button
            v-for="l in locales" :key="typeof l === 'string' ? l : l.code"
            size="sm" :variant="locale === (typeof l === 'string' ? l : l.code) ? 'default' : 'outline'"
            @click="setLocale(typeof l === 'string' ? l : l.code)"
          >
            {{ typeof l === 'string' ? l : l.name }}
          </Button>
        </div>
        <p class="text-xs text-muted-foreground">
          {{ t('settings.jaDisclaimer') }}
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="text-sm font-medium text-foreground">
          {{ t('settings.connection') }}
        </CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-2 text-sm">
        <div class="flex justify-between">
          <span class="text-muted-foreground">{{ t('settings.hubUrl') }}</span>
          <span class="tabular-nums">{{ hubUrl }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted-foreground">{{ t('settings.signedInAs') }}</span>
          <span>{{ user?.email }} ({{ user?.role }})</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted-foreground">{{ t('settings.version') }}</span>
          <span class="tabular-nums">{{ config.public.appVersion }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted-foreground">{{ t('settings.currency') }}</span>
          <span class="tabular-nums">USD</span>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="text-sm font-medium text-foreground">
          {{ t('engram.title') }}
        </CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-2 text-sm">
        <div v-if="!engramStatus?.configured" class="text-muted-foreground">
          {{ t('engram.notConfigured') }}
        </div>
        <div v-else-if="engramStatus.unauthorized" class="flex justify-between">
          <span class="text-muted-foreground">{{ t('engram.status') }}</span>
          <span>{{ t('engram.unauthorized') }}</span>
        </div>
        <div v-else class="flex justify-between">
          <span class="text-muted-foreground">{{ t('engram.status') }}</span>
          <span>{{ engramStatus.reachable ? t('engram.reachable') : t('engram.unreachable') }}</span>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="text-sm font-medium text-foreground">
          {{ t('settings.schema') }}
        </CardTitle>
        <CardDescription>docs/contract.md, pocketbase/pb_migrations/</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-1 text-xs text-muted-foreground">
        <p>clients, projects, tasks, task_entries, work_records, task_entries_daily_totals</p>
        <p>task_entries is the only summable collection (D6) — work_records is drill-down only.</p>
        <p>No money fields beyond `cost` (measured provider token cost, USD) — D8.</p>
      </CardContent>
    </Card>
    </div>

    <p class="text-xs text-muted-foreground">
      {{ t('settings.currencyNote') }}
    </p>
  </div>
</template>
