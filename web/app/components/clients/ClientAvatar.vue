<script setup lang="ts">
/**
 * Presentational client avatar: the fetched favicon when present, an
 * initials fallback otherwise. Never causes a broken-image flash or a
 * console error — no favicon at all means no `<img>` is rendered in the
 * first place, and a failed image load swaps to the initials fallback
 * via `@error`. See `app/lib/client-avatar.ts` for the pure
 * initials/color/cache-bust helpers this wraps.
 */
import type { HTMLAttributes } from 'vue'
import { AVATAR_FOREGROUND_VAR, avatarColorVar, clientInitials, withCacheBust } from '@/lib/client-avatar'
import type { ClientRecord } from '@/lib/pocketbase-types'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  client: Pick<ClientRecord, 'id' | 'name' | 'favicon' | 'updated'>
  size?: 'xs' | 'sm' | 'md'
  class?: HTMLAttributes['class']
}>(), {
  size: 'sm',
})

const { $pb } = useNuxtApp()

const sizeClass: Record<'xs' | 'sm' | 'md', string> = {
  xs: 'size-5 text-[10px]',
  sm: 'size-6 text-[11px]',
  md: 'size-10 text-sm',
}

// Degrades gracefully against a PocketBase instance that hasn't applied
// the favicon migration yet: `favicon`/`updated` may come back as
// `undefined` at runtime even though the type says `string` (same
// pattern as the contact fields in app/pages/clients/index.vue).
const faviconUrl = computed(() => {
  const filename = props.client.favicon || ''
  if (!filename) return ''
  try {
    const base = $pb.files.getURL(props.client, filename)
    return withCacheBust(base, props.client.updated || '')
  }
  catch {
    return ''
  }
})

const imageFailed = ref(false)
watch(faviconUrl, () => {
  imageFailed.value = false
})

const showImage = computed(() => !!faviconUrl.value && !imageFailed.value)
const backgroundVar = computed(() => avatarColorVar(props.client.id))
const initials = computed(() => clientInitials(props.client.name))
</script>

<template>
  <span
    data-testid="client-avatar"
    :data-avatar-state="showImage ? 'image' : 'initials'"
    :class="cn(
      'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none',
      sizeClass[size],
      props.class,
    )"
    :style="showImage ? { background: '#fff', padding: '5px' } : { background: backgroundVar, color: AVATAR_FOREGROUND_VAR }"
  >
    <img
      v-if="showImage"
      :src="faviconUrl"
      alt=""
      loading="lazy"
      decoding="async"
      class="size-full object-cover"
      @error="imageFailed = true"
    >
    <template v-else>
      {{ initials }}
    </template>
  </span>
</template>
