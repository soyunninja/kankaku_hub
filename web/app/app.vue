<script setup lang="ts">
useHead({
  titleTemplate: (title) => title ? `${title} · kankaku hub` : 'kankaku hub',
})

/**
 * Persist the user's explicit locale choice across reloads. Spanish is
 * the hard default (no browser-language auto-detection, see
 * nuxt.config.ts's `i18n.detectBrowserLanguage: false`) — this only
 * restores a choice the user actually made through the locale switcher.
 */
const LOCALE_STORAGE_KEY = 'kankaku-locale'
const { locale, locales, setLocale } = useI18n()

onMounted(() => {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    const validCodes: string[] = locales.value.map(l => (typeof l === 'string' ? l : l.code))
    if (stored && validCodes.includes(stored) && stored !== locale.value) {
      setLocale(stored as 'es' | 'en')
    }
  }
  catch {
    // localStorage unavailable (private mode, etc.) — Spanish default stands.
  }
})

watch(locale, (value) => {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, value)
  }
  catch {
    // ignore
  }
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
