/**
 * Builds the shell command an owner can copy/paste to resume a kankaku
 * session on the machine that ran it, from a `task_entries`-shaped
 * session summary. Pure string logic — no shelling out, no dependency on
 * any quoting library, so it can run unmodified in the browser.
 */

export interface SessionResumeInput {
  sessionId: string
  /** Absolute repo path on the machine that ran the session; empty/undefined when unknown. */
  repoProject?: string
  /** Lowercase agent slug (e.g. `"pi"`); empty/undefined on legacy rows that predate the `agent` field. */
  agent?: string
}

export type SessionResumeReason = 'no-session' | 'unsupported-agent'

export type SessionResumeResult =
  | { ok: true, command: string }
  | { ok: false, reason: SessionResumeReason }

/**
 * Wraps a value in single quotes for POSIX shells, escaping any embedded
 * single quote as `'\''` (close the quote, emit an escaped quote, reopen
 * the quote). Safe for spaces, double quotes, `$`, backticks, semicolons,
 * newlines and a trailing backslash — none of those are special inside a
 * single-quoted string, and the only character that needs handling is
 * the single quote itself.
 */
function shellQuoteSingle(value: string): string {
  return `'${value.replace(/'/g, '\'\\\'\'')}'`
}

type ResumeBuilder = (input: { sessionId: string, repoProject?: string }) => SessionResumeResult

/**
 * Per-agent resume command builders. A later agent (not `"pi"`/empty)
 * gets its own entry here with its own resume syntax — this table is the
 * seam for that, so `buildResumeCommand` itself never grows an if/else
 * chain per agent.
 */
const RESUME_BUILDERS: Record<string, ResumeBuilder> = {
  pi: ({ sessionId, repoProject }) => {
    const quotedSession = shellQuoteSingle(sessionId)
    const command = repoProject
      ? `cd ${shellQuoteSingle(repoProject)} && pi --session ${quotedSession}`
      : `pi --session ${quotedSession}`
    return { ok: true, command }
  },
}

/** Rows written before the `agent` field existed have no value here; treat them like `"pi"`. */
const LEGACY_AGENT_KEY = 'pi'

/**
 * Builds the resume command for a session, or explains why one isn't
 * available. Never throws — an unrecognised agent is reported via the
 * `unsupported-agent` reason, not an exception.
 */
export function buildResumeCommand(input: SessionResumeInput): SessionResumeResult {
  if (!input.sessionId) return { ok: false, reason: 'no-session' }

  const agentKey = input.agent && input.agent.trim() ? input.agent.trim() : LEGACY_AGENT_KEY
  const builder = RESUME_BUILDERS[agentKey]
  if (!builder) return { ok: false, reason: 'unsupported-agent' }

  return builder({ sessionId: input.sessionId, repoProject: input.repoProject })
}
