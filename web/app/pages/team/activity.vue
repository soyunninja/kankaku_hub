<script setup lang="ts">
import TeamActivity from '@/components/team/TeamActivity.vue'
const { t } = useI18n()
useHead({ title: computed(() => t('team.activity')) })
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold">{{ t('team.activity') }}</h1>
    <NuxtLink to="/team" class="underline">{{ t('nav.team') }}</NuxtLink>
    <TeamActivity />
  </div>
</template>
