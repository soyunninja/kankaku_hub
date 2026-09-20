import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { buildResumeCommand } from '../app/lib/session-resume'

describe('buildResumeCommand — normal paths', () => {
  it('builds a pi resume command with a repoProject', () => {
    const result = buildResumeCommand({ sessionId: 'sess-1', repoProject: '/home/dev/repos/app', agent: 'pi' })
    expect(result).toEqual({
      ok: true,
      command: 'cd \'/home/dev/repos/app\' && pi --session \'sess-1\'',
    })
  })

  it('builds a pi resume command without a repoProject (no cd prefix)', () => {
    const result = buildResumeCommand({ sessionId: 'sess-1', agent: 'pi' })
    expect(result).toEqual({ ok: true, command: 'pi --session \'sess-1\'' })
  })

  it('treats a legacy empty-agent row like pi', () => {
    const withUndefined = buildResumeCommand({ sessionId: 'sess-1', repoProject: '/repo' })
    const withEmpty = buildResumeCommand({ sessionId: 'sess-1', repoProject: '/repo', agent: '' })
    const withWhitespace = buildResumeCommand({ sessionId: 'sess-1', repoProject: '/repo', agent: '   ' })
    const explicit = buildResumeCommand({ sessionId: 'sess-1', repoProject: '/repo', agent: 'pi' })
    expect(withUndefined).toEqual(explicit)
    expect(withEmpty).toEqual(explicit)
    expect(withWhitespace).toEqual(explicit)
  })
})

describe('buildResumeCommand — sessionDir', () => {
  it('includes a shell-quoted --session-dir flag when sessionDir is set', () => {
    const result = buildResumeCommand({ sessionId: 'sess-1', sessionDir: '/home/dev/.pi/sessions/foo', agent: 'pi' })
    expect(result).toEqual({
      ok: true,
      command: 'pi --session-dir \'/home/dev/.pi/sessions/foo\' --session \'sess-1\'',
    })
  })

  it('is unchanged from prior behavior when sessionDir is absent (regression)', () => {
    const result = buildResumeCommand({ sessionId: 'sess-1', repoProject: '/home/dev/repos/app', agent: 'pi' })
    expect(result).toEqual({
      ok: true,
      command: 'cd \'/home/dev/repos/app\' && pi --session \'sess-1\'',
    })
  })

  it('combines repoProject (cd prefix) and sessionDir (--session-dir flag) correctly when both are present', () => {
    const result = buildResumeCommand({
      sessionId: 'sess-1',
      repoProject: '/home/dev/repos/app',
      sessionDir: '/home/dev/.pi/sessions/foo',
      agent: 'pi',
    })
    expect(result).toEqual({
      ok: true,
      command: 'cd \'/home/dev/repos/app\' && pi --session-dir \'/home/dev/.pi/sessions/foo\' --session \'sess-1\'',
    })
  })
})

describe('buildResumeCommand — failure paths', () => {
  it('reports no-session for an empty sessionId', () => {
    expect(buildResumeCommand({ sessionId: '', repoProject: '/repo', agent: 'pi' }))
      .toEqual({ ok: false, reason: 'no-session' })
  })

  it('reports unsupported-agent for an agent with no builder', () => {
    expect(buildResumeCommand({ sessionId: 'sess-1', agent: 'opencode' }))
      .toEqual({ ok: false, reason: 'unsupported-agent' })
  })

  it('never throws for an unsupported agent', () => {
    expect(() => buildResumeCommand({ sessionId: 'sess-1', agent: 'some-future-agent' })).not.toThrow()
  })
})

describe('buildResumeCommand — hostile quoting', () => {
  /**
   * Proves round-trip safety by actually parsing the generated command
   * with a real POSIX shell, not by re-implementing a quoting checker
   * that could share the same bug as the code under test. `pi`/`cd` are
   * shadowed as shell functions that echo their argv back out, so any
   * unescaped `'` that broke out of the quoted segment would show up as
   * extra/garbled shell syntax or a mismatched captured argument.
   */
  function runResumeCommand(command: string): { cdArg: string | undefined, sessionDirArg: string | undefined, sessionArg: string | undefined } {
    // Index-based extraction, not line-splitting: a hostile value may
    // itself contain embedded newlines, which line-splitting would
    // shred. Markers are fixed prefixes this harness controls, so a
    // plain indexOf is exact regardless of what's inside the value.
    const harness = [
      'pi() { for a in "$@"; do printf \'ARG:%s\\n\' "$a"; done; }',
      'cd() { printf \'CD:%s\\n\' "$1"; }',
      command,
    ].join('\n')
    const stdout = execFileSync('bash', ['-c', harness]).toString()

    const sessionMarker = 'ARG:--session\nARG:'
    const sessionStart = stdout.indexOf(sessionMarker)
    const sessionArg = sessionStart === -1
      ? undefined
      : stdout.slice(sessionStart + sessionMarker.length).replace(/\n$/, '')

    let cdArg: string | undefined
    if (stdout.startsWith('CD:')) {
      const cdEnd = stdout.indexOf('\nARG:--session')
      cdArg = stdout.slice('CD:'.length, cdEnd === -1 ? undefined : cdEnd)
    }

    const dirMarker = 'ARG:--session-dir\nARG:'
    const dirStart = stdout.indexOf(dirMarker)
    let sessionDirArg: string | undefined
    if (dirStart !== -1) {
      const dirValueStart = dirStart + dirMarker.length
      const dirEnd = stdout.indexOf('\nARG:--session\n', dirValueStart)
      sessionDirArg = stdout.slice(dirValueStart, dirEnd === -1 ? undefined : dirEnd)
    }

    return { cdArg, sessionDirArg, sessionArg }
  }

  const hostileValues = [
    'has \'single\' quotes',
    'has "double" quotes',
    '$(rm -rf /)',
    '`whoami`',
    'has spaces in it',
    'trailing-backslash\\',
    '; rm -rf / #',
    'newline\nin\nvalue',
  ]

  for (const hostile of hostileValues) {
    it(`quotes a hostile repoProject safely: ${JSON.stringify(hostile)}`, () => {
      const result = buildResumeCommand({ sessionId: 'sess-1', repoProject: hostile, agent: 'pi' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const { cdArg } = runResumeCommand(result.command)
      expect(cdArg).toBe(hostile)
    })

    it(`quotes a hostile sessionId safely: ${JSON.stringify(hostile)}`, () => {
      const result = buildResumeCommand({ sessionId: hostile, agent: 'pi' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const { sessionArg } = runResumeCommand(result.command)
      expect(sessionArg).toBe(hostile)
    })

    it(`quotes a hostile sessionDir safely: ${JSON.stringify(hostile)}`, () => {
      const result = buildResumeCommand({ sessionId: 'sess-1', sessionDir: hostile, agent: 'pi' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const { sessionDirArg, sessionArg } = runResumeCommand(result.command)
      expect(sessionDirArg).toBe(hostile)
      expect(sessionArg).toBe('sess-1')
    })
  }

  it('round-trips an embedded single quote exactly (closes, escapes, reopens)', () => {
    const result = buildResumeCommand({ sessionId: 'sess-1', repoProject: "it's-a-repo", agent: 'pi' })
    expect(result).toEqual({
      ok: true,
      command: 'cd \'it\'\\\'\'s-a-repo\' && pi --session \'sess-1\'',
    })
  })
})
