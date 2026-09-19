export default defineNuxtRouteMiddleware(async (to) => {
  // Static SPA (ssr: false) — this only ever runs client-side.
  const { isAuthenticated, ensureFreshSession } = useAuth()

  await ensureFreshSession()

  const isLoginPage = to.path === '/login'

  if (!isAuthenticated.value && !isLoginPage) {
    return navigateTo({ path: '/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : undefined })
  }

  if (isAuthenticated.value && isLoginPage) {
    const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '/'
    return navigateTo(redirect)
  }
})
