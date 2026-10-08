<script setup lang="ts">
import MemberWorkDetailShell from '@/components/team/MemberWorkDetailShell.vue'
import { dateRangeFromQuery } from '@/components/team/activity'
import { resolvePreset } from '@/lib/period'
import { memberWorkReturnDestination } from '@/lib/member-work-navigation'

const route = useRoute()
const { t } = useI18n()
const { isOwner } = useAuth()
const memberId = computed(() => typeof route.params.memberId === 'string' ? route.params.memberId : '')
const sessionId = computed(() => typeof route.query.session_id === 'string' ? route.query.session_id : '')
const range = computed(() => dateRangeFromQuery(route.query.dateStart, route.query.dateEnd, resolvePreset('30d')))
const backTo = computed(() => memberWorkReturnDestination(memberId.value, range.value.start, range.value.end))
const valid = computed(() => Boolean(memberId.value.trim() && sessionId.value.trim()))
</script>

<template>
  <p v-if="isOwner && !valid" role="alert">{{ t('team.workDetailInvalid') }}</p>
  <MemberWorkDetailShell v-else-if="isOwner" kind="session" :identifier="sessionId" :back-to="backTo" />
  <p v-else role="alert">{{ t('team.ownerOnly') }}</p>
</template>
