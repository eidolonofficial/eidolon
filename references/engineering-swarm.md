# Engineering swarm

The swarm that builds, so BUILD is a disciplined crew instead of a generic stage.
It builds against the spec one task at a time, a test written first per task, and
it is staffed by engineering personas constructed from the persona template
(references/persona-template.md). The swarm carries six, each seated by the tier
and surface of the change: full-stack engineer, backend and data engineer,
frontend engineer, interaction and UX designer, information architect, and
developer-experience engineer.

Like every swarm, it follows the two-signal rule, returns literal evidence (never
"I built it and it works"), and every claim carries `file:line`, what was checked,
and the signal that proved it.

## How it builds

```yaml
unit:        one task at a time, dependency-ordered, each with an acceptance check
test_first:  for each task, the test is written first and must be red before the
             change exists, then green after (the red-then-green is the evidence)
against_spec: the change is measured against the spec's acceptance criteria, not a guess
no_drift:    a new idea goes to the work queue, never into the live task's diff
elegance:    a mandatory pause on non-trivial work: is there a smaller, simpler change?
```

## The hardening pattern (the five parts, tuned to engineering)

```yaml
named_failure_mode:  stub instead of fix; "works" with no test; the test-first step skipped
evidence_it_hands_over: per task, a test red before the change and green after, named with
                     the behavior it checks; the build matches the spec's acceptance criteria
coverage_manifest:   per task, what was built, what its test checks, and what was left out
                     of scope and why. Absence of a failing case is never read as covered.
fire_drill:          a seeded failing test must actually fail before implementation. If the
                     planted test passes against an empty implementation, the test does not
                     guard behavior and test-first is not proven; the run halts.
closeout_gate:       no task closes without its acceptance test green AND confirmed red-first;
                     a stub, a TODO, or a NotImplementedError blocks closeout (a hook enforces it)
```

## The seeded-failing-test fire drill (how test-first is proven)

```
before building a task:
  write the task's test
  run it against the current (not-yet-built) code
    test FAILS  ->  good: the test guards the behavior; now build until it passes
    test PASSES ->  halt: the test does not actually check the new behavior, so a
                    later green proves nothing. Fix the test before building.
```

This is the engineering analogue of the security swarm's seeded-defect drill: a
swarm is not trusted until it proves its own check can fail.

## Evidence contract (per task)

```yaml
required: [the test name and the behavior it checks,
           the test output RED before the change,
           the test output GREEN after the change,
           the spec acceptance line the change satisfies,
           the diff that made it pass]
rejected: ["I implemented it", "it works", "looks done", a green with no prior red]
```

## What blocks closeout

```yaml
stub_or_todo:        a stub, TODO, or NotImplementedError in the task's deliverable
no_red_first:        a passing test with no evidence it failed before the change
suite_red:           the build or the full suite left red
spec_mismatch:       the change does not meet the spec acceptance line it claimed
scope_drift:         changes outside the task's stated scope landed in the diff
```

A task that hits any of these is reopened, not counted. The persona-conduct guard
(hooks/persona-conduct-guard.mjs) catches the engineering-specific anti-behaviors
(ship-stub-as-done, skip-test-first, scope-drift-into-live-diff) by name.

## Where it sits in the pipeline

BUILD dispatches this swarm. Each task runs test-first against the spec; the
swarm hands its per-task red-then-green evidence forward to REVIEW (the security
swarm in v1, more swarms in later v2 steps) and then to the cold-context VERIFY.
The engineering swarm never reviews its own work as the final signal; that is what
the cold verifier and the review swarms are for.

## Where this is grounded

The engineering swarm's role is design spec section 6; its hardening pattern and
the per-swarm instantiation are section 17; its installed-skill loadout is section
16. The persona that staffs it is built from references/persona-template.md
(section 19).
