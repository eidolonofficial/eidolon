# Decision log: 2026-06-08 cross-session graduation

Append-only. The beyond-v2 higher-isolation tier.

## What was built

- `references/cross-session.md`: when to graduate (high-risk tier + cost ceiling, per
  run, user-overridable), why it is possible (everything the verifier needs is a
  durable artifact on disk, design spec section 7), the handoff contract (a
  self-contained verify packet in, a verdict out, read only the packet), the
  mechanism, and the trade-offs.
- `scripts/verify-packet.mjs` (+ `.test.mjs`): assembles a self-contained verify
  packet (diff, spec, rubric, and a content-hashed manifest). A separate session or a
  fresh subagent verifies from this packet alone, with no conversation inheritance.
  Node built-ins only; the manifest is reconstructable and tamper-evident (the test
  proves same-input/same-hash and changed-content/changed-hash).
- `references/scaling.md`, `SKILL.md`: cross-session wired as the high-risk
  graduation; VERIFY assembles a packet and verifies in a separate session on a
  graduated run.

## The canary (the property proven)

A cold verifier was given ONLY the packet directory, with no repository access and no
conversation context. It independently recomputed the manifest content hash and
confirmed it matched (the packet is intact and tamper-evident), then re-derived the
rubric verdict to PASS, and reported: the packet was fully self-contained, the
verdict was reached from the four packet files alone, nothing essential missing.

That is the cross-session property: a reader with zero shared context verifies the
change from the on-disk handoff alone, which is exactly what a separate session does.

The verifier also raised one LOW robustness nit (an option-shaped `--base` could be
parsed as a git option); fixed by rejecting a base that starts with a dash.

## Outcome

```yaml
test:      verify-packet 1/1
canary:    cold verifier reached PASS from the packet alone; hash matched
gates:     selfcheck PASS, eidolon-audit PASS, all files dash-clean
```

## Decision

Cross-session is no longer just deferred: the handoff is concrete and runnable (the
verify packet), and a cold reader verifies from it alone. The pipeline graduates to
cross-session per run on high-risk work; v1 and v2 stay in-session with the
cold-context verifier by default.
