<script setup lang="ts">
import MemberProjectHistory from '@/components/team/MemberProjectHistory.vue'
import { dateRangeFromQuery } from '@/components/team/activity'
import { resolvePreset } from '@/lib/period'
import { memberWorkReturnDestination } from '@/lib/member-work-navigation'

const route = useRoute()
const { t } = useI18n()
const { isOwner } = useAuth()
const memberId = computed(() => typeof route.params.memberId === 'string' ? route.params.memberId : '')
const projectId = computed(() => typeof route.params.projectId === 'string' ? route.params.projectId : '')
const range = computed(() => dateRangeFromQuery(route.query.dateStart, route.query.dateEnd, resolvePreset('30d')))
const backTo = computed(() => memberWorkReturnDestination(memberId.value, range.value.start, range.value.end))
const valid = computed(() => Boolean(memberId.value.trim() && projectId.value.trim()))
</script>

<template>
  <p v-if="isOwner && !valid" role="alert">{{ t('team.workDetailInvalid') }}</p>
  <MemberProjectHistory v-else-if="isOwner" :member-id="memberId" :project-id="projectId" :back-to="backTo!" />
  <p v-else role="alert">{{ t('team.ownerOnly') }}</p>
</template>
