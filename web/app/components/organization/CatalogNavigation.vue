<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <NuxtLink
    to="/team"
    class="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium ring-offset-background transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  >
    {{ t('nav.team') }}
  </NuxtLink>
</template>
