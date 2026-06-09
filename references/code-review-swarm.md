# Code review swarm

The swarm that optimizes and removes redundancy, behavior-preserving by contract.
It may simplify and de-duplicate, but a change that alters behavior is a finding
for the engineering swarm, never a silent edit. Staffed by the QA and test lead
persona (references/personas/qa-test-lead.md).

Like every swarm, it follows the two-signal rule and returns literal evidence:
the test suite green identically before and after, and a diff of exactly what was
simplified or deduped.

## The contract

```yaml
behavior_preserving: the suite is green identically before and after; the same
                     tests pass, none deleted, none weakened
simplify_and_dedup:  collapse duplication, remove dead code, clarify a tangled path,
                     reduce a needless abstraction, all without changing what runs
behavior_change:     any edit that alters behavior is a FINDING handed to engineering,
                     not applied here. Code review proposes; engineering builds.
guarding_proof:      a refactor is only safe if the suite actually guards behavior;
                     where it does not, the gap is a finding before any cleanup
```

## The hardening pattern (the five parts, tuned to code review)

```yaml
named_failure_mode:  a behavior-changing edit disguised as a cleanup
evidence_it_hands_over: the test suite green identically before and after (the same
                     passing set), plus a diff of what was simplified or deduped
coverage_manifest:   what was simplified, what was left alone and why, and which
                     parts had no behavior-guarding test (so a refactor there is unsafe)
fire_drill:          a planted behavior change must trip a test failure before the
                     real pass; if it does not, the suite does not guard behavior and
                     no refactor there is trusted; the run surfaces the coverage gap
closeout_gate:       no refactor ships unless the suite is green identically before
                     and after; a behavior change goes to engineering as a finding
```

## The fire drill (does the suite actually guard behavior?)

```
before trusting a refactor of a region:
  plant a small behavior change in that region
  run the suite
    a test FAILS  ->  good: the suite guards this behavior; the planted change is
                      reverted and the real refactor proceeds
    all PASS      ->  the suite does NOT guard this behavior; a refactor here is
                      unsafe. Surface the coverage gap as a finding; do not refactor
                      blind.
```

This is the code-review analogue of the security swarm's seeded-defect drill and
the engineering swarm's seeded-failing-test drill: prove the safety net before
trusting it.

## Evidence contract

```yaml
required: [the suite result before (the passing set),
           the suite result after (the same passing set, identical),
           the diff of what was simplified or deduped,
           for any behavior change found: the file:line and the proposed handoff to engineering]
rejected: ["cleaned it up", "simpler now", a green after with no identical green before,
           a refactor in a region with no behavior-guarding test]
```

## What blocks closeout

```yaml
suite_not_identical:  the passing set differs before vs after (a test removed, skipped,
                      or weakened to go green)
silent_behavior_change: a behavior change applied here instead of handed to engineering
unsafe_refactor:      a refactor in a region the fire drill showed is unguarded, with
                      no coverage gap surfaced first
```

## Where it sits in the pipeline

Code review runs in REVIEW at every tier. At trivial it tidies a one-file change;
from standard up it runs in parallel with the security and trust-and-safety swarms.
Its behavior-preserving proof protects against a cleanup silently breaking what the
other swarms verified.
Behavior-change findings flow to engineering; simplification diffs and coverage
gaps flow to the solutions architect's disposition (references/architect-synthesis.md).

## Installed-skill loadout

```yaml
from_installed: [code-review, simplify, code-simplification, refactor-clean,
                 performance-optimization, comment-analyzer, type-design-analyzer,
                 silent-failure-hunter, pr-test-analyzer, test-coverage,
                 finding-duplicate-functions, multi-execute (its audit-and-fix loop)]
```

## Where this is grounded

The role and the behavior-preserving contract are design spec section 6; the
hardening pattern and the per-swarm instantiation are section 17; the loadout is
section 16. The persona that staffs it is built from references/persona-template.md
(section 19).
