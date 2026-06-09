# Decision log: 2026-06-09 the AI-review receipt

Append-only. The first capability built past v2: a portable, signed, re-judgeable
attestation of a review verdict, so a PASS can travel with the change and be checked
later by someone who trusts no one's memory.

## The work item

`scripts/review-receipt.mjs` (with `.test.mjs`) and `references/review-receipt.md`: a
signed ReviewVerdict attestation over a verify packet (the diff, spec, and rubric).
Node built-ins only, so it runs offline and in CI with no dependencies.

```yaml
shape:        in-toto Statement, predicateType https://eidolon.dev/ReviewVerdict/v0
signing:      Ed25519 over canonical(statement); the envelope carries key_id, not the key
rail:         buildReceipt refuses an empty/whitespace anchor (no anchor, no receipt)
verify:       re-hash the packet vs the SIGNED subject + check the signature against a
              TRUSTED, externally-supplied public key (--pubkey is required)
honesty:      deterministic = tamper-evidence + provenance; the verdict itself stays an
              AI judgment, re-judged within a declared agreement band (k of n), not bit-identical
upgrade path: Ed25519 -> Sigstore keyless + Rekor for public, third-party-auditable receipts
```

## How it ran (right-sized: free for friends, may be used at work)

```yaml
build_tdd:    7 tests written first (RED), including the three security-critical negatives:
              tampered evidence fails the hash, a forged verdict breaks the signature,
              the wrong key fails. Implemented to green.
canary:       a real CLI run on a real verify-packet: keygen -> issue -> verify PASS,
              then every tamper path FAIL. Caught one real bug (below).
cold_review:  a security-reviewer subagent in a fresh context audited the crypto against a
              stated threat model (attacker controls the receipt JSON and the packet files).
              Verdict: all four guarantees hold, each with a cited enforcing line; no
              CRITICAL or HIGH. Five lower findings, all fixed (below).
fix_loop:     each behavioral fix added a failing test first, then the fix. 12/12 green.
```

## The bug the canary caught (CLI rail bypass)

```yaml
symptom: issue --anchor "" --verdict PASS produced a receipt anchored to "--verdict"
cause:   the naive arg() helper returned the next token as the value; an empty/dropped
         --anchor swallowed the following flag, so a synthetic anchor sailed past the rail
fix:     optionValue(argv, flag) treats a missing or option-shaped (-prefixed) value as
         absent, so it fails closed with "no anchor, no receipt". Same bug class as the
         verify-packet --base guard. Proven by a unit test and a re-run of the canary.
lesson:  an invariant must be tested at the boundary where untrusted input enters, not
         only at the pure-function core. buildReceipt's rail was sound; its CLI door had a gap.
```

## What the cold security review caught, all fixed

```yaml
F1_MEDIUM: issue trusted manifest.content_hash blindly, so a planted manifest could make
           the signer attest a hash it never computed. Fix: resolveSubjectHash always
           recomputes packetHash(files) and fails loudly if a manifest disagrees. This also
           collapses issue and verify onto one hash computation, removing a desync class.
F2_LOW:    key_id was fingerprinted from the raw PEM, so a CRLF/whitespace difference across
           environments could false-negative the correct key. Fix: fingerprint the canonical
           SPKI form of the parsed key. Fails closed either way; this prevents an operational
           false reject. Tested with a whitespace-mangled key.
F3_LOW:    an all-empty packet could be issued over. Fix: hasEvidence() guard (no evidence,
           no receipt), the rail applied to the bundle.
F4_LOW:    signature.alg is cosmetic and never read by verify; added a comment forbidding any
           future code path from selecting a verify algorithm from it (algorithm-confusion guard).
F5_LOW:    packetHash duplicates verify-packet's buildManifest; added a sync comment binding them.
```

## Outcome

```yaml
tests:     review-receipt 12/12 (3 of them security-critical negatives, 3 hardening)
canary:    happy path PASS; tamper, wrong-key, empty-bundle, planted-manifest all FAIL closed
review:    cold security review, no CRITICAL/HIGH; four guarantees confirmed with cited lines
audit:     eidolon-audit PASS (the new references/ path resolves); selfcheck PASS (no dash)
wired:     SKILL.md Governance gains review_receipt; CLOSE emits a receipt on a framework-anchored review
```

## Decision

The receipt ships as the harness's first post-v2 capability and the most genuinely
novel part of the competitive scan: an attestation that is honest about the line
between what cryptography proves (integrity, provenance) and what it cannot (that an
AI verdict is correct). The Ed25519 envelope is the right default for one person or a
small team; Sigstore keyless + Rekor is the documented upgrade for public,
third-party-auditable receipts, with the predicate unchanged.
