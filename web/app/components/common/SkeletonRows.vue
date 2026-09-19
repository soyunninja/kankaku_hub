<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'

withDefaults(defineProps<{ rows?: number, cols?: number }>(), { rows: 5, cols: 4 })
</script>

<template>
  <tr v-for="r in rows" :key="r" class="border-b border-border">
    <td v-for="c in cols" :key="c" class="p-3">
      <Skeleton class="h-4 w-full" />
    </td>
  </tr>
</template>
