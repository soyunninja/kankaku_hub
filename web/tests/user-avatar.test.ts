import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Plain Vitest does not install a Vue SFC transformer; guard the wiring here
// without changing the shared test configuration for one component.
const header = readFileSync(resolve(process.cwd(), 'app/components/app-shell/Header.vue'), 'utf8')
const avatar = readFileSync(resolve(process.cwd(), 'app/components/ui/avatar/Avatar.vue'), 'utf8')

describe('user avatar wiring', () => {
  it('uses the SDK for nonempty auth-record filenames and passes the identity to Avatar', () => {
    expect(header).toContain('user.value?.avatar?.trim()')
    expect(header).toContain('if (!user.value || !filename) return')
    expect(header).toContain('$pb.files.getURL(user.value, filename)')
    expect(header).toMatch(/<Avatar[^>]*:src="avatarUrl"[^>]*:reset-key="user\?\.id"/)
  })

  it('falls back to initials on missing or failed images and retries on URL or identity change', () => {
    expect(avatar).toContain('!!props.src && !imageFailed.value')
    expect(avatar).toContain('watch([() => props.src, () => props.resetKey]')
    expect(avatar).toContain('@error="imageFailed = true"')
    expect(avatar).toContain('v-if="showImage"')
    expect(avatar).toContain('<template v-else>{{ initials(label) }}</template>')
    expect(avatar).toContain('alt=""')
  })
})
