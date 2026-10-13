<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useClientWorkAttribution } from '@/composables/useClientWorkAttribution'
import type { TaskEntryRecord } from '@/lib/pocketbase-types'

const props = defineProps<{ clientId: string, projectId?: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ attributed: [] }>()
const { t, locale } = useI18n()
const { formatDateTime, formatDuration } = useFormatters()
const attribution = useClientWorkAttribution({ clientId: toRef(props, 'clientId'), projectId: toRef(props, 'projectId'), open })
const { rows, page, totalPages, selectedIds, memberId, members, departments, previewResult, busy, error, eligible } = attribution
watch(open, value => { if (value && eligible.value) void attribution.loadPage(1) })
watch(() => [props.clientId, props.projectId], () => { if (open.value && eligible.value) void attribution.loadPage(1) }, { flush: 'sync' })
const memberOptions = computed(() => members.value.map(member => {
  const department = departments.value.find(row => row.id === member.department)?.name
  const inactive = !member.active ? ` · ${t('common.inactive')}` : ''
  return { value: member.id, label: `${member.name}${department ? ` · ${department}` : ''}${inactive}` }
}).sort((a, b) => a.label.localeCompare(b.label, locale.value)))
function title(entry: TaskEntryRecord) { return entry.expand?.task?.title || entry.session_name || entry.id }
function project(entry: TaskEntryRecord) { return entry.expand?.project?.name || entry.project || t('clients.detail.attributionUnknownProject') }
function toggle(entry: TaskEntryRecord, event: Event) { attribution.toggle(entry.id, (event.target as HTMLInputElement).checked) }
function requestOpenChange(next: boolean) { if (!next && busy.value) return; open.value = next }
async function confirm() { if (await attribution.apply()) emit('attributed') }
function clearAndReload() { attribution.selectedIds.value = []; attribution.memberId.value = ''; attribution.previewResult.value = null; void attribution.loadPage(1) }
</script>

<template>
  <Dialog :open="open" @update:open="requestOpenChange">
    <DialogContent :show-close-button="!busy" class="max-h-[90vh] overflow-y-auto sm:max-w-3xl" @escape-key-down="busy ? $event.preventDefault() : undefined" @pointer-down-outside="busy ? $event.preventDefault() : undefined">
      <DialogHeader>
        <DialogTitle>{{ t('clients.detail.attributionTitle') }}</DialogTitle>
        <DialogDescription>{{ t('clients.detail.attributionDescription') }}</DialogDescription>
      </DialogHeader>
      <div class="space-y-4">
        <div class="space-y-2">
          <Label for="attribution-member">{{ t('clients.detail.attributionMember') }}</Label>
          <Select id="attribution-member" v-model="memberId" :aria-label="t('clients.detail.attributionMember')" :options="memberOptions" :disabled="busy" />
        </div>
        <p role="status" class="text-sm text-muted-foreground">{{ t('clients.detail.attributionHistoricalNotice') }}</p>
        <p v-if="error" role="alert" class="text-sm text-destructive">{{ t(`clients.detail.attributionError.${error}`) }}</p>
        <p v-if="busy" role="status" class="text-sm">{{ t('common.loading') }}</p>
        <div class="space-y-2">
          <p class="text-sm font-medium">{{ t('clients.detail.attributionSelected', { count: selectedIds.length }) }}</p>
          <ul class="max-h-72 space-y-2 overflow-y-auto">
            <li v-for="entry in rows" :key="entry.id" class="flex min-w-0 items-start gap-3 rounded-md border border-border p-3">
              <input :id="`attribution-${entry.id}`" type="checkbox" class="mt-1 size-5 shrink-0 accent-primary" :checked="selectedIds.includes(entry.id)" :disabled="busy" :aria-label="t('clients.detail.attributionSelectEntry', { title: title(entry), id: entry.id })" @change="toggle(entry, $event)">
              <label :for="`attribution-${entry.id}`" class="min-w-0 flex-1 cursor-pointer text-sm">
                <span class="block font-medium [overflow-wrap:anywhere]">{{ title(entry) }}</span>
                <span class="block text-muted-foreground">{{ formatDateTime(entry.started_at) }} · {{ project(entry) }} · {{ formatDuration(entry.work_ms) }}</span>
                <span class="block text-xs text-muted-foreground">{{ entry.machine || t('clients.detail.attributionUnknownMachine') }} · {{ t('clients.detail.attributionEntryId', { id: entry.id }) }}</span>
              </label>
            </li>
            <li v-if="!rows.length && !busy" class="py-4 text-sm text-muted-foreground">{{ t('clients.detail.attributionNoRows') }}</li>
          </ul>
          <div class="flex items-center justify-between gap-3">
            <Button variant="outline" :disabled="busy || page <= 1" @click="attribution.loadPage(page - 1)">{{ t('common.previous') }}</Button>
            <span class="text-sm tabular-nums">{{ t('clients.detail.attributionPage', { page, total: totalPages }) }}</span>
            <Button variant="outline" :disabled="busy || page >= totalPages" @click="attribution.loadPage(page + 1)">{{ t('common.next') }}</Button>
          </div>
          <p class="text-xs text-muted-foreground">{{ t('clients.detail.attributionPageSelectionNote') }}</p>
        </div>
        <section v-if="previewResult" aria-labelledby="attribution-preview-title" class="rounded-md border border-border p-4">
          <h3 id="attribution-preview-title" class="font-semibold">{{ t('clients.detail.attributionPreviewTitle') }}</h3>
          <p class="mt-2 text-sm">{{ t('clients.detail.attributionPreviewSummary', { member: memberOptions.find(option => option.value === memberId)?.label ?? memberId, count: previewResult.count }) }}</p>
          <p class="mt-2 text-sm text-muted-foreground">{{ t('clients.detail.attributionHistoricalNotice') }}</p>
        </section>
      </div>
      <DialogFooter class="gap-2 sm:gap-0">
        <Button variant="outline" :disabled="busy" @click="attribution.close()">{{ t('common.cancel') }}</Button>
        <Button v-if="!previewResult" :disabled="busy || !memberId || !selectedIds.length || selectedIds.length > 200" @click="attribution.preview()">{{ t('clients.detail.attributionPreview') }}</Button>
        <Button v-else :disabled="busy" @click="confirm">{{ t('clients.detail.attributionConfirm') }}</Button>
      </DialogFooter>
      <Button v-if="error === 'stale' || error === 'invalid'" variant="ghost" class="w-full" :disabled="busy" @click="clearAndReload">{{ t('clients.detail.attributionReselect') }}</Button>
    </DialogContent>
  </Dialog>
</template>
