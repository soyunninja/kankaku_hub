<script setup lang="ts">
import { X } from '@lucide/vue'
import { cn } from '@/lib/utils'

const { toasts, dismiss } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
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
          <button class="shrink-0 opacity-70 hover:opacity-100" @click="dismiss(t.id)">
            <X class="size-4" />
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
