# The staffed swarms (engineering, code review, trust and safety, ship and upload)

The four staffed swarms of the pipeline in one place: the swarm that builds
(BUILD), the two that review alongside the security swarm (REVIEW), and the one
that deploys (SHIP). The security swarm keeps its own doc
(references/security-swarm.md), as does the architect synthesis that ingests
every swarm's findings (references/architect-synthesis.md). Each section below
preserves that swarm's roster, contract, hardening pattern, and fire drill.

## The lens verdict (security, trust and safety, code review, ship and upload)

```yaml
# why: a lens that reports prose can be read as clean; a score, a pass or fail, and evidence cannot
lenses:     [security (references/security-swarm.md), trust_safety, code_review, ship_upload]
verdict:
  score:    0 to 1, the share of the lens's coverage manifest checked with evidence
  result:   pass | fail
  evidence: file:line, command output, or the failing element, per finding and per clean claim
rule:       a lens fails on any blocker in its "What blocks closeout" list, whatever its score;
            the score measures coverage, never a pass threshold
fire_drills:
  security:     a planted vulnerability caught at the right file:line (security-swarm.md)
  trust_safety: a seeded PII-in-logs line and an unlabeled input caught
  code_review:  a planted behavior change trips a suite failure
  ship_upload:  a seeded missing env var or staged secret blocks the ship gate
```

- Run the lens's fire drill before its real pass; a miss halts that lens.
- Return the verdict as the first block of the lens report, ahead of the findings.
- Treat a lens with no fire drill, no manifest, or no evidence as fail, not as clean.
- Route every verdict and finding to the architect disposition (references/architect-synthesis.md).

## Engineering swarm

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

### How it builds

```yaml
unit:        one task at a time, dependency-ordered, each with an acceptance check
test_first:  for each task, the test is written first and must be red before the
             change exists, then green after (the red-then-green is the evidence)
against_spec: the change is measured against the spec's acceptance criteria, not a guess
no_drift:    a new idea goes to the work queue, never into the live task's diff
elegance:    a mandatory pause on non-trivial work: is there a smaller, simpler change?
```

### The hardening pattern (the five parts, tuned to engineering)

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
                     a stub, a TODO, or a NotImplementedError blocks closeout (the conductor checks it by state)
```

### The seeded-failing-test fire drill (how test-first is proven)

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

### Evidence contract (per task)

```yaml
required: [the test name and the behavior it checks,
           the test output RED before the change,
           the test output GREEN after the change,
           the spec acceptance line the change satisfies,
           the diff that made it pass]
rejected: ["I implemented it", "it works", "looks done", a green with no prior red]
```

### What blocks closeout

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

### Where it sits in the pipeline

BUILD dispatches this swarm. Each task runs test-first against the spec; the
swarm hands its per-task red-then-green evidence forward to REVIEW (the security,
trust-and-safety, and code-review swarms) and then to the cold-context VERIFY.
The engineering swarm never reviews its own work as the final signal; that is what
the cold verifier and the review swarms are for.

### Where this is grounded

The engineering swarm's role is design spec section 6; its hardening pattern and
the per-swarm instantiation are section 17; its installed-skill loadout is section
16. The persona that staffs it is built from references/persona-template.md
(section 19).

## Code review swarm

The swarm that optimizes and removes redundancy, behavior-preserving by contract.
It may simplify and de-duplicate, but a change that alters behavior is a finding
for the engineering swarm, never a silent edit. Staffed by the QA and test lead
persona (references/personas/qa-test-lead.md).

Like every swarm, it follows the two-signal rule and returns literal evidence:
the test suite green identically before and after, and a diff of exactly what was
simplified or deduped.

### The contract

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

### The hardening pattern (the five parts, tuned to code review)

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

### The fire drill (does the suite actually guard behavior?)

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

### Evidence contract

```yaml
required: [the suite result before (the passing set),
           the suite result after (the same passing set, identical),
           the diff of what was simplified or deduped,
           for any behavior change found: the file:line and the proposed handoff to engineering]
rejected: ["cleaned it up", "simpler now", a green after with no identical green before,
           a refactor in a region with no behavior-guarding test]
```

### What blocks closeout

```yaml
suite_not_identical:  the passing set differs before vs after (a test removed, skipped,
                      or weakened to go green)
silent_behavior_change: a behavior change applied here instead of handed to engineering
unsafe_refactor:      a refactor in a region the fire drill showed is unguarded, with
                      no coverage gap surfaced first
```

### Where it sits in the pipeline

Code review runs in REVIEW at every tier. At trivial it tidies a one-file change;
from standard up it runs in parallel with the security and trust-and-safety swarms.
Its behavior-preserving proof protects against a cleanup silently breaking what the
other swarms verified.
Behavior-change findings flow to engineering; simplification diffs and coverage
gaps flow to the solutions architect's disposition (references/architect-synthesis.md).

### Installed-skill loadout

```yaml
from_installed: [code-review, simplify, code-simplification, refactor-clean,
                 performance-optimization, comment-analyzer, type-design-analyzer,
                 silent-failure-hunter, pr-test-analyzer, test-coverage,
                 finding-duplicate-functions, multi-execute (its audit-and-fix loop)]
```

### Where this is grounded

The role and the behavior-preserving contract are design spec section 6; the
hardening pattern and the per-swarm instantiation are section 17; the loadout is
section 16. The persona that staffs it is built from references/persona-template.md
(section 19).

## Trust and safety swarm

The swarm that checks who is harmed, excluded, or exposed. It reviews harm,
abuse, privacy and PII, accessibility, and fairness, with the person on the
steepest gradient as the design floor. Staffed by the trust-and-safety and
accessibility architect persona (references/personas/trust-safety-architect.md).

Like every swarm, it follows the two-signal rule, returns literal evidence, and
every finding carries `file:line`, the category, the standard it cites, and the
signal that caught it. Absence of a finding is never read as clean: the report
opens with what was checked.

Dispatching this swarm is one of the sensitive dispatches the consent gate covers
(hooks/guard-dispatch.mjs; references/security-policy.md).

### Methodology and anchors

```yaml
privacy:        GDPR and CCPA - lawful basis, data minimization, purpose limitation,
                the right to erasure; PII at rest and in motion, in logs, in errors
accessibility:  WCAG 2.2 Level AA - the keyboard path, focus, contrast, status
                messages, target size; the failing element and the exact criterion
harm_and_abuse: the trust-tree harm and abuse branches - who can be hurt, who can
                weaponize the feature, what the most vulnerable user meets first
fairness:       a recognized AI-risk or fairness frame (e.g. NIST AI RMF) when the
                change ranks, scores, filters, or decides about people
floor:          the zero-point user is the design floor; equity is not a value-add,
                it is the floor, and accessibility retrofitted costs far more than
                accessibility designed in
```

### The hardening pattern (the five parts, tuned to trust and safety)

```yaml
named_failure_mode:  survivorship bias - "no issues" with no coverage stated
evidence_it_hands_over: per category (PII, a11y, harm, abuse, fairness) the literal
                     check and its result; the WCAG criterion plus the failing element;
                     the PII field plus the file:line where it leaks
coverage_manifest:   the categories run, what each found, what was confirmed clean,
                     and what was not run and why. Absence of a finding is never clean.
fire_drill:          a seeded PII-in-logs line and an unlabeled input must be caught
                     before the real pass; a miss halts the run
closeout_gate:       the trust-and-safety manifest is required; a high-severity harm
                     or PII finding blocks (the conductor checks it by state)
```

### Evidence contract (per category)

```yaml
privacy:        the PII field and its file:line; whether it is logged, stored, or
                sent; the lawful basis or the absence of one
accessibility:  the exact WCAG criterion (number and name), the failing element, and
                the keyboard or assistive-tech path that breaks
harm_abuse:     the concrete actor and the concrete harm; who is excluded and what
                they meet first; not "this could be misused"
fairness:       the input that drives the decision, the group it disadvantages, and
                the measured or reasoned disparity
rejected:       "no privacy issues", "looks accessible", "seems fair", any clean
                claim with no coverage section
```

### What blocks closeout

```yaml
no_manifest:        the coverage manifest is missing or does not state what was not run
high_harm_or_pii:   a high-severity harm finding or a PII leak with no remediation
a11y_signoff_alone: conformance signed off from a linter alone, with no element-level
                    evidence or keyboard walk-through, on a change that needs an audit
```

A finding that exceeds self-assessment (a formal privacy assessment, an assistive
technology audit) is escalated to independent review, not faked. The swarm says so.

### Where it sits in the pipeline

Trust and safety runs in REVIEW at standard tier and above, in parallel with the
security swarm. Its findings flow to the solutions architect for one ordered
disposition (references/architect-synthesis.md). A high-severity harm or PII
finding is surfaced one at a time via AskUserQuestion with the liability line:
who is harmed if this is wrong, and the legal exposure.

### Installed-skill loadout

```yaml
from_installed: [a11y-architect, design-accessibility-review, trust-but-verify
                 (privacy and a11y branches), eu-ai-act-check, security-check,
                 whole-person-check, legal compliance-check, legal-risk-assessment]
```

### Where this is grounded

The role is design spec section 6; the hardening pattern and the per-swarm
instantiation are section 17; the loadout is section 16. The persona that staffs
it is built from references/persona-template.md (section 19).

## Ship and upload swarm

The swarm that runs a deploy-readiness interview, then deploys. It is the SHIP
stage: it sits after VERIFY and the visual/runtime gate and before CLOSE. Nothing
ships on a red gate, every deploy can be reverted, and the user is the final eyes
on the deploy. Staffed by the devops and release engineer and the documentation
architect personas (references/personas/devops-release-engineer.md,
references/personas/documentation-architect.md).

Like every swarm, it follows the two-signal rule and returns literal evidence:
each readiness item with the signal that proves it, not a claim that it is ready.

### The deploy-readiness interview (reuses Interview Mode)

Before deploying, the swarm runs a short deploy-readiness interview in the
conversational Interview Mode pattern: one question at a time, reflecting back
what it heard, surfacing assumptions instead of filling them silently.

```yaml
covers:    where it deploys, who it affects, what the rollback is, what must be in
           place first (env vars, secrets, migrations, feature flags), and what
           "deployed and healthy" looks like in a way you could check
output:    a deploy-readiness checklist, each item with its literal signal, plus the
           interview answers recorded for the decision log
final_eyes: the user approves the deploy after the checklist is green; a screenshot
           or a health check proves the deploy happened, not that it is right
```

### The readiness checklist (each item with its literal signal)

```yaml
build:        the release build is green; the artifact exists and is the one tested
env_and_secrets: every required env var is present; no secret is staged into the
              artifact or the repo (a secret scan is clean)
migrations:   any migration has run (or is staged) with its rollback stated and tested
rollback:     the revert path is tested, not assumed; the previous version can be restored
upstream:     every upstream swarm manifest is clean (engineering, security, T&S,
              code-review, architect disposition); the chain is only as shippable as
              its weakest verified link
health:       the post-deploy health check and what a healthy state looks like
docs:         the changelog entry, the runbook, and the clean-clone onboarding path
```

### The hardening pattern (the five parts, tuned to ship and upload)

```yaml
named_failure_mode:  "ready" with no checklist; shipping on a red gate
evidence_it_hands_over: the deploy-readiness checklist, each item with its literal
                     signal; the interview answers
coverage_manifest:   every checklist item, its signal, and anything deferred and why;
                     plus a roll-up of the upstream swarm manifests
fire_drill:          a seeded missing env var or a staged secret must block the ship
                     gate before the real deploy; a miss halts the run
closeout_gate:       no deploy unless every item is green with evidence and all
                     upstream manifests are clean; the user is the final eyes
```

### The seeded fire drill (does the ship gate actually hold?)

```
before trusting the ship gate:
  seed a known blocker (a missing required env var, or a staged secret)
  run the readiness checklist
    the gate BLOCKS  ->  good: the gate holds; the seed is removed and the real
                         readiness pass proceeds
    the gate PASSES  ->  halt: the gate does not catch a real blocker, so a green
                         checklist proves nothing. Fix the gate before any deploy.
```

This is the ship analogue of the security swarm's seeded-defect drill: prove the
gate can fail before trusting it to pass.

### Evidence contract

```yaml
required: [each readiness item with its literal signal (the green build, the present
           env var, the clean secret scan, the tested rollback, the clean upstream
           manifests, the health check), and the recorded interview answers]
rejected: ["it is ready to ship", "deploy looks good", a green checklist with no
           per-item signal, a deploy with no tested rollback]
```

### What blocks closeout

```yaml
red_gate:        any readiness item not green with evidence
dirty_upstream:  any upstream swarm manifest not clean
no_rollback:     a deploy with no tested revert path
staged_secret:   a secret staged into the artifact or the repo
missing_env:     a required env var absent at deploy time
no_user_signoff: a deploy not approved by the user as the final eyes
```

### Where it sits in the pipeline

SHIP runs at the tier the change calls for, after VERIFY passes and the visual or
runtime gate clears, and before CLOSE. Its checklist roll-up requires every
upstream manifest to be clean, so the chain is only as shippable as its weakest
verified link. A deploy is surfaced to the user for the final go.

### Installed-skill loadout

```yaml
from_installed: [shipping-and-launch, deploy-guide, monitor-setup, ci-cd-and-automation,
                 git-workflow-and-versioning, review-pr, e2e-runner, verify, run]
```

### Where this is grounded

The role and the deploy-readiness interview are design spec section 6; the SHIP
stage placement is section 4; the hardening pattern and the per-swarm instantiation
are section 17; the loadout is section 16. The personas that staff it are built
from references/persona-template.md (section 19).
