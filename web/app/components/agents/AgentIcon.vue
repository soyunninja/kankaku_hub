<script setup lang="ts">
/**
 * Presentational, round agent-identity disc driven by the registry in
 * `app/lib/agents.ts`. Icon only — no label text; the resolved label (or
 * a translated "not reported"/raw-slug fallback for an unresolved agent)
 * is exposed as `title`/`aria-label` on the wrapper for accessible text
 * and a tooltip. `AgentBadge` wraps this with a visible label when there
 * is room.
 *
 * Two render paths, same outer size and a subtle `ring-border` ring on
 * both so a white disc doesn't glare on dark and doesn't vanish on
 * light:
 * - `background: 'white'` (marks that are a dark glyph on transparent,
 *   e.g. `pi`): a white disc with the mark inset ~15% so it stays
 *   legible on the dark theme.
 * - `background: 'own'` (icons that bring their own background, e.g.
 *   `opencode`): the image fills the disc (`object-cover`, clipped to
 *   the circle). These also get a brighter `dark:ring-white/25` ring so
 *   the disc edge stays perceivable against a dark table row — a plain
 *   white disc already has enough contrast on its own and doesn't need
 *   it.
 *
 * Never a broken image or an empty gap: an unresolved agent (empty,
 * legacy, or a slug not in the registry) and a failed image load
 * (`@error`, swapped locally — no page reload) both fall back to the
 * same neutral generic glyph (lucide `Bot`).
 *
 * Asset URLs are root-absolute (`/agents/...`, from the registry),
 * matching the one existing precedent for a `web/public/` asset in this
 * app (the hardcoded `/favicon.ico` link in `nuxt.config.ts`) — this SPA
 * never customizes `app.baseURL` and PocketBase serves the static build
 * from a sub-path-free origin, so a root-absolute path resolves
 * correctly in both `nuxt dev` and the production build without a
 * dynamic base-path helper.
 */
import { Bot } from '@lucide/vue'
import { resolveAgent } from '@/lib/agents'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  agent?: string
  size?: 'sm' | 'md'
}>(), {
  size: 'sm',
})

const { t } = useI18n()

const sizeClass: Record<'sm' | 'md', string> = {
  sm: 'size-5',
  md: 'size-6',
}
const sizePx: Record<'sm' | 'md', number> = {
  sm: 20,
  md: 24,
}

const resolved = computed(() => resolveAgent(props.agent))

const imageFailed = ref(false)
watch(() => props.agent, () => {
  imageFailed.value = false
})

const showImage = computed(() => !!resolved.value && !imageFailed.value)

const accessibleLabel = computed(() => {
  if (resolved.value) return resolved.value.label
  const raw = props.agent?.trim()
  return raw || t('common.agentUnknown')
})
</script>

<template>
  <span
    data-testid="agent-icon"
    :data-agent-state="showImage ? 'image' : 'fallback'"
    :title="accessibleLabel"
    :aria-label="accessibleLabel"
    :class="cn(
      'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border',
      sizeClass[size],
      showImage && resolved!.background === 'white' ? 'bg-white' : '',
      showImage && resolved!.background === 'own' ? 'dark:ring-white/25' : '',
      !showImage ? 'bg-muted' : '',
    )"
  >
    <img
      v-if="showImage"
      :src="resolved!.icon"
      alt=""
      loading="lazy"
      decoding="async"
      :width="sizePx[size]"
      :height="sizePx[size]"
      :class="resolved!.background === 'white' ? 'size-full object-contain p-[15%]' : 'size-full object-cover'"
      @error="imageFailed = true"
    >
    <Bot v-else class="size-2/3 text-muted-foreground" aria-hidden="true" />
  </span>
</template>
