# Entries default: last 30 local days

## Intent and contract

An implicit visit resolves the existing `30d` preset before browse. Explicit
one-sided or bounded dates take precedence over `dateRange=all`; that marker
is route metadata only. All time is an explicit broad-query choice. Reset
clears the twelve canonical filter keys and marker and restores the implicit
30-day period, intentionally replacing the older All-time reset behavior.
Exports retain their click-time snapshot. No backend, measurement, palette,
or domain arithmetic changes.

## Checklist

- [x] Initialize implicit bounds before flat/grouped requests.
- [x] Commit date choices atomically through the router; preserve query/hash.
- [x] Preserve explicit bounds, All time, reload and history intent.
- [x] Reset to implicit bounds without an unbounded request.
- [x] Verify export snapshots, local-day conversions and narrow labels.
- [x] Run unit, typecheck, lint, diff and isolated browser verification.

## Tests

Use the parent-authorized verification commands and isolated 3003/8093 stack.
Strict TDD is disabled for this route/UI wiring; reuse tested period helpers.
Browser requests must distinguish main per-page-25 browse from sidebar counts.
Audit business mutations before executing browser tests; stop the owned stack
on every outcome.

## History

- Initial implementation plan: preserve dirty work and existing control styling;
  use committed range events and a single route application watcher.
- First browser run: 67/71 passed. Two timezone fixtures overwrote the saved
  grouping choice on reload; two partial-export fixtures tried to invoke an
  empty-state reset while rendering rows. Corrected fixture setup, keeping
  identity/cap/formula/privacy assertions intact. Owned stack stopped.
- Second browser run: 69/71 passed. The partial-export test asserted the URL
  synchronously after an asynchronous router reset. Replaced that assertion
  with polling and guaranteed release of its held request. Owned stack stopped.
- Mutation audit: the old timezone spec performed business create/delete via
  API requests. Replaced it with timezone-local synthetic boundary rows and
  actual browse/filter assertions. No business fixture writes are required;
  browser guards allow only reads, auth, read-only totals and subscriptions.
- Third full browser run: **71/71 passed** in 8.9 minutes on a fresh seeded
  `/tmp/kankaku-entries-default30.8J52t5` stack. Both earlier owned stacks
  (`0WCtml`, `8StA8J`) and the final stack were stopped with the authorized
  teardown command after their runs. No forbidden-mutation guard failures.
  Control geometry remained green at 320/390/1280 in both themes; full
  accessibility, identities, export consent/caps, recovery and table checks
  remained enabled. No RED/GREEN lifecycle claimed: effective TDD is disabled
  for route/UI wiring.

## Verification receipt

Foreground browser command (all three runs, with each owned `STACK_DIR`):

```sh
PW_BASE_URL=http://127.0.0.1:3003 NUXT_PUBLIC_PB_URL=http://127.0.0.1:8093 PW_OUTPUT_DIR="$STACK_DIR/date-out" pnpm --dir web exec playwright test e2e/entries-date-range.spec.ts e2e/entries-filter-layout.spec.ts e2e/entries-empty-recovery.spec.ts e2e/entries-partial-export.spec.ts e2e/day-boundary.spec.ts e2e/entries-export.spec.ts e2e/entries-load-recovery.spec.ts e2e/entries-accessibility.spec.ts e2e/entries-desktop-filters.spec.ts e2e/entries-mobile-ledger.spec.ts e2e/control-consistency.spec.ts e2e/table-surface-consistency.spec.ts --grep-invert "bulk assignment end-to-end"
```

Setup on each fresh runtime directory:

```sh
STACK_DIR=$(mktemp -d /tmp/kankaku-entries-default30.XXXXXX)
scripts/isolated-stack.sh up "$STACK_DIR" --pb-port 8093 --web-port 3003 --seed
```

Teardown on every outcome: `scripts/isolated-stack.sh down "$STACK_DIR"`.
Artifacts remain only in the owned runtime directories. No owner or unrelated
stack was operated. Setup is the sole authorized seed-writing phase; browser
verification uses reads/auth/totals/subscriptions only.

Required repository checks: `pnpm --dir web test` (588 passed, 38 skipped),
`pnpm --dir web typecheck` (passed), `pnpm --dir web lint` (zero errors,
baseline 23 warnings), and `git diff --check` (passed). These are rerun after
this final receipt update. The two new attribute-order warnings were removed.

## Key learnings

1. `resolvePreset('30d')` already resolves today plus 29 prior local calendar
   days; browse/export adapters already share local-day UTC conversion.
2. Main flat browse is `perPage=25`, grouped browse is session totals with
   `per_page=25`; sidebar standing counts and export reads are distinct.
3. A committed range event preserves model emits while letting the page own
   one router navigation. `dateRange=all` never enters the twelve-field model.
4. The reset action is contextual to an empty filtered result; export snapshot
   tests must expose that action rather than attempting a nonexistent toolbar
   reset. Async navigation assertions must wait for the actual URL change.

## Limits and review boundary

The replacement timezone browser fixtures prove Entries request conversion and
boundary inclusion/exclusion without CRUD; they no longer create a persistent
fixture for Dashboard/project charts. Existing pure date/period tests remain
unchanged. This unit changes route/UI period intent only, not backend schema or
measurement arithmetic. The palette phase remains separate. Parent independent
final verification/review is still required; this receipt does not close it.
