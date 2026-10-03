import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Read metadata without importing Nuxt config or coupling isolated web stacks
// to a root package file that is not copied into their runtime directory.
// Vitest runs with cwd=web/; happy-dom's import.meta.url is not a file URL.
const config = readFileSync(resolve(process.cwd(), 'nuxt.config.ts'), 'utf8')
const hubPackage = JSON.parse(readFileSync(resolve(process.cwd(), '../package.json'), 'utf8')) as { version: string }

describe('hub release version', () => {
  it('keeps the public appVersion literal aligned with the hub package', () => {
    const appVersion = config.match(/\bappVersion:\s*['"]([^'"]+)['"]/)?.[1]
    expect(appVersion).toBe(hubPackage.version)
  })
})
