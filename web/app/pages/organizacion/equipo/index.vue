<script setup lang="ts">
import { legacyTeamRedirect } from '@/components/team/routes'
const route = useRoute()
const destination = legacyTeamRedirect(route.path, route.query, route.hash)
if (destination) await navigateTo(destination, { replace: true })
</script>

<template><div /></template>
