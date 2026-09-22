/**
 * Pure role helpers for the `viewer` read-only role (odd/tasks/viewer-role.md
 * T2). `HubRole` mirrors `pocketbase-types.ts#UserRole` plus `'viewer'` —
 * kept as a separate literal type here (rather than importing `UserRole`)
 * so this module stays a dependency-free pure helper the way every other
 * `app/lib/*.ts` file is, and so a role value coming back from the API as
 * a bare string (e.g. `user.value?.role`) can be checked without a cast.
 *
 * `service` never logs into the web (it's kankaku's sync account), but it
 * is included here for completeness and because it is a real
 * `users.role` value the server can send back.
 */
export type HubRole = 'owner' | 'service' | 'viewer'

/** True only for the `owner` role — every write control in the web app is
 * gated on this, never on the inverse (`!isReadOnlyRole`), so an unknown
 * or future role defaults to read-only rather than accidentally gaining
 * write access. */
export function canWrite(role: string | undefined): boolean {
  return role === 'owner'
}

/** True for the `viewer` role — drives the header's read-only badge. */
export function isReadOnlyRole(role: string | undefined): boolean {
  return role === 'viewer'
}
