import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Static SPA: no server-side rendering. `nuxt generate` produces plain
  // static files that PocketBase serves via --publicDir (see
  // scripts/dev.sh and README). During `nuxt dev` the app talks to the
  // PocketBase API over NUXT_PUBLIC_PB_URL; in the production build the
  // base URL defaults to same-origin.
  ssr: false,

  // Pure client-routed SPA: prerender only the shell at `/`. With
  // ssr:false every per-route HTML file nitro would otherwise generate
  // (crawlLinks) is an identical empty shell anyway, and having e.g. a
  // `login/index.html` on disk makes PocketBase's static server treat
  // `/login` as a directory and 301-redirect to `/login/` — which then
  // breaks the PocketBase SDK's same-origin relative request URLs
  // (`api/...` resolves under the trailing-slash "directory"). PocketBase
  // already serves `index.html` as a 200 SPA fallback for any path with
  // no matching file, which is exactly what a client-routed SPA needs.
  nitro: {
    prerender: {
      crawlLinks: false,
      routes: ['/'],
    },
  },

  modules: [
    '@nuxt/eslint',
    '@nuxtjs/color-mode',
    '@nuxtjs/i18n',
    'shadcn-nuxt',
  ],

  css: ['~/assets/css/tailwind.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  colorMode: {
    preference: 'dark',
    fallback: 'dark',
    classSuffix: '',
    storageKey: 'kankaku-color-mode',
  },

  i18n: {
    baseUrl: '/',
    defaultLocale: 'es',
    strategy: 'no_prefix',
    // Spanish is the hard default (owner requirement). No automatic
    // browser-language detection — only an explicit choice through the
    // locale switcher (persisted to localStorage, see
    // app/plugins/locale.client.ts) ever changes it.
    detectBrowserLanguage: false,
    locales: [
      { code: 'es', language: 'es-ES', name: 'Español', file: 'es.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'ja', language: 'ja-JP', name: '日本語', file: 'ja.json' },
    ],
    langDir: 'locales/',
  },

  shadcn: {
    prefix: '',
    componentDir: '@/components/ui',
  },

  runtimeConfig: {
    public: {
      // Same-origin in production (empty string -> relative /api calls);
      // override with NUXT_PUBLIC_PB_URL for `nuxt dev` against a
      // PocketBase instance running on a different port.
      pbUrl: '',
      appVersion: '0.3.9',
    },
  },

  app: {
    head: {
      title: 'kankaku hub',
      htmlAttrs: { lang: 'es' },
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    },
  },

  eslint: {
    config: {
      stylistic: false,
    },
  },
})
