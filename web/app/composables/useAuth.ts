import { canWrite as roleCanWrite } from '~/lib/roles'
import type { UserRecord } from '~/lib/pocketbase-types'

/**
 * Thin wrapper around PocketBase's own authStore (which already persists
 * to localStorage and knows the token's `exp`). The reactive state itself
 * lives in the `pocketbase.client` plugin (registered once); this
 * composable exposes it plus the login/logout/refresh actions.
 */
export function useAuth() {
  const { $pb } = useNuxtApp()
  const isAuthenticated = useState<boolean>('auth:isAuthenticated', () => $pb.authStore.isValid)
  const user = useState<UserRecord | null>('auth:user', () => $pb.authStore.record as unknown as UserRecord | null)
  const ready = useState<boolean>('auth:ready', () => false)

  /** True only for the `owner` role — see `app/lib/roles.ts#canWrite`.
   * Every write control (new/edit/archive/delete buttons and dialogs)
   * across the app is gated on this, never on its inverse, so an unknown
   * or future role (e.g. `viewer`, or `service` if it ever reached the
   * web app) defaults to read-only. */
  const canWrite = computed(() => roleCanWrite(user.value?.role))
  /** Same value as `canWrite` today (only `owner` can write) — kept as
   * its own name for call sites that read as an ownership check rather
   * than a write-permission check (e.g. `clients/index.vue`'s
   * pre-existing local `isOwner`, now migrated to this composable). */
  const isOwner = computed(() => user.value?.role === 'owner')

  async function login(email: string, password: string) {
    await $pb.collection('users').authWithPassword(email, password)
  }

  function logout() {
    $pb.authStore.clear()
  }

  /**
   * Validate the persisted token against the server once on app boot
   * (docs/contract.md: "on 401, re-authenticate once ... if that also
   * fails, stop and surface the error" — here there are no stored
   * credentials to silently retry with, so an invalid token just clears
   * itself and the auth guard sends the user back to /login).
   */
  async function ensureFreshSession() {
    if (ready.value) return
    if ($pb.authStore.isValid) {
      try {
        await $pb.collection('users').authRefresh()
      }
      catch {
        $pb.authStore.clear()
      }
    }
    ready.value = true
  }

  return {
    isAuthenticated,
    user,
    ready,
    canWrite,
    isOwner,
    login,
    logout,
    ensureFreshSession,
  }
}
