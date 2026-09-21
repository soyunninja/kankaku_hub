<script setup lang="ts">
import { X } from '@lucide/vue'
import { cn } from '@/lib/utils'

const { toasts, dismiss } = useToast()
// Renamed on destructure: the template's `v-for="t in toasts"` already
// uses `t` for the loop's toast object, which would shadow the i18n
// translate function inside that block.
const { t: translate } = useI18n()

/**
 * Screen-reader announcement text (finding 5, MAJOR a11y): the visible
 * toast cards below were previously silent to screen readers — a plain
 * DOM insertion with no `aria-live`/`role` is not announced on its own.
 * These two always-mounted live regions carry the actual announcement;
 * the visible cards stay in the accessibility tree too (so their Close
 * button remains keyboard/AT reachable), they just aren't what triggers
 * the announcement. Split polite (default/success) from assertive
 * (destructive/error) so an error interrupts, per the usual
 * `role="alert"` vs `role="status"` convention. Both regions must exist
 * in the DOM from first render (not created only once the first toast
 * fires) — a live region a screen reader hasn't already registered
 * misses its first announcement.
 */
const latestPolite = computed(() => {
  const toast = [...toasts.value].reverse().find(t => t.variant !== 'destructive')
  return toast ? [toast.title, toast.description].filter(Boolean).join('. ') : ''
})
const latestAssertive = computed(() => {
  const toast = [...toasts.value].reverse().find(t => t.variant === 'destructive')
  return toast ? [toast.title, toast.description].filter(Boolean).join('. ') : ''
})
</script>

<template>
  <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
    {{ latestPolite }}
  </div>
  <div class="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
    {{ latestAssertive }}
  </div>
  <Teleport to="body">
    <div data-testid="toast-viewport" class="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          :class="cn(
            'pointer-events-auto flex items-start justify-between gap-3 rounded-lg border p-3 shadow-lg',
            t.variant === 'destructive' && 'border-destructive/40 bg-destructive text-destructive-foreground',
            t.variant === 'success' && 'border-success/40 bg-success text-success-foreground',
            (!t.variant || t.variant === 'default') && 'border-border bg-card text-card-foreground',
          )"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium">
              {{ t.title }}
            </p>
            <p v-if="t.description" class="mt-0.5 text-xs opacity-90">
              {{ t.description }}
            </p>
          </div>
          <button class="shrink-0 opacity-70 hover:opacity-100" :aria-label="translate('common.close')" :title="translate('common.close')" @click="dismiss(t.id)">
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
</style>
