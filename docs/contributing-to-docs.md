# Contributing to these docs

The workflow for documenting the *next* feature, so this stays a system
instead of a pile of files.

## Workflow

1. **ADR, if a load-bearing decision is being made.** Not every change
   needs one — only decisions with real alternatives and consequences (see
   [`adr/README.md`](adr/README.md) for the existing set as calibration).
   Copy [`templates/adr-template.md`](templates/adr-template.md), assign
   the next `NNNN` id, add it to the index table.
2. **Spec.** Copy [`templates/spec-template.md`](templates/spec-template.md).
   Write requirements first (numbered, SHALL/SHOULD/MAY, a stable id prefix
   unique across every spec in [`specs/README.md`](specs/README.md) —
   check that index before inventing a prefix), then scenarios that
   reference those ids. Status starts at `planned`.
3. **Phase entry.** If the feature is a new roadmap phase (rather than an
   addition to an existing one), copy
   [`templates/phase-template.md`](templates/phase-template.md) and add it
   to [`phases/README.md`](phases/README.md).
4. **Implement with tests.** Code and tests as normal, in whichever repo
   owns the capability.
5. **Update status and evidence.** Once merged: flip the spec's Status to
   `implemented` (or `partial` if some requirements aren't met yet — say
   which), fill in its Code/Tests paths, fill in the Traceability table
   with real test file paths (or `not covered` — be honest), flip the
   phase's checkboxes and Evidence section with real commit hashes, and add
   the spec to [`specs/README.md`](specs/README.md) if it's new.

## Definition of done for docs

A change's documentation is done when:

- Every new requirement id is unique across all of `specs/*.md` (grep for
  it — see the verification approach below).
- Every requirement has at least one scenario referencing it, and the
  Traceability table states its real coverage status (not a placeholder).
- Every ADR/spec/phase file that references another file uses a working
  relative link.
- The spec's Status header matches reality: don't mark something
  `implemented` because it's planned to be, or because most of it works.
  `partial` exists for a reason.
- If something in the proposal or an existing doc turns out to not match
  the code, the doc is corrected and the discrepancy is called out (in the
  PR/commit, not silently fixed) — these are valuable signal, not
  embarrassing gaps.

## Requirement id prefixes in use

Keep this list current when adding a new spec (see
[`specs/README.md`](specs/README.md) for the full spec list):

`CRED`, `CATALOG`, `TARGET`, `RECID`, `SYNC`, `BACKFILL`, `AUTOSYNC`, `CMD`,
`SCHEMA`, `WEBAUTH`, `DASH`, `CATMGMT`, `TASKS`, `UNASSIGNED`, `ENTRIES`,
`THEME`, `SEC`.

## Verifying the docs

A quick manual check before considering a docs change done:

```bash
# every relative markdown link resolves to a file that exists
grep -rEo '\]\(([^)]+\.md[^)]*)\)' docs/ | sed -E 's/.*\((.*)\)/\1/' | \
  sed 's/#.*//' | sort -u | while read -r p; do
    # resolve relative to the referencing file's directory in a real check;
    # this one-liner is a starting point, not a substitute for care
    true
  done

# requirement ids are unique across all specs
grep -rEo '`[A-Z]+-REQ-[0-9]+`' docs/specs/*.md | sort | uniq -c | sort -rn | awk '$1>1'
```

For a thorough pass, write a small script that resolves each link relative
to its containing file and confirms the target exists — see how this
documentation set's own initial pass was verified (script discarded after
use; re-derive it rather than assuming one is checked in).

## Language

Per the project's contract: generated technical artifacts (specs, ADRs,
phases, code comments) are English by default. `RESUMEN.es.md` is the one
deliberate exception — an executive summary for the owner, kept in Spanish
on purpose, same as `ESTADO.md` in the hub repo's root.

## Related

- [`README.md`](README.md) — the map of this whole docs system
- [`templates/`](templates/) — the three templates referenced above
