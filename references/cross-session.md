# Cross-session swarms (the higher isolation tier)

v1 and v2 run the swarms as in-session subagents, with a cold-context VERIFY
spawned holding only the diff, the spec, and the rubric. Cross-session is the
stronger form: the verifier, or a swarm, runs in its own session, so it cannot
inherit the build's reasoning at all, because a separate process shares none of
the build's context. This is the two-signal rule taken to genuine process isolation. It is deferred past v2 as a default and graduated
per run.

## When to graduate (decided at PLAN)

```yaml
by_tier:    high-risk or broad changes (auth, payments, PII, public surface), where
            the cost of a wrong PASS is high, justify the extra isolation
by_ceiling: a separate session costs more and is slower than an in-session subagent;
            the cost ceiling bounds it, and the tier decides when it is worth it
override:   a checkpoint decision the user can override: graduate this run, or stay
            in-session with the cold-context verifier
```

## Why it is possible (the enabling fact)

Everything the verifier needs is already a durable artifact on disk: the diff, the
spec, the rubric, the coverage manifest, and the disposition table (design spec
section 7). So a separate session can pick up from the same artifacts. The
in-session cold-context verifier already reads only these; cross-session just runs
that same read in a separate process with zero conversation inheritance.

## The handoff contract (the verify packet)

A cold session verifies from one self-contained packet and nothing else.

```yaml
packet:                                  # assembled by scripts/verify-packet.mjs
  diff.patch:    the change under review (git diff base..work)
  spec.md:       the approved spec, the acceptance criteria
  rubric.md:     the verify rubric (security, functional, encoding, spec-conformance)
  manifest.json: base_sha, the file list, and a content hash, so the packet is
                 reconstructable and tamper-evident
verdict:                                 # written back to disk by the cold session
  result:        PASS | red, with file:line findings and which rubric item each fails
  contract:      the cold session reads ONLY the packet and writes ONLY the verdict;
                 no conversation, no inheritance, no shared context
```

The orchestrator assembles the packet, the cold session verifies from it, and the
orchestrator reads the verdict back and runs the bounded fix loop on red exactly as
it does in-session. The packet is self-contained by construction, which is precisely
what makes a separate-session read possible.

## The mechanism

```
PLAN graduates this run to cross-session
  -> orchestrator runs verify-packet.mjs (assemble diff + spec + rubric + manifest)
  -> spawn a fresh session given ONLY the packet path, no conversation context
     (a headless run, or a worktree-isolated agent)
  -> the cold session re-derives PASS or red from the packet and writes the verdict
  -> orchestrator reads the verdict; red under three tries -> bounded FIX loop
```

The in-session approximation hands a subagent only the packet, with none of the
build conversation; the cross-session form runs that same self-contained read in a
separate process. The packet, and its content hash, is the contract both forms share.

## Trade-offs

```yaml
stronger:  genuine process isolation; running in a separate process, the verifier
           shares none of the build's context and cannot see its reasoning
cost:      a separate session is slower and costs more; the cost ceiling bounds it
fallback:  where cross-session is unavailable or the budget does not justify it, the
           in-session cold-context verifier reads the same packet; the property that
           matters (verify from on-disk artifacts only) holds in both
```

## How it composes

```yaml
scaling:  cross-session is the high-risk graduation (references/scaling.md); the cost
          ceiling bounds it
verify:   the VERIFY stage runs in-session by default; on a graduated run it assembles
          the packet and verifies cross-session
packet:   self-contained by construction (scripts/verify-packet.mjs), tamper-evident by
          its content hash, so the verdict is reconstructable
```

## Where this is grounded

Design spec section 15 open question 1 (resolved: in-session for v1 and v2, cross-session
the graduation), section 12 (the tiers and the cost ceiling), and section 7 (inputs are
durable artifacts on disk, so the verifier is reconstructable from them).
