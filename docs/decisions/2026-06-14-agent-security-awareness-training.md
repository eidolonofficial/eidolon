# Decision log: 2026-06-14 agent security-awareness training (a graded, attested comprehension gate)

Append-only. Records folding the pattern from
slartz/agent-security-awareness-training (MIT) into Eidolon as a graded,
externally-attested comprehension layer that gates destructive or sensitive
dispatch at the consent tier. Adapted to Eidolon's idioms (.mjs + Markdown,
not Python), reusing the hardened review-receipt signer rather than
reimplementing signing.

## Why

When the Expediter fans out swarms, nothing confirmed an agent had internalized
a security policy before it touched tools, credentials, untrusted external
content, or production. The external repo is a proven shape for that: read a
policy, take a scenario quiz, get graded by an EXTERNAL validator (never
self-graded), and carry a signed attestation an orchestrator can gate dispatch
on. Eidolon already shipped the hard part - scripts/review-receipt.mjs is an
Ed25519-signed, in-toto-shaped, canonical-JSON attestation engine - so this is
adopt-a-pattern-plus-reuse-the-signer, not import-a-Python-repo.

## What was built

1. **The attestation engine (a sibling, not an edit to the signer).**
   scripts/security-attestation.mjs imports packetHash, canonical, signReceipt,
   verifyReceipt, and optionValue from review-receipt.mjs and adds policyHash,
   buildSecurityAttestation (predicateType https://eidolon.dev/SecurityAwareness/v0,
   carrying policy_sha256, result, graded_by, timestamp), and verifyAttestation
   (the two deterministic receipt checks plus result=pass, policy-hash match, and
   freshness). The hardened signer is untouched - its five findings stay pinned by
   review-receipt.test.mjs, which still passes - and no new algorithm-selection
   path is introduced, so the alg-substitution class cannot reappear.

2. **The policy, quiz, key, schema (tailored to Eidolon's threat surface).**
   references/security-policy.md keys its non_negotiables, escalation_triggers,
   and default_deny rows one-to-one onto the antibehavior catalog and the hooks
   that enforce them (untrusted content is data, secrets never leak, gates are
   not routed around, records are append-only, claims carry evidence). The quiz
   (references/security-awareness/quiz.md) tests application, not recall; the
   answer key ships only as .example (the real key is the grader's, gitignored);
   the schema and a real (throwaway-signed) example attestation document the shape.

3. **The gate (advisory plus consent, never a hard block).**
   hooks/security-surface.mjs surfaces the policy hash + attestation status every
   SessionStart (sibling of seat-surface). hooks/dispatch-attestation-guard.mjs is
   a standalone PreToolUse hook on the dispatch tool (Task): a destructive or
   sensitive dispatch with no VALID signed attestation in effect ASKS the human
   (the consent tier). It never blocks - awareness is a soft layer, so it asks -
   and a non-sensitive dispatch or an unrecognized tool fails open to allow.

4. **Wiring + records.** .claude/settings.json wires the gate on the Task matcher;
   hooks/README.md, the antibehavior catalog (self-graded-training /
   dispatch-without-attestation), conductor-standard (ask_first.attestation_gate),
   SKILL.md (consent_gates, the Governance block, the REVIEW step, the Stage 10
   manifest), and the security/trust-safety swarm docs all name the new layer.
   CREDITS.md attributes slartz (MIT, compatible). The real answer key, the issued
   attestation, and grader keys are gitignored.

## The honest framing, kept

A verified attestation proves an external grader issued a pass over this exact
policy. It does NOT prove the agent is injection-proof; an agent with a fresh
attestation is exactly as prompt-injectable as one without. The deterministic
guardrails (the hook suite, the two-layer floor) still do the real work. The
gate asks; it never replaces them.

## Tests

scripts/security-attestation.test.mjs (14): hash determinism, both rails (no
anchor, no grader), tamper, fail-result refused, stale and mismatched-policy
refused, self-graded refused, wrong key. hooks/dispatch-attestation-guard.test.mjs
(8) plus suite cases in hooks.test.mjs: the pure helpers and the hook end-to-end
against a temp target with a real signed attestation (ask / allow / stale).
Full suites green and review-receipt.test.mjs unchanged.

## Scope note

The canonical home is the eidolon repo. The Hearth bundle (skills/eidolon/) is a
re-mirror snapshot that currently trails canonical (it predates the dispatcher
consolidation and conductor-standard); the capability files and the coherent
additive doc edits were carried into the bundle so users receive the feature,
but the settings.json/SKILL wiring that depends on the newer canonical structure
is left to the normal re-mirror. eidolon-setup gained a small session.yaml
security tier that points at this policy and attestation.
