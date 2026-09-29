/**
 * Typed registry of the coding agents the hub can identify by icon, keyed
 * by the `agent` slug (`entry.agent` / `SessionSummary.agent`, see
 * `app/lib/pocketbase-types.ts`). Pure — no Vue, no i18n calls — same rule
 * as `app/lib/measurement-quality.ts`, importable from plain Vitest.
 *
 * To add an agent: drop its icon file under `web/public/agents/` (see
 * `web/public/agents/README.md` for provenance/background rules), then add
 * one entry to `AGENTS` below.
 */

export type AgentBackground = 'white' | 'own'

export interface AgentDefinition {
  /** Registry key, always lowercase (see `resolveAgent`). */
  slug: string
  /** Product name, e.g. `"pi"`, `"OpenCode"` — never translated. */
  label: string
  /** Path under `/agents/`, e.g. `"/agents/pi.svg"`. */
  icon: string
  /**
   * `'white'` — the icon is a dark glyph on transparent and needs a white
   * disc behind it to stay legible on the dark theme.
   * `'own'` — the icon brings its own background and fills the disc.
   */
  background: AgentBackground
}

/**
 * Registry keys are lowercase. `entry.agent` is documented as "lowercase
 * slug", but `resolveAgent` still lowercases its input before lookup — a
 * defensive normalization for seeded/legacy data that may not honor that
 * contract, at no cost to the (already-lowercase) common case.
 */
export const AGENTS: Readonly<Record<string, AgentDefinition>> = {
  pi: {
    slug: 'pi',
    label: 'pi',
    icon: '/agents/pi.svg',
    background: 'white',
  },
  opencode: {
    slug: 'opencode',
    label: 'OpenCode',
    icon: '/agents/opencode.png',
    background: 'own',
  },
  'claude-code': {
    slug: 'claude-code',
    label: 'Claude Code',
    icon: '/agents/claude-code.svg',
    background: 'white',
  },
}

/**
 * Resolves a raw `agent` slug to its registry definition. Returns
 * `undefined` for an empty, whitespace-only, undefined/null, or unknown
 * slug — the caller (`AgentIcon`/`AgentBadge`) renders the generic-glyph
 * fallback in that case, never a broken image or an empty gap.
 */
export function resolveAgent(slug: string | undefined | null): AgentDefinition | undefined {
  const key = slug?.trim().toLowerCase()
  if (!key) return undefined
  return AGENTS[key]
}
