# Select label style alignment

## Objective
Align Projects and Tasks select filter labels with the existing Entries filter label style.

## Scope and constraints
- Edit `web/app/pages/projects/index.vue` and `web/app/pages/tasks/index.vue` only.
- Match the Entries filter label visual style: small muted labels above the select controls (`text-xs text-muted-foreground`) and the tighter filter-control vertical gap used there.
- Preserve select IDs, aria labels, filter behavior, avatar slots, dialogs, history search, and all unrelated uncommitted work.
- No schema, locale, shared UI component, commit, push, or deployment changes.

## Checks
- Focused lint: `pnpm --dir web exec eslint app/pages/projects/index.vue app/pages/tasks/index.vue`
- Typecheck if practical: `pnpm --dir web typecheck`
- Diff check: `git diff --check`

## Tasks
- [ ] S1 — Update Projects top client filter label/container style to match Entries.
- [ ] S2 — Update Tasks top client/project filter label/container style to match Entries.
- [ ] S3 — Run focused checks and report limitations.

## Progress
- User requested same select-label style as Entries for Projects and Tasks.
- Parent exploration found Entries uses native labels with `class="text-xs text-muted-foreground"` and `gap-1`; Projects/Tasks use shared `Label` defaults with larger font/weight and gap variants.

## Progress update
- Implemented label style alignment: Projects client filter, Tasks client/project filters now use small muted normal-weight labels matching Entries; Projects filter wrapper gap tightened to `gap-1`.
- Parent verification passed: `pnpm --dir web exec eslint app/pages/projects/index.vue app/pages/tasks/index.vue`, `pnpm --dir web typecheck`, and `git diff --check`.
- Visual browser signoff still pending from owner over the running Tailscale dev server.
