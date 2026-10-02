<script setup lang="ts">
import { Download } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

defineProps<{ disabled?: boolean, label?: string }>()
const emit = defineEmits<{ format: [format: 'csv' | 'xlsx'] }>()
const { t } = useI18n()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button type="button" variant="outline" :size="label ? 'sm' : 'icon-sm'" :disabled="disabled" :title="t('common.export')" :aria-label="t('common.export')">
        <Download aria-hidden="true" />
        <span v-if="label">{{ label }}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem @select="emit('format', 'csv')">CSV</DropdownMenuItem>
      <DropdownMenuItem @select="emit('format', 'xlsx')">XLSX</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
