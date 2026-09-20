/**
 * Reference data for the `/commands` screen: every `/kankaku` subcommand
 * exposed by the pi extension, kept as plain typed data so the page is a
 * thin presentational renderer over it (see app/pages/commands/index.vue).
 *
 * Source of truth for this list is kankaku's own code, not its README
 * prose alone — verified against:
 *   - src/adapters/kankaku-command.ts (COMMAND_TOKENS, HUB_COMMAND_TOKENS,
 *     TARGET_TOKENS, CATALOG_TOKENS, SYNC_TOKENS, and every handler)
 *   - src/config.ts (env var names/defaults)
 *   - README.md ("The `/kankaku` command", "Hub (PocketBase)", "Sync",
 *     "Export", "Environment variables")
 *
 * Do not add a command or flag here that the handler code above does not
 * actually implement (e.g. there is no `sync --since`).
 */

export type CommandGroup = 'reports' | 'clientTarget' | 'hub' | 'export'

export const COMMAND_GROUPS: CommandGroup[] = ['reports', 'clientTarget', 'hub', 'export']

export interface KankakuCommandDef {
  /** Stable, unique id — also the i18n leaf key under `commands.items.<id>`. */
  id: string
  /** Exact command syntax as typed inside pi, e.g. `/kankaku sync all`. */
  syntax: string
  group: CommandGroup
  /** Only offered by kankaku when a PocketBase hub is configured (HUB_COMMAND_TOKENS / TARGET_TOKENS / SYNC_TOKENS gates). */
  requiresHub: boolean
}

export const KANKAKU_COMMANDS: KankakuCommandDef[] = [
  // Reports — no hub required.
  { id: 'summary-today', syntax: '/kankaku', group: 'reports', requiresHub: false },
  { id: 'summary-all', syntax: '/kankaku all', group: 'reports', requiresHub: false },
  { id: 'tasks', syntax: '/kankaku tasks', group: 'reports', requiresHub: false },
  { id: 'tasks-all', syntax: '/kankaku tasks all', group: 'reports', requiresHub: false },
  { id: 'sessions', syntax: '/kankaku sessions', group: 'reports', requiresHub: false },
  { id: 'sessions-all', syntax: '/kankaku sessions all', group: 'reports', requiresHub: false },
  { id: 'clients', syntax: '/kankaku clients', group: 'reports', requiresHub: false },
  { id: 'clients-all', syntax: '/kankaku clients all', group: 'reports', requiresHub: false },
  // Reports — hub-gated (HUB_COMMAND_TOKENS).
  { id: 'projects', syntax: '/kankaku projects', group: 'reports', requiresHub: true },
  { id: 'projects-all', syntax: '/kankaku projects all', group: 'reports', requiresHub: true },

  // Client & target.
  { id: 'client-show', syntax: '/kankaku client', group: 'clientTarget', requiresHub: false },
  { id: 'client-set', syntax: '/kankaku client <name>', group: 'clientTarget', requiresHub: false },
  { id: 'client-clear', syntax: '/kankaku client --clear', group: 'clientTarget', requiresHub: false },
  { id: 'target-show', syntax: '/kankaku target', group: 'clientTarget', requiresHub: true },
  { id: 'target-pick', syntax: '/kankaku target pick', group: 'clientTarget', requiresHub: true },
  { id: 'target-clear', syntax: '/kankaku target clear', group: 'clientTarget', requiresHub: true },

  // Hub.
  { id: 'catalog-refresh', syntax: '/kankaku catalog refresh', group: 'hub', requiresHub: true },
  { id: 'sync', syntax: '/kankaku sync', group: 'hub', requiresHub: true },
  { id: 'sync-all', syntax: '/kankaku sync all', group: 'hub', requiresHub: true },
  { id: 'sync-status', syntax: '/kankaku sync status', group: 'hub', requiresHub: true },
  { id: 'backfill', syntax: '/kankaku backfill', group: 'hub', requiresHub: true },

  // Export — no hub required.
  { id: 'export', syntax: '/kankaku export [csv|json] [all]', group: 'export', requiresHub: false },
]

/** kankaku environment variables (see src/config.ts and README.md "Environment variables"). */
export interface KankakuEnvVarDef {
  name: string
  default: string
  /** i18n leaf key under `commands.config.env.<i18nKey>` for the human-readable meaning. */
  i18nKey: string
}

export const KANKAKU_ENV_VARS: KankakuEnvVarDef[] = [
  { name: 'KANKAKU_DIR', default: '.kankaku', i18nKey: 'dir' },
  { name: 'KANKAKU_INTERACTIVE_TOOLS', default: 'ask_user_question,ask_user_choice', i18nKey: 'interactiveTools' },
  { name: 'KANKAKU_SEGMENTS', default: 'review=bash:\\bgentle-ai review\\b', i18nKey: 'segments' },
  { name: 'KANKAKU_CLIENT', default: '(unset)', i18nKey: 'client' },
  { name: 'KANKAKU_PB_URL', default: '(unset)', i18nKey: 'pbUrl' },
  { name: 'KANKAKU_PB_EMAIL', default: '(unset)', i18nKey: 'pbEmail' },
  { name: 'KANKAKU_PB_PASSWORD', default: '(unset)', i18nKey: 'pbPassword' },
  { name: 'KANKAKU_MACHINE', default: 'OS hostname', i18nKey: 'machine' },
  { name: 'KANKAKU_SYNC_PROMPT', default: 'none', i18nKey: 'syncPrompt' },
  { name: 'KANKAKU_SYNC_WINDOW_HOURS', default: '24', i18nKey: 'syncWindowHours' },
  { name: 'KANKAKU_SYNC_RECORDS', default: '1 (enabled)', i18nKey: 'syncRecords' },
  { name: 'KANKAKU_SYNC_AUTO', default: '1 (enabled)', i18nKey: 'syncAuto' },
  { name: 'KANKAKU_SYNC_MIN_INTERVAL_MINUTES', default: '5', i18nKey: 'syncMinInterval' },
]

/** A command with its already-localized searchable text, for {@link filterCommands}. */
export interface SearchableCommand extends KankakuCommandDef {
  description: string
  whenToUse: string
}

/**
 * Client-side text filter for the commands reference: matches the
 * syntax or either localized description field, case-insensitively.
 * An empty/whitespace-only query returns every command unchanged.
 */
export function filterCommands<T extends SearchableCommand>(commands: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return commands
  return commands.filter(c =>
    c.syntax.toLowerCase().includes(q)
    || c.description.toLowerCase().includes(q)
    || c.whenToUse.toLowerCase().includes(q),
  )
}
