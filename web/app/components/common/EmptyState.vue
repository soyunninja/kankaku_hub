<script setup lang="ts">
defineProps<{ title: string, description?: string }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
    <p class="text-sm font-medium text-foreground">
      {{ title }}
    </p>
    <p v-if="description" class="max-w-sm text-xs text-muted-foreground">
      {{ description }}
    </p>
    <slot />
  </div>
</template>
