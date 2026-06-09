# The AI-Review Receipt (a signed, re-judgeable verdict)

A review verdict is usually a throwaway sentence in a chat log: one word, "PASS". It
cannot be carried anywhere, it cannot be checked later, and nothing stops it from
being a verdict no real reviewer ever reached. The receipt turns that sentence into a
portable artifact that says three things plainly: what was reviewed, what the
verdict was, and which named standard the reviewer was bound to, signed so that a
later reader can tell whether it has been altered and who issued it.

It is built on the verify packet (references/cross-session.md): the diff, the spec,
and the rubric, with a content hash over all three. The receipt is an attestation
about that packet. Node built-ins only, so it works offline and in CI with no
dependencies.

## The honest split: what is deterministic and what is not

This is the part most "AI review" claims get wrong, so the receipt states it out
loud. The receipt verifies two different kinds of thing, and only one of them is a
machine fact.

```
DETERMINISTIC (a machine re-checks this and gets the same answer every time):
  - the evidence bundle re-hashes bit-identically to the signed subject hash
    (tamper-evidence: the diff/spec/rubric are exactly what was reviewed), and
  - the Ed25519 signature is valid for a public key the verifier trusts
    out of band (provenance: who issued this verdict).

PROBABILISTIC (a judgment, not a machine fact, and the receipt does not pretend
otherwise):
  - the verdict itself is an AI judgment. Re-running the review in a cold context
    confirms the verdict falls within a declared agreement band (k of n agree),
    NOT that a re-judge returns a bit-identical verdict.
```

So the receipt's cryptography proves integrity and provenance. It does not, and
cannot, prove the verdict is correct. What it gives you is a tamper-evident,
attributable record plus a manifest for re-judging, so a doubter can re-run the
review against the same packet and the same rubric and see whether the verdict
holds up. A verified receipt means "this verdict was really issued by this key over
this exact evidence", not "this verdict is true".

## The shape (in-toto Statement, ReviewVerdict predicate)

The signed object is an in-toto Statement, the same envelope supply-chain
attestations use, so the receipt is not a bespoke format:

```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [{ "name": "verify-packet", "digest": { "sha256": "<packet hash>" } }],
  "predicateType": "https://eidolon.dev/ReviewVerdict/v0",
  "predicate": {
    "framework_anchor": "OWASP ASVS v5.0.0",
    "evidence_contract": "every finding carries literal evidence (file:line, tool output, or URL + response)",
    "verdict": "PASS",
    "rubric_uri": null,
    "rejudge_manifest": {
      "packet_sha256": "<packet hash>",
      "judge_model": "claude-...",
      "rubric_version": null,
      "agreement_band": "re-judge confirms the verdict within a declared agreement band (k of n), NOT a bit-identical verdict"
    }
  }
}
```

The whole Statement is signed; the signature lives in an outer envelope next to it:

```json
{ "statement": { ... }, "signature": { "alg": "ed25519", "value": "<base64>", "key_id": "<sha256(pubkey) first 16 hex>" } }
```

The envelope carries the key_id, which is a hint, not the key. Verification needs a
public key supplied separately, so a receipt can never vouch for itself.

## The anti-synthetic rail, at issue time

The rail that runs everywhere else in the harness (no named framework anchor, no
seat) applies here too: `buildReceipt` refuses to produce a statement with an empty
or whitespace anchor, and the CLI cannot smuggle one past it. An option-shaped or
missing `--anchor` value (for example `issue --anchor --verdict PASS`, or a shell
that drops an empty `--anchor ""`) is treated as absent by `optionValue`, so it
fails closed with "no anchor, no receipt" rather than silently anchoring the
verdict to the next flag. A receipt always names the standard the reviewer
answered to, or it does not exist.

## What verify checks, and what it refuses to claim

`verifyReceipt({ receipt, files, publicKeyPem })` and the `verify` CLI command do
exactly two checks, both deterministic, and report each problem by name:

1. Re-hash the packet files and compare to the subject hash inside the signed
   statement. The subject hash is read from the signed statement, never from a
   manifest on disk, so a tampered manifest cannot move the target.
2. Verify the Ed25519 signature over the canonical statement using the
   caller-supplied public key. The self-described `alg` field is not consulted to
   choose an algorithm, and no key material from inside the receipt is trusted, so
   there is no algorithm-substitution or self-signing bypass.

The `--pubkey` argument is required on `verify` by design. Verifying against the key
embedded in an artifact you were handed proves nothing; you verify against a key you
already trust, or you do not verify at all. On success the CLI prints, in plain
words, that the check was deterministic only and that the verdict should be
re-judged in a cold context to confirm it within the agreement band.

## The CLI

```
node scripts/review-receipt.mjs keygen --out KEYDIR
  writes an Ed25519 keypair. Share review-public.pem with whoever verifies; keep
  review-private.pem private.

node scripts/review-receipt.mjs issue --packet DIR --anchor "OWASP ASVS v5.0.0" \
    --verdict PASS --key PRIV.pem [--out FILE] [--model NAME] [--rubric URI]
  hashes the packet, builds the ReviewVerdict statement (refusing an empty anchor),
  signs it, and writes the receipt.

node scripts/review-receipt.mjs verify --receipt FILE --packet DIR --pubkey PUB.pem
  re-hashes the packet and checks the signature against the trusted key. Exit 0
  only if both deterministic checks pass.
```

## Where it sits in the pipeline

The build pipeline already assembles a verify packet at the VERIFY stage and runs a
cold-context review against it. The receipt is what CLOSE can emit on top of that: a
signed record of the verdict the review reached, anchored to the standard it used,
that travels with the change. For a change reviewed against a real framework, the
receipt is the durable proof that the review happened and against what, in a form a
later auditor, a teammate, or a future session can check without trusting anyone's
memory.

## The upgrade path for public, third-party-auditable receipts

The Ed25519 envelope is the right default for a single person or a small team:
offline, no service, no account, you hold the key and you hand the public half to
whoever verifies. Its limit is key distribution. A third party who does not already
trust your key has no way to know the signing key was really yours, and there is no
public, append-only record that the receipt existed at a given time.

For that setting the envelope can be swapped for keyless signing without changing
the predicate or the deterministic-vs-probabilistic split:

```
Sigstore (cosign) keyless signing  -> bind the signature to an OIDC identity
                                       (a verified email or a CI workload identity)
                                       instead of a long-lived private key.
Rekor transparency log             -> record the signature in a public, append-only
                                       log, so its existence and time are auditable
                                       by anyone, and the signer cannot later deny it.
```

The receipt's body (the in-toto Statement and the ReviewVerdict predicate) is
unchanged; only the signing and trust layer is upgraded. The honest framing stays
the same: keyless signing strengthens provenance and non-repudiation, it still does
not make the verdict itself a machine fact.

## What the receipt is not

- It is not a proof that the verdict is correct. It is a proof of integrity and
  provenance plus a manifest for re-judging.
- It is not a trust root. A verified signature is only as meaningful as your reason
  to trust the public key you verified against.
- The key_id is a 64-bit hint for a friendlier mismatch message, not a security
  boundary. The signature check against the trusted key is the only authority.
- It does not store or transmit the private key. The receipt carries the key_id, the
  public half is shared deliberately, and the private half never leaves the issuer.
