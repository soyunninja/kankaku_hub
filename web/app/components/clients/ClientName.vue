<script setup lang="ts">
/**
 * Avatar + client name, truncation-safe: the avatar never shrinks, the
 * name truncates instead of pushing siblings (a status badge, an
 * action button) out of view. Use the default slot to render something
 * other than the plain name (e.g. a name plus an inline icon) while
 * still getting the avatar + truncation wiring for free.
 */
import type { HTMLAttributes } from 'vue'
import ClientAvatar from '@/components/clients/ClientAvatar.vue'
import type { ClientRecord } from '@/lib/pocketbase-types'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  client: Pick<ClientRecord, 'id' | 'name' | 'favicon' | 'updated'>
  size?: 'xs' | 'sm' | 'md'
  class?: HTMLAttributes['class']
}>(), {
  size: 'sm',
})
</script>

<template>
  <span :class="cn('flex min-w-0 items-center gap-2', props.class)">
    <ClientAvatar :client="client" :size="size" />
    <span class="min-w-0 flex-1 truncate">
      <slot>{{ client.name }}</slot>
    </span>
  </span>
</template>
