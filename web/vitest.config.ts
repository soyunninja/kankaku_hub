import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors Nuxt's own default aliases (both `@` and `~` resolve to
      // `srcDir`, i.e. `app/`) — needed so composables under
      // `app/composables/**` (which use the `~/...` import style) can be
      // imported directly from a plain-vitest test, not just `app/lib/**`
      // files (which only ever used `@`/relative imports before).
      '@': fileURLToPath(new URL('./app', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['app/lib/**/*.ts'],
    },
  },
})
