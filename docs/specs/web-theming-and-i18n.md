# Web theming and i18n

| | |
|---|---|
| Status | implemented |
| Phase | [phase-3-web](../phases/phase-3-web.md) |
| Owners repos | kankaku-hub |
| Related ADRs | none dedicated — implementation detail of [phase-3-web](../phases/phase-3-web.md) |
| Code | `web/nuxt.config.ts`, `web/app/components/app-shell/ThemeToggle.vue`, `web/app/components/app-shell/LocaleSwitcher.vue`, `web/i18n/locales/es.json`, `web/i18n/locales/en.json` |
| Tests | `web/tests/i18n.test.ts`, manual Playwright verification per `ESTADO.md` |

## Purpose

Dark-by-default theming with a persisted dark/light/system switch, and a
Spanish-default, English-secondary UI with no automatic browser-language
detection — both explicit owner requirements.

## Requirements

1. `THEME-REQ-001` — The default color mode SHALL be dark, with no flash of
   the wrong theme on a fresh profile (no prior `localStorage`).
2. `THEME-REQ-002` — The theme switcher SHALL offer dark, light, and system,
   persisting the choice to `localStorage` under a dedicated key.
3. `THEME-REQ-003` — The default locale SHALL be Spanish (`es`), and
   browser-language auto-detection SHALL be disabled — only an explicit
   choice through the locale switcher changes it.
4. `THEME-REQ-004` — The locale switcher SHALL offer Spanish and English,
   persisting the choice.
5. `THEME-REQ-005` — Every UI string SHALL be routed through the i18n
   translation function; no literal template text.
6. `THEME-REQ-006` — The two locale files SHALL stay key-for-key identical
   in structure, with no empty values.

## Scenarios

### Scenario: a fresh profile loads dark with no flash (`THEME-REQ-001`)

- **Given** a browser profile with no prior `localStorage` for this app
- **When** the app first loads
- **Then** the dark theme is applied on first paint, with no visible flash of a light theme first

### Scenario: locale never auto-detects from the browser (`THEME-REQ-003`)

- **Given** the browser's language is set to English
- **And** no prior locale choice is persisted
- **When** the app loads
- **Then** the UI is in Spanish, not auto-switched to English

### Scenario: the two locale files never diverge (`THEME-REQ-006`)

- **Given** `es.json` and `en.json`
- **When** `tests/i18n.test.ts` runs
- **Then** every key present in one is present in the other, and no value is empty

## Configuration

| Name | Default | Purpose |
|---|---|---|
| `nuxt.config.ts` `colorMode.preference`/`fallback` | `dark` | Default theme. |
| `nuxt.config.ts` `colorMode.storageKey` | `kankaku-color-mode` | localStorage key. |
| `nuxt.config.ts` `i18n.defaultLocale` | `es` | Default locale. |
| `nuxt.config.ts` `i18n.detectBrowserLanguage` | `false` | Disables auto-detection. |

## Edge cases & failure modes

- `localStorage` unavailable (private browsing, blocked site data): the
  theme/locale choice falls back to the configured default each load,
  rather than throwing.

## Out of scope

- Additional locales beyond es/en.
- Per-user (server-persisted) preference — this is a client-only, per-browser choice.

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `THEME-REQ-001` | manual Playwright verification per `ESTADO.md` | not covered by an automated test found in this pass |
| `THEME-REQ-002` | `web/e2e/polish.spec.ts` | covered |
| `THEME-REQ-003` | manual Playwright verification per `ESTADO.md` | not covered by an automated test found in this pass |
| `THEME-REQ-004` | `web/e2e/polish.spec.ts` | covered |
| `THEME-REQ-005` | `web/tests/i18n.test.ts`, `web/e2e/polish.spec.ts` (Spanish header strings) | covered |
| `THEME-REQ-006` | `web/tests/i18n.test.ts` | covered |
