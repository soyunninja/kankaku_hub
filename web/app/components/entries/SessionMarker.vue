<script setup lang="ts">
/**
 * Small coloured dot + label identifying which kankaku session a
 * entries-table row belongs to (app/pages/entries/index.vue, Feature 1a),
 * reused as-is for the "group by session" header rows
 * (app/lib/entries-session-group.ts). Colour is derived deterministically
 * from `sessionId` (app/lib/session-marker.ts) — colour is never the only
 * signal: the label is always rendered next to the dot (WCAG 1.4.1), and
 * the full session id is exposed via `title`/`aria-label`.
 *
 * Renders a real `<button>` (clickable, keyboard-reachable) when
 * `sessionId` is non-empty — activating it emits `click`, which the
 * caller wires to "filter the list to this session". Renders a plain
 * muted "—" span with no click handling when there is no `session_id` at
 * all (nothing to filter to, and no session name is possible either).
 */
import { sessionColor, sessionMarkerLabel } from '@/lib/session-marker'

const props = defineProps<{
  sessionId: string
  sessionName?: string
  /** Overrides the default `sessionMarkerLabel(sessionId, sessionName)`
   * text without touching that function's own byte-for-byte contract —
   * used by the Engram narrative feature (`app/lib/session-title.ts`) to
   * show a session's narrative title here instead, while the marker's
   * colour/click/tooltip behaviour stays exactly the same. */
  label?: string
}>()

const emit = defineEmits<{ click: [] }>()
const { t } = useI18n()

const label = computed(() => props.label ?? sessionMarkerLabel(props.sessionId, props.sessionName))
const color = computed(() => sessionColor(props.sessionId))
const fullIdTitle = computed(() => t('entries.sessionMarker.fullId', { id: props.sessionId }))
</script>

<template>
  <button
    v-if="sessionId"
    type="button"
    class="inline-flex max-w-40 items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    :title="fullIdTitle"
    :aria-label="`${label} — ${fullIdTitle} — ${t('entries.sessionMarker.filterAria')}`"
    @click.stop="emit('click')"
  >
    <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: color }" aria-hidden="true" />
    <span class="truncate">{{ label }}</span>
  </button>
  <span v-else class="text-xs text-muted-foreground" :title="t('entries.sessionMarker.noSession')" :aria-label="t('entries.sessionMarker.noSession')">
    —
  </span>
</template>
