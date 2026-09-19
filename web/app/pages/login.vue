<script setup lang="ts">
import { Gauge, Loader2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const { login } = useAuth()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  loading.value = true
  try {
    await login(email.value, password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.push(redirect)
  }
  catch {
    error.value = t('login.error')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <Card class="w-full max-w-sm">
    <CardHeader class="items-center gap-2 pb-4 text-center">
      <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Gauge class="size-5" />
      </div>
      <CardTitle class="text-base text-foreground">
        {{ t('app.name') }}
      </CardTitle>
      <CardDescription>{{ t('login.subtitle') }}</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
        <div class="flex flex-col gap-1.5">
          <Label for="email">{{ t('login.email') }}</Label>
          <Input id="email" v-model="email" type="email" autocomplete="username" required />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="password">{{ t('login.password') }}</Label>
          <Input id="password" v-model="password" type="password" autocomplete="current-password" required />
        </div>
        <p v-if="error" class="text-sm text-destructive">
          {{ error }}
        </p>
        <Button type="submit" :disabled="loading" class="mt-1">
          <Loader2 v-if="loading" class="size-4 animate-spin" />
          {{ t('login.submit') }}
        </Button>
      </form>
    </CardContent>
  </Card>
</template>
