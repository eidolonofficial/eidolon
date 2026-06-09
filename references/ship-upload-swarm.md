# Ship and upload swarm

The swarm that runs a deploy-readiness interview, then deploys. It is the SHIP
stage: it sits after VERIFY and the visual/runtime gate and before CLOSE. Nothing
ships on a red gate, every deploy can be reverted, and the user is the final eyes
on the deploy. Staffed by the devops and release engineer and the documentation
architect personas (references/personas/devops-release-engineer.md,
references/personas/documentation-architect.md).

Like every swarm, it follows the two-signal rule and returns literal evidence:
each readiness item with the signal that proves it, not a claim that it is ready.

## The deploy-readiness interview (reuses Interview Mode)

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

## The readiness checklist (each item with its literal signal)

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

## The hardening pattern (the five parts, tuned to ship and upload)

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

## The seeded fire drill (does the ship gate actually hold?)

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

## Evidence contract

```yaml
required: [each readiness item with its literal signal (the green build, the present
           env var, the clean secret scan, the tested rollback, the clean upstream
           manifests, the health check), and the recorded interview answers]
rejected: ["it is ready to ship", "deploy looks good", a green checklist with no
           per-item signal, a deploy with no tested rollback]
```

## What blocks closeout

```yaml
red_gate:        any readiness item not green with evidence
dirty_upstream:  any upstream swarm manifest not clean
no_rollback:     a deploy with no tested revert path
staged_secret:   a secret staged into the artifact or the repo
missing_env:     a required env var absent at deploy time
no_user_signoff: a deploy not approved by the user as the final eyes
```

## Where it sits in the pipeline

SHIP runs at the tier the change calls for, after VERIFY passes and the visual or
runtime gate clears, and before CLOSE. Its checklist roll-up requires every
upstream manifest to be clean, so the chain is only as shippable as its weakest
verified link. A deploy is surfaced to the user for the final go.

## Installed-skill loadout

```yaml
from_installed: [shipping-and-launch, deploy-guide, monitor-setup, ci-cd-and-automation,
                 git-workflow-and-versioning, review-pr, e2e-runner, verify, run]
```

## Where this is grounded

The role and the deploy-readiness interview are design spec section 6; the SHIP
stage placement is section 4; the hardening pattern and the per-swarm instantiation
are section 17; the loadout is section 16. The personas that staff it are built
from references/persona-template.md (section 19).
