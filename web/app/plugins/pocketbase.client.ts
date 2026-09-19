import PocketBase from 'pocketbase'
import type { UserRecord } from '~/lib/pocketbase-types'

/**
 * Single PocketBase client for the whole app. Base URL resolution:
 * - `NUXT_PUBLIC_PB_URL` when set (any environment).
 * - In `nuxt dev` with no override: `http://127.0.0.1:8090` (scripts/dev.sh
 *   default), since the Nuxt dev server runs on its own port.
 * - Otherwise (the production static build, served BY PocketBase itself
 *   via --publicDir): `window.location.origin` — see docs/proposal.md
 *   §9.1. Deliberately NOT an empty string/relative base: the PocketBase
 *   SDK builds request URLs like `api/collections/...` (no leading
 *   slash), which the browser resolves against the *current page path*,
 *   not the origin root. From a deep-linked or client-routed path that
 *   isn't exactly `/`, that silently produces wrong URLs (e.g.
 *   `/clients/api/...`). An absolute origin sidesteps that class of bug
 *   entirely.
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const baseUrl = config.public.pbUrl || (import.meta.dev ? 'http://127.0.0.1:8090' : window.location.origin)

  const pb = new PocketBase(baseUrl)
  pb.autoCancellation(false)

  // One shared auth state for the whole app, kept in sync with
  // PocketBase's own authStore (itself backed by localStorage).
  const isAuthenticated = useState<boolean>('auth:isAuthenticated', () => pb.authStore.isValid)
  const user = useState<UserRecord | null>('auth:user', () => pb.authStore.record as unknown as UserRecord | null)

  pb.authStore.onChange(() => {
    isAuthenticated.value = pb.authStore.isValid
    user.value = pb.authStore.record as unknown as UserRecord | null
  }, false)

  return {
    provide: { pb },
  }
})
