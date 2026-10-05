import { describe, expect, it, vi } from 'vitest'
import { resolvePocketBaseUrl } from '../app/lib/pocketbase-url'
import PocketBase from 'pocketbase'
import { readFileSync } from 'node:fs'

describe('PocketBase browser URL', () => {
  it.each([
    'http://localhost:3000/',
    'http://localhost:3000/clients/example',
    'https://macbook-air.tailef2f3.ts.net:8443/organizacion',
    'https://hub.example.com/projects/example/',
  ])('uses the absolute browser origin at %s', (page) => {
    const origin = new URL(page).origin
    const base = resolvePocketBaseUrl('', origin)
    expect(base).toBe(origin)
    expect(new PocketBase(base).buildURL('/api/health')).toBe(`${origin}/api/health`)
  })

  it('preserves an explicit backend override including its path', () => {
    expect(resolvePocketBaseUrl('https://backend.example.com/pb', 'http://localhost:3000'))
      .toBe('https://backend.example.com/pb')
  })
})

describe('development proxy configuration', () => {
  it('wires the client to origin resolution without a development loopback fallback', () => {
    const plugin = readFileSync('app/plugins/pocketbase.client.ts', 'utf8')
    expect(plugin).toContain('resolvePocketBaseUrl(config.public.pbUrl, window.location.origin)')
    expect(plugin).not.toContain('import.meta.dev')
    expect(plugin).not.toContain('http://127.0.0.1:8090')
  })

  it('keeps the API path and static production settings without a public proxy', async () => {
    vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
    try {
      const { default: config } = await import('../nuxt.config')
      expect(config.nitro.devProxy).toEqual({
        '/api': { target: 'http://127.0.0.1:8090/api', changeOrigin: true },
      })
      expect(config.ssr).toBe(false)
      expect(config.nitro.prerender).toEqual({ crawlLinks: false, routes: ['/'] })
      expect(config.runtimeConfig.public.pbUrl).toBe('')
      expect(config.vite.server.allowedHosts).toEqual(['macbook-air.tailef2f3.ts.net'])
      expect(config.nitro).not.toHaveProperty('routeRules')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
