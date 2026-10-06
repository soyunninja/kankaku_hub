<script setup lang="ts">
import { Check, Copy } from '@lucide/vue'
import { useClipboard } from '@vueuse/core'
import { Button } from '@/components/ui/button'

const props = withDefaults(defineProps<{
  /** Text copied to the clipboard, and used in the accessible label. */
  text: string
  /** Hide only the visible label; keep clipboard feedback accessible. */
  iconOnly?: boolean
}>(), { iconOnly: false })

const { t } = useI18n()
const { copy, copied, isSupported } = useClipboard({ source: computed(() => props.text), copiedDuring: 1500 })
</script>

<template>
  <Button
    :variant="iconOnly ? 'ghost' : 'outline'"
    :size="iconOnly ? 'icon-sm' : 'sm'"
    :disabled="!isSupported"
    :aria-label="t('commands.copyAria', { syntax: props.text })"
    class="shrink-0 gap-1.5"
    @click="copy()"
  >
    <Check v-if="copied" class="size-3.5 text-success" aria-hidden="true" />
    <Copy v-else class="size-3.5" aria-hidden="true" />
    <span aria-live="polite" :class="iconOnly ? 'sr-only' : undefined">{{ copied ? t('commands.copied') : t('commands.copy') }}</span>
  </Button>
</template>
