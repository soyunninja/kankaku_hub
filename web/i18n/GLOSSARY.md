# Japanese UI glossary

Core terminology used consistently across `i18n/locales/ja.json`, established
before translating so the same concept never gets two different Japanese
renderings. Columns: Spanish (`es.json`) / English (`en.json`) / Japanese
(`ja.json`), the term chosen, and a note on why when it isn't a literal
translation.

**Machine-authored disclosure**: `ja.json` (and every string below marked
"flagged for owner review" or listed in "Terms worth a native-speaker's
second look") has never been reviewed by a native Japanese speaker — it
was produced the same way the public site's own Japanese copy was, which
already discloses this (`site/src/i18n/ui.ts`'s `common.jaDisclaimer`).
The app surfaces the same disclosure to a Japanese-reading owner, in
every locale (not just when `ja` is active — a Spanish/English-reading
owner switching a colleague to Japanese should see it too), next to the
language switch in Settings (`app/pages/settings/index.vue`,
`settings.jaDisclaimer` in each locale file).

| es | en | ja | note |
|---|---|---|---|
| Panel | Dashboard | ダッシュボード | established loanword |
| Cliente | Client | クライアント | established loanword |
| Proyecto | Project | プロジェクト | established loanword |
| Tarea | Task | タスク | established loanword |
| Registro (entries) | Entry | エントリー | established loanword for a log/record row |
| Comando | Command | コマンド | established loanword |
| Sesión | Session | セッション | established loanword |
| Token | Token | トークン | established loanword |
| Filtro | Filter | フィルター | established loanword |
| Ajustes | Settings | 設定 | native term, more natural than セッティング in a settings page |
| Buscar | Search | 検索 | native term |
| Tiempo de trabajo | Work time | 作業時間 | native term |
| Tiempo de espera | Waiting time | 待機時間 | native term |
| Tiempo total (wall) | Wall time | 合計時間 | native term ("total time"), avoids a confusing literal "wall clock" |
| Coste | Cost | コスト | picked over 費用 and used everywhere money-ish is shown, per the instruction to pick one and stay consistent |
| Sin determinar (queue label) | Unassigned | 未割り当て | UI label only — the protected client's stored `name` field itself stays `"Sin determinar"` in every locale, never translated (see below) |
| Sin tarea (nav label, `nav.sessionsQueue`) | No task | タスク未設定 | short sidebar/palette label for the "sessions without a task" queue, distinct from its full page title `sessionsQueue.title` ("Sesiones sin tarea" / "Sessions without a task" / "タスク未設定のセッション") — chosen to fit the sidebar next to a count badge without truncating |
| Archivar | Archive | アーカイブ | established loanword |
| Reactivar (unarchive) | Unarchive | 復元 | "restore" — reads more naturally in a Japanese UI than a literal "un-archive"; flagged for owner review |
| Activo | Active | 有効 | native term, standard for a toggle state (vs. アクティブ, which reads more marketing-ish) |
| Inactivo | Inactive | 無効 | pairs with 有効 |
| Guardar | Save | 保存 | native term |
| Cancelar | Cancel | キャンセル | established loanword |
| Editar | Edit | 編集 | native term |
| Eliminar | Delete | 削除 | native term |
| Crear / Nuevo | Create / New | 作成 / 新規〜 | native term; "New client" → 新規クライアント |
| Tablero (kanban) | Board | ボード | established loanword |
| Lista | List | リスト | established loanword |
| Estado | Status | ステータス | established loanword |
| Entrar (login) | Sign in | ログイン | established loanword |
| Cerrar sesión | Log out | ログアウト | established loanword |
| Periodo | Period | 期間 | native term |
| Tendencia | Trend | 推移 | "time-based progression" — more natural for a chart trend line than トレンド |
| Serie temporal | Time series | 時系列 | native term |
| Prompt | Prompt | プロンプト | established loanword |
| Modelo | Model | モデル | established loanword |
| Máquina | Machine | マシン | established loanword |
| Hub (product/category label) | Hub | Hub | kept as literal English, matching the existing es/en precedent (`commands.groups.hub` is `"Hub"` in both source locales — treated as a proper/category name, not translated) |
| hub (common noun, "this hub") | hub | ハブ | established loanword, used everywhere `hub` is a common noun rather than the category label above |
| Segmento | Segment | セグメント | established loanword |
| Subagente | Subagent | サブエージェント | established loanword |
| Turno | Turn | ターン | established loanword |
| Ejecución (run) | Run | 実行(回数) | native term |
| Esquema | Schema | スキーマ | established loanword |
| Moneda | Currency | 通貨 | native term |
| Exportar | Export | エクスポート | established loanword |
| Sincronizar | Sync | 同期 | native term |
| Catálogo | Catalog | カタログ | established loanword |
| Web / Website | Website | ウェブサイト | established loanword |
| Contacto | Contact | 連絡先 | native term |
| Notas | Notes | メモ | native term |
| Protegido | Protected | 保護 | native term |
| Grupo | Group | グループ | established loanword |
| Asignar | Assign | 割り当て | native term — deliberately NOT 担当, which implies ownership/responsibility rather than a data-record reassignment |
| Sugerido | Suggested | 候補 / 提案 | native term ("candidate"/"suggestion"), context-dependent |
| Ruta (repo path) | Path | パス | established loanword |
| Copiar / Copiado | Copy / Copied | コピー / コピーしました！ | established loanword + polite past form |
| Reanudar sesión | Resume session | セッションを再開 | native term, "resume the session" — pairs with the established セッション loanword |
| Calidad de medición | Measurement quality | 測定品質 | native term |
| Integración (plugin) | Plugin | プラグイン | established loanword; `plugin` is the integration name that wrote a `task_entries` row (e.g. `"kankaku"`), labelled 統合 in prose but プラグイン as the short UI label to match the field name |
| Heredado (no reportado) | Legacy (not reported) | レガシー（未報告） | native/loanword mix, for an `agent`-less row written before the agent field existed |
| Límite superior (upper bound) | Upper bound | 上限値 | native term, used when `work_ms` is not a true measurement |
| Estimado | Estimated | 概算 | native term, for `cost_quality: "estimated"` |
| Enlazado / sin enlazar (subagent linkage) | Linked / unlinked | 紐づけ済み / 未紐づけ | native term ("linked/tied together"), for `subagent_linkage` |
| Agente | Agent | エージェント | established loanword, the AI agent that ran a session (`entry.agent` / `SessionSummary.agent`, e.g. `"pi"`) |
| Mixto | Mixed | 混在 | native term, for the `MIXED` sentinel (`app/lib/session-aggregate.ts`) shown when a session's entries disagree on a field (client/project/task/agent) |
| Primera actividad / Última actividad | First activity / Last activity | 最初のアクティビティ / 最新のアクティビティ | native term, a session's earliest/most-recent `task_entries.started_at` (`SessionSummary.firstActivity`/`lastActivity`) |
| Convertir en tarea | Convert to (new) task | 新規タスクに変換 | native term, the "sessions without a task" queue's explicit action that creates a task from a session (ADR 0024 — never automatic) |
| Adjuntar (a tarea existente) | Attach (to existing task) | 既存タスクに追加 | native term ("add to an existing task"), the queue's other explicit linking action — reuses 既存 ("existing") rather than a literal "attach" loanword, which reads awkwardly in Japanese for a data-record action |
| Ignorar (sesión) | Ignore (session) | 無視 | native term, dismissing a session from the "without a task" queue without creating a task (`ignored_sessions`, ADR 0024) |
| No medido | Not measured | 未測定 | native term, the generic "this figure wasn't measured" qualifier used by the entries explorer's quality filter options and the dashboard's measurement-quality KPI notices (Task 1/3, `waiting_quality`/`cost_quality`) |
| Transcurrido (elapsed) | Elapsed | 経過時間 | native term, a session's `min(started_at)` to `max(ended_at)` span (`SessionSummary.elapsedMs`, `app/lib/session-aggregate.ts`) — deliberately distinct from "wall time", which a summed multi-row figure is not (see docs/architecture/aggregation.md) |

## Conventions applied throughout `ja.json`

- **Register**: polite-neutral (です/ます for full sentences — descriptions,
  hints, error text); plain noun/verb-stem for buttons, nav items and table
  headers (保存, キャンセル, 編集, アーカイブ, 新規クライアント).
- **Quoting**: source `es.json`/`en.json` use «guillemets» / escaped
  `"straight quotes"` around literal identifiers (env var names, command
  syntax, config keys). `ja.json` uses 「」 corner brackets for the same
  purpose consistently, and keeps backtick-fenced genuine code tokens
  (`` `worklog.jsonl` ``) as backticks, matching the source files' own mixed
  convention.
- **Punctuation**: full-width `、。「」（）` inside Japanese sentences;
  half-width digits, ASCII unit-less code tokens (env var names, JSON keys,
  CLI flags) and the `…` ellipsis character used by the source locales.
- **The protected "Sin determinar" client**: its `name` field, as stored in
  PocketBase, is never translated — a Japanese owner will still see literal
  "Sin determinar" anywhere the client's own name is rendered (client
  tables, pickers, the assignment-target label). Only the *UI labels about
  that concept* are Japanese: the nav item and the unassigned queue's own
  page title both say 未割り当て. Prose that explicitly names the client
  record (e.g. commands docs describing what `/kankaku backfill` does)
  keeps the literal `"Sin determinar"` in quotes, because that is what the
  owner will actually see elsewhere in the same UI.
- **Placeholders**: every `{token}` from `es.json` (`{done}`, `{total}`,
  `{succeeded}`, `{failed}`, `{count}`, `{client}`, `{id}`, `{work}`,
  `{wait}`, `{wall}`, `{syntax}`) is preserved verbatim and exactly once per
  string in `ja.json`; verified by `tests/i18n.test.ts`.

## Terms worth a native-speaker's second look

Machine-authored Japanese, not reviewed by a native speaker. These specific
calls are the ones most likely to need adjustment:

- `common.unarchive` → 復元 ("restore") instead of a literal
  "un-archive" — reads more natural but changes the verb's shape from its
  Spanish/English counterpart.
- `entries.status.aborted` / `entries.status.interrupted` → 中止 / 中断.
  The distinction (deliberately stopped vs. cut off) is subtle in Japanese
  and worth confirming against how kankaku actually uses each status.
- `tasks.status.open` → 未着手 ("not yet started") rather than a literal
  "open" — a semantic choice for a kanban-style board, not a literal
  translation.
- `dashboard.share` → 割合 for the "% of total" table column — short enough
  for a table header, but 構成比 is a common alternative in Japanese
  BI/dashboard tools if a more formal register is wanted.
