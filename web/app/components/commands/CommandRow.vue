<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { ROUTE_NAV_KEYS } from '@/lib/kankaku-commands'
import type { SearchableCommand } from '@/lib/kankaku-commands'
import CopyButton from './CopyButton.vue'

const props = defineProps<{
  command: SearchableCommand
}>()

const { t } = useI18n()

const relatedNavKey = computed(() => props.command.relatedRoute ? ROUTE_NAV_KEYS[props.command.relatedRoute] : undefined)
</script>

<template>
  <div class="flex flex-col gap-2 border-b border-border py-4 last:border-0">
    <div class="flex flex-wrap items-center gap-2">
      <code class="min-w-0 flex-1 rounded-md bg-muted px-3 py-1.5 font-mono text-sm break-words whitespace-pre-wrap text-foreground">{{ command.syntax }}</code>
      <CopyButton :text="command.syntax" />
    </div>

    <Badge v-if="command.requiresHub" variant="secondary" class="w-fit">
      {{ t('commands.requiresHub') }}
    </Badge>

    <p class="text-sm text-foreground">
      {{ command.description }}
    </p>
    <p class="text-xs text-muted-foreground">
      {{ command.whenToUse }}
    </p>

    <NuxtLink
      v-if="command.relatedRoute && relatedNavKey"
      :to="command.relatedRoute"
      class="w-fit text-xs font-medium text-primary hover:underline"
    >
      {{ t('commands.relatedLink', { screen: t(relatedNavKey) }) }}
    </NuxtLink>
  </div>
</template>
