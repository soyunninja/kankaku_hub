/**
 * The URL of the PocketBase hub this app actually talks to, read from the
 * live client rather than re-derived: the plugin is the single place that
 * decides between `NUXT_PUBLIC_PB_URL`, the `nuxt dev` default
 * (127.0.0.1:8090) and same-origin in the production build. Re-deriving it
 * elsewhere showed the web's own origin (localhost:3000) in dev.
 */
export function useHubUrl() {
  const { $pb } = useNuxtApp()
  return computed(() => String($pb.baseURL).replace(/\/+$/, ''))
}
