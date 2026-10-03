<script setup lang="ts">
/**
 * Presentational row of icon-only action buttons — the shared shape
 * behind the edit/archive/delete-style buttons that used to be
 * duplicated inline in the Clients and Projects tables (and, for the
 * tasks list view, a text "Edit" button plus an unlabeled delete icon).
 * No business logic: every action's click handler and confirmation flow
 * (if any) stays owned by the caller.
 *
 * Each action's `label` becomes both the button's accessible name
 * (`aria-label`, what e2e's `getByRole('button', { name })` and screen
 * readers see) and the text of a keyboard-focusable tooltip. A bare
 * `title` attribute alone only shows on mouse hover, not on keyboard
 * focus — this reuses the Tooltip/TooltipContent/TooltipTrigger pattern
 * already established for the notes-icon tooltip in clients/index.vue
 * and the wall/waiting tooltip in sessions-without-task/index.vue, which
 * *does* open on focus. Callers must wrap the table in a
 * `<TooltipProvider>` (as clients/index.vue already does).
 */
import type { Component } from 'vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export interface RowAction {
  icon: Component
  label: string
  onClick: () => void
  disabled?: boolean
  /** Delete-style action: tints the icon destructive-red on hover/focus, without changing its resting color. */
  destructive?: boolean
}

withDefaults(defineProps<{ actions: RowAction[], noHover?: boolean }>(), {
  noHover: false,
})
</script>

<template>
  <div class="flex justify-end gap-1">
    <Tooltip v-for="(action, i) in actions" :key="i">
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon-sm"
          :no-hover="noHover"
          :class="action.destructive && !noHover ? 'hover:text-destructive' : ''"
          :disabled="action.disabled"
          :aria-label="action.label"
          @click="action.onClick"
        >
          <component :is="action.icon" class="size-4" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {{ action.label }}
      </TooltipContent>
    </Tooltip>
  </div>
</template>
