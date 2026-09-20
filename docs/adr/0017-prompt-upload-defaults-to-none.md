# 0017 — Prompt upload defaults to `none`

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-20 |

## Context

Prompts can contain client-confidential context. The proposal (§8) already
argued the default must be the conservative one; this ADR records the
concrete, implemented default that resulted.

## Decision

`KANKAKU_SYNC_PROMPT` (confirmed default: `none`, in
`kankaku/src/config.ts`) controls whether a record's `prompt` field is
uploaded to the hub at all: `none` (default — never uploaded), `truncated`
(first ~120 characters), `full`. Nothing leaves the machine unless the
operator explicitly opts in.

## Consequences

- A fresh install never uploads prompt text, even by accident.
- Reports and the entries explorer's `prompt` column stay empty for anyone
  who has not explicitly raised the setting.
- Anyone who wants prompt visibility in the hub (e.g. for debugging "what
  was this task actually about") must deliberately opt in, understanding
  the confidentiality trade-off.

## Alternatives considered

- **Default to `truncated`** — rejected: still leaks the first ~120
  characters of every prompt by default, which can easily include
  client-identifying detail; the conservative choice is genuinely `none`.

## Related

- Code: `kankaku/src/config.ts`
- Spec: [`../specs/security-and-privacy.md`](../specs/security-and-privacy.md)
- Proposal: [`../proposal.md`](../proposal.md) §8
