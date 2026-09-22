#!/usr/bin/env node
// Tiny, dependency-free stand-in for an `engram serve` daemon
// (odd/tasks/engram-narrative.md), used ONLY by
// `e2e/engram-narrative.spec.ts`'s "with Engram" test. Real PocketBase
// (`pocketbase/pb_hooks/engram.pb.js`) is what actually talks to this
// server — never the browser, which has no CORS story with the real
// daemon either (see the task doc's "Facts" section) — so this fixture's
// job is just to answer exactly the four endpoints the hook calls, the
// same way the real daemon would for a couple of known session ids.
//
// Configuration (env vars, both optional):
//   FAKE_ENGRAM_PORT     — listen port, default 7438.
//   FAKE_ENGRAM_SESSIONS — comma-separated "summaryId,promptId": the
//     first id gets a session_summary observation (Goal + Accomplished);
//     the second gets only a recent prompt, no summary at all — the two
//     shapes `engram-narrative.js#buildNarrative` distinguishes
//     ("source": "summary" vs "prompt"). Every other session id 404s.
//     Defaults to "fake-engram-summary-session,fake-engram-prompt-session"
//     when unset, so a bare smoke run (`node fake-engram.mjs`) still
//     answers something sensible.
//
// Usage (documented again at the top of engram-narrative.spec.ts):
//   FAKE_ENGRAM_SESSIONS=<summaryId>,<promptId> node e2e/fixtures/fake-engram.mjs
//
// No dependencies: plain node:http, so `node --check` and running it
// needs nothing installed beyond Node itself.
import http from 'node:http'

const PORT = Number(process.env.FAKE_ENGRAM_PORT) || 7438
const CONFIGURED_IDS = (process.env.FAKE_ENGRAM_SESSIONS || 'fake-engram-summary-session,fake-engram-prompt-session')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
const [SUMMARY_SESSION_ID, PROMPT_SESSION_ID] = CONFIGURED_IDS
const PROJECT = 'e2e-project'

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body)
  res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

function goalContentFor(sessionId) {
  return `## Goal\nE2E goal for ${sessionId}\n\n## Accomplished\n- did things`
}

function promptContentFor(sessionId) {
  return `E2E first prompt for ${sessionId}`
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }

  if (url.pathname === '/health') {
    sendJson(res, 200, {})
    return
  }

  const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)$/)
  if (sessionMatch) {
    const id = decodeURIComponent(sessionMatch[1])
    if (CONFIGURED_IDS.includes(id)) {
      sendJson(res, 200, {
        id,
        project: PROJECT,
        directory: '/tmp/e2e-engram-fixture',
        started_at: '2026-01-01T00:00:00.000Z',
      })
    }
    else {
      sendJson(res, 404, { error: 'session not found' })
    }
    return
  }

  if (url.pathname === '/observations') {
    // The real daemon ignores a `session_id` filter here — see the task
    // doc's Facts section — so this fixture does too: it always returns
    // every session_summary observation for the project, and the caller
    // (engram-narrative.js) filters client-side.
    const rows = SUMMARY_SESSION_ID
      ? [{
          id: 'fake-obs-1',
          session_id: SUMMARY_SESSION_ID,
          type: 'session_summary',
          title: `E2E summary for ${SUMMARY_SESSION_ID}`,
          content: goalContentFor(SUMMARY_SESSION_ID),
          created_at: '2026-01-01T00:05:00.000Z',
        }]
      : []
    sendJson(res, 200, { observations: rows })
    return
  }

  if (url.pathname === '/prompts/recent') {
    const rows = PROMPT_SESSION_ID
      ? [{
          id: 'fake-prompt-1',
          session_id: PROMPT_SESSION_ID,
          content: promptContentFor(PROMPT_SESSION_ID),
        }]
      : []
    sendJson(res, 200, { prompts: rows })
    return
  }

  sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fake-engram listening on http://127.0.0.1:${PORT} (sessions: ${CONFIGURED_IDS.join(', ') || '(none)'})`)
})
