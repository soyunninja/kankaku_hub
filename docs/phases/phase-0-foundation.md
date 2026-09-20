# Phase 0 — Foundation (kankaku 0.4.6 robustness)

| | |
|---|---|
| Status | done |
| Repos | kankaku |
| Depends on | — |

## Goal

The pre-hub baseline: kankaku as a standalone local work-time/cost tracker,
released as `v0.4.6` (`main`, commit `45415ce`, "chore: release 0.4.6"),
with the hexagonal domain/ports/adapters split (pi-event wiring separated
from pure aggregation logic) that every later hub phase builds on without
modification to the core measurement path.

## Scope

### In

- The interval-union aggregation primitive (`src/domain/intervals.ts`) and
  task/session assembly (`src/domain/task-view.ts`) — unchanged in shape by
  every later hub phase, only reused.
- Local JSONL logging, local reporting (`/kankaku`, `/kankaku export`),
  client label handling — the pre-hub free-text `client` field.
- The domain/ports/adapters split described in
  [`../architecture/kankaku-extension.md`](../architecture/kankaku-extension.md).

### Out

- Any hub/PocketBase integration — added starting phase 1.

## Deliverables

- Published npm package `kankaku@0.4.6`.

## Acceptance criteria

- [x] `main`/`v0.4.6` is a tagged, released baseline (commit `45415ce`).
- [x] The hexagonal split (`src/domain/`, `src/ports/`, `src/adapters/`) is
      in place before any hub code is added — confirmed by every hub commit
      (`45415ce..HEAD`) adding new files under exactly those three
      directories rather than restructuring existing ones.

## Evidence

- Commit: `45415ce` — "chore: release 0.4.6" (kankaku, tip of `main`)
- This documentation pass did not enumerate the individual commits that
  built `v0.4.6` itself (out of scope: the task scoped commit research to
  `45415ce..HEAD`, the hub-integration branch). If a detailed phase-0
  history is needed later, run `git log` in `kankaku` bounded above
  `45415ce`.

## Known gaps

- No dedicated "pi-tracker split" commit was identified in this pass;
  `src/adapters/pi-tracker.ts` already existed as the pi-event-wiring
  adapter before the hub branch and was extended, not introduced, by it
  (per its appearance in nearly every hub commit's file list).

## Next steps

- See [phase-1-catalog-and-selection](phase-1-catalog-and-selection.md).
