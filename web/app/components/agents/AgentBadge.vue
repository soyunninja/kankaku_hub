<script setup lang="ts">
/**
 * `AgentIcon` plus a visible text label, for rows/sections with enough
 * width to show the agent's name next to its mark (icon-only `AgentIcon`
 * is the right call in tight/compact layouts instead — see e.g.
 * `app/pages/sessions-without-task/index.vue`).
 *
 * The label is the resolved product name (`"pi"`, `"OpenCode"` — never
 * translated). For an unresolved agent it is the raw slug as-is when one
 * was actually reported but just not recognized (e.g. a future agent
 * without an icon yet), or the translated "not reported" text only when
 * the slug is genuinely empty — same either/or as `AgentIcon`'s
 * accessible label, never both concatenated (a raw, reported slug is
 * not "not reported").
 */
import { resolveAgent } from '@/lib/agents'
import AgentIcon from '@/components/agents/AgentIcon.vue'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  agent?: string
  size?: 'xs' | 'sm' | 'md'
}>(), {
  size: 'sm',
})

const { t } = useI18n()

const textSizeClass: Record<'xs' | 'sm' | 'md', string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-sm',
}

const resolved = computed(() => resolveAgent(props.agent))

const label = computed(() => {
  if (resolved.value) return resolved.value.label
  const raw = props.agent?.trim()
  return raw || t('common.agentUnknown')
})
</script>

<template>
  <span data-testid="agent-badge" class="inline-flex min-w-0 items-center gap-1.5">
    <AgentIcon :agent="agent" :size="size" />
    <span :class="cn('min-w-0 truncate', textSizeClass[size])">{{ label }}</span>
  </span>
</template>
