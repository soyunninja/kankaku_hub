import {
  formatCost,
  formatDate,
  formatDateTime,
  formatDelta,
  formatDuration,
  formatDurationCompact,
  formatPercent,
  formatTokens,
  formatTokensCompact,
} from '@/lib/format'

/**
 * Maps this app's i18n locale codes (`es`/`en`/`ja`, see nuxt.config.ts)
 * to the `Intl`-flavored BCP 47 tags the pure formatters in `lib/format.ts`
 * expect. Falls back to the code itself for any locale not listed here,
 * so a future addition still gets *some* locale-aware formatting rather
 * than silently defaulting to English.
 */
const INTL_LOCALE_BY_CODE: Record<string, string> = {
  es: 'es-ES',
  en: 'en-US',
  ja: 'ja-JP',
}

/**
 * Locale-aware wrappers around `lib/format.ts`'s pure formatters, bound to
 * the app's active i18n locale so call sites never have to thread
 * `locale.value` through by hand. `lib/format.ts` itself stays free of any
 * i18n import (it must stay importable from plain Vitest, see its module
 * comment) — this composable is the one place that bridges the two.
 *
 * `formatCost` is intentionally NOT re-exported here: cost is always USD
 * with a `$` prefix regardless of UI locale (D8 — no rates/prices, this is
 * a measured cost), so it never needs the active locale.
 */
export function useFormatters() {
  const { locale } = useI18n()
  const intlLocale = computed(() => INTL_LOCALE_BY_CODE[locale.value] ?? locale.value)

  return {
    formatCost,
    formatDuration: (ms: number) => formatDuration(ms, intlLocale.value),
    formatDurationCompact: (ms: number) => formatDurationCompact(ms, intlLocale.value),
    formatDate: (value: string) => formatDate(value, intlLocale.value),
    formatDateTime: (value: string) => formatDateTime(value, intlLocale.value),
    formatTokens: (count: number) => formatTokens(count, intlLocale.value),
    formatTokensCompact: (count: number) => formatTokensCompact(count, intlLocale.value),
    formatPercent: (ratio: number) => formatPercent(ratio, intlLocale.value),
    formatDelta,
  }
}
