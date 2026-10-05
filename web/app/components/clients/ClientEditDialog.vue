<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { useClientEditor } from '@/composables/useClientEditor'

const props = defineProps<{ editor: ReturnType<typeof useClientEditor> }>()
const { t } = useI18n()
const { canWrite } = useAuth()
const { dialogOpen, editing, form, fieldErrors, saving, onWebsiteBlur, onSubmit } = props.editor
function onOpenChange(open: boolean) {
  if (!open) props.editor.close()
}
</script>

<template>
  <Dialog :open="dialogOpen" @update:open="onOpenChange">
    <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ editing ? t('clients.edit') : t('clients.new') }}</DialogTitle>
      </DialogHeader>
      <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
        <div class="flex flex-col gap-1.5">
          <Label for="c-name">{{ t('common.name') }}</Label>
          <Input id="c-name" v-model="form.name" required />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="c-code">{{ t('common.code') }}</Label>
          <Input id="c-code" v-model="form.code" required />
          <p class="text-xs text-muted-foreground">
            {{ t('clients.codeHint') }}
          </p>
        </div>
        <label class="flex items-center gap-2 text-sm">
          <Switch v-model="form.active" />
          {{ t('common.active') }}
        </label>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <Label for="c-website">{{ t('clients.website') }}</Label>
            <Input
              id="c-website"
              v-model="form.website"
              type="url"
              placeholder="https://example.com"
              :aria-invalid="!!fieldErrors.website"
              @blur="onWebsiteBlur"
              @input="delete fieldErrors.website"
            />
            <p v-if="fieldErrors.website" class="text-xs text-destructive">
              {{ fieldErrors.website }}
            </p>
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="c-contact-email">{{ t('clients.contactEmail') }}</Label>
            <Input
              id="c-contact-email"
              v-model="form.contact_email"
              type="email"
              :aria-invalid="!!fieldErrors.contact_email"
              @input="delete fieldErrors.contact_email"
            />
            <p v-if="fieldErrors.contact_email" class="text-xs text-destructive">
              {{ fieldErrors.contact_email }}
            </p>
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="c-contact-phone">{{ t('clients.contactPhone') }}</Label>
            <Input
              id="c-contact-phone"
              v-model="form.contact_phone"
              type="tel"
              :aria-invalid="!!fieldErrors.contact_phone"
              @input="delete fieldErrors.contact_phone"
            />
            <p v-if="fieldErrors.contact_phone" class="text-xs text-destructive">
              {{ fieldErrors.contact_phone }}
            </p>
          </div>
          <div class="flex flex-col gap-1.5 md:col-span-2">
            <Label for="c-notes">{{ t('clients.notes') }}</Label>
            <Textarea id="c-notes" v-model="form.notes" rows="4" />
            <p class="text-xs text-muted-foreground">
              {{ t('clients.notesHint') }}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="submit" :disabled="saving || !canWrite || !!editing?.unassigned">
            {{ t('common.save') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
