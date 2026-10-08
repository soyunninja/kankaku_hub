<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

withDefaults(defineProps<{
  kind: 'project' | 'session'
  identifier: string
  backTo: { path: string, query: Record<string, string> }
}>(), {})
const { t } = useI18n()
const { isOwner } = useAuth()
</script>

<template>
  <p v-if="!isOwner" role="alert">{{ t('team.ownerOnly') }}</p>
  <Card v-else class="min-w-0">
    <CardHeader class="flex flex-row items-center gap-3 space-y-0">
      <Button as-child variant="ghost" size="icon" class="shrink-0">
        <NuxtLink :to="backTo" :aria-label="t('common.back')" :title="t('common.back')"><ArrowLeft aria-hidden="true" class="size-4" /></NuxtLink>
      </Button>
      <CardTitle class="min-w-0 break-words text-xl font-semibold tracking-tight">{{ t(kind === 'project' ? 'team.workProjectDetail' : 'team.workSessionDetail') }}</CardTitle>
    </CardHeader>
    <CardContent class="space-y-2 pt-0">
      <p class="break-all text-sm text-muted-foreground">{{ identifier }}</p>
      <p class="text-sm text-muted-foreground">{{ t('team.workDetailComingLater') }}</p>
    </CardContent>
  </Card>
</template>
