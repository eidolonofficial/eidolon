# Agent security-awareness training (a graded, attested comprehension loop)

Before an agent touches tools, credentials, external content, or production systems, it
reads a security policy, takes a scenario quiz that tests applying it, and is graded by an
EXTERNAL validator. A pass becomes a signed attestation the orchestrator can gate a
destructive or sensitive dispatch on. The pattern is adapted from
slartz/agent-security-awareness-training (MIT, see CREDITS.md); the Eidolon version reuses
the hardened Ed25519 review-receipt engine for signing and tailors the policy and quiz to
Eidolon's own threat surface.

## The honest split: what is deterministic and what is not

```
DETERMINISTIC (a machine re-checks this and gets the same answer every time):
  - the policy text re-hashes bit-identically to the signed subject hash, and
  - the Ed25519 signature is valid for a grader public key the verifier trusts out of band, and
  - the recorded result is "pass", the policy hash matches, and the timestamp is current.
  This proves an EXTERNAL grader really issued this verdict over this exact policy.

PROBABILISTIC / SOFT (not a machine fact, and this loop does not pretend otherwise):
  - whether the agent actually internalized the policy. The quiz is comprehension, graded by
    judgment. A fresh attestation does NOT make an agent injection-proof; the deterministic
    guardrails (the hook suite, the two-layer floor) still do the real work. An agent with a
    fresh attestation is exactly as prompt-injectable as one without.
```

## The loop (five steps, adapted to Eidolon)

```yaml
# why: comprehension you can verify and attest, not compliance theater
1_read:      read references/security-policy.md in full; compute its sha256 (the version it
             was graded against). scripts/security-attestation.mjs policyHash does this.
2_internalize: write structured notes - the non_negotiables, the escalation_triggers, the
             default_deny areas. Summarizing forces comprehension.
3_quiz:      answer references/security-awareness/quiz.md. Record each answer with a one-to-two
             sentence rationale that CITES the policy section it rests on. A bare letter fails.
4_grade:     hand the answers to an EXTERNAL grader (the orchestrator, a separate model, or a
             CI step) that holds the answer key. You do not grade your own quiz, ever. The
             grader signs an attestation with its private key (issue).
5_verify:    check the attestation: schema match, result "pass", policy hash matches the policy
             you read, timestamp current, signature valid for the TRUSTED grader public key
             (verify). A second failure escalates to a human, never a third silent retry.
```

## The attestation (in-toto Statement, SecurityAwareness predicate)

```json
{
  "statement": {
    "_type": "https://in-toto.io/Statement/v1",
    "subject": [{ "name": "security-policy", "digest": { "sha256": "<policy hash>" } }],
    "predicateType": "https://eidolon.dev/SecurityAwareness/v0",
    "predicate": {
      "framework_anchor": "Eidolon agent security policy v0",
      "policy_sha256": "<policy hash>",
      "quiz_version": "quiz-v0",
      "result": "pass",
      "graded_by": "<external grader id, never the agent itself>",
      "judge_model": "claude-...",
      "timestamp": "<ISO 8601>"
    }
  },
  "signature": { "alg": "ed25519", "value": "<base64>", "key_id": "<sha256(pubkey) first 16 hex>" }
}
```

Schema: references/security-awareness/attestation.schema.json. A real, verified example:
references/security-awareness/attestation.example.json (its signing key was a throwaway and
was discarded, so it shows the shape; a live attestation verifies against the grader's
trusted public key).

## Externality: you do not grade your own quiz

```yaml
# why: self-grading achieves ~100% agreement and verifies nothing
key_location:  the answer key is the grader's. Ship only answer-key.example.json. The real key
               lives as references/security-awareness/answer-key.json (gitignored) or outside the repo.
signing_key:   the grader holds security-private.pem and signs. The target trusts only
               security-public.pem. The agent never holds the private half, so it cannot
               forge a pass - this is the real externality guarantee, stronger than the
               graded_by field (which is the human-readable witness, checked belt-and-suspenders).
self_grade_rail: verifyAttestation rejects an attestation whose graded_by equals the agent's
               own id when that id is supplied, on top of refusing any unsigned/forged one.
```

## The gate: advisory plus consent, never a hard block

```yaml
# why: awareness is a soft layer; it asks, it does not wall (matches Eidolon's tiering)
surface:  hooks/security-surface.mjs - a SessionStart surface (sibling of seat-surface) that
          shows the policy hash and the attestation status every pass. Advisory, fail-open.
gate:     hooks/dispatch-attestation-guard.mjs - a PreToolUse hook on the dispatch tool (Task).
          When a dispatch is destructive or sensitive (security/trust-safety swarm, deploy,
          migration, prod, PII, payments, credentials, destructive verbs) AND no valid
          attestation is in effect, it ASKS the human (the consent tier). It never hard-blocks,
          and on an unrecognized tool it fails open to allow.
paths:    attestation .claude/security-attestation.json; grader pubkey
          .claude/security-grader-public.pem; policy references/security-policy.md. These are
          template defaults a target install fills (like the other template hooks).
catalog:  antibehavior "self-graded-training / dispatch-without-attestation"
          (references/antibehavior-catalog.md), enforced by the gate (ask) plus the external grade.
```

## The CLI

```
node scripts/security-attestation.mjs keygen --out KEYDIR
  the grader's Ed25519 keypair. The grader keeps security-private.pem; the target trusts
  security-public.pem. Never commit the private key (*.pem is gitignored).

node scripts/security-attestation.mjs issue --policy references/security-policy.md \
    --anchor "Eidolon agent security policy v0" --quiz references/security-awareness/quiz.md \
    --result pass --graded-by <grader id> --key PRIV.pem [--out FILE] [--model NAME]
  the GRADER runs this (never the agent): hashes the policy, builds the SecurityAwareness
  statement (refusing an empty anchor or grader), signs it, writes the attestation.

node scripts/security-attestation.mjs verify --attestation FILE --policy FILE --pubkey PUB.pem \
    [--max-age-days N] [--self-id ID]
  re-hashes the policy and checks the signature, result, hash, and freshness. Exit 0 only if
  all pass. --pubkey is required: verify against a key you trust, never one inside the file.

node scripts/security-attestation.mjs status --policy FILE [--attestation FILE]
  a one-line status the SessionStart surface uses; non-cryptographic (presence + result + freshness).
```

## What this is not

- It is not a technical security control. It is a comprehension check with a tamper-evident,
  attributable record. The deterministic guardrails are what stop an injection or a secret leak.
- It is not a trust root. A verified attestation is only as meaningful as your reason to trust
  the grader's public key.
- It does not replace the policy review. references/security-policy.md is example-grade and is
  meant to be reviewed and extended per deployment; the quiz tests applying whatever policy ships.
