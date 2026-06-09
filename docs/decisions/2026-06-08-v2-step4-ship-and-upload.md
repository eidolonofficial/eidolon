# Decision log: 2026-06-08 v2 step 4 (ship and upload)

Append-only. Records the ship-and-upload swarm, its personas, the SHIP stage
wiring, and the process used.

## What was built

| Artifact | Purpose |
|---|---|
| `references/ship-upload-swarm.md` | The deploy-readiness interview (reuses Interview Mode) and the SHIP stage; the readiness checklist with a literal signal per item; the seeded missing-env-var / staged-secret fire drill; no deploy on a red gate; the user is the final eyes. |
| `references/personas/devops-release-engineer.md` | The ship persona for build, deploy, rollback, and the readiness gates (anchors: production-readiness checklist, blue-green/canary, tested rollback, Twelve-Factor build/release/run, DORA change-failure-rate and time-to-restore, SemVer). |
| `references/personas/documentation-architect.md` | The ship persona for the docs a newcomer needs (anchors: Diataxis, Keep a Changelog, SemVer 2.0.0, Twelve-Factor onboarding, the clean-clone trace). |
| `SKILL.md` | A new SHIP stage in the pipeline, after gate 3 and before CLOSE, in both the staged-line diagram and the numbered build-mode steps; referenced in the Governance block. |

## How it was built (the process record)

The productive-minding pattern again: the two ship personas were drafted by a
parallel background workflow, and while it ran the ship swarm reference and the
SHIP pipeline wiring were written inline, with liveness checks against the
workflow transcript between each (agent files growing = alive). The workflow was
block-waited at the dependency point and completed (two agents, about five
minutes). Claude stayed the sole filesystem writer.

## Verification

A cold reviewer checked the ship swarm ref and the SHIP wiring against design spec
sections 4, 5, 6, 16, 17, and the personas' anchor grounding. Verdict CLEAN (no
high findings); two LOW notes, dispositioned:

```yaml
e2e_runner_in_loadout:  the loadout names e2e-runner, which is an agent not an installed
                        skill - but the ref mirrors spec section 16 exactly (nine for nine),
                        so the mismatch is in the frozen spec, not this file. Left faithful:
                        changing it would introduce drift from the spec.
ship_in_tier_ladder:    the SHIP line had been added to the risk-tier block; SHIP is a stage
                        (already in the diagram and step 9), not a risk tier (section 12 has
                        three). Fixed: removed from the ladder, kept as a one-line note.
post:                   both personas persona-lint PASS, anchors all real and correctly named,
                        swarm field "ship"; all files dash-clean; scrub clean; selfcheck PASS.
```

## Decision

The pipeline now carries the SHIP stage: the ship-and-upload swarm runs a
deploy-readiness interview and gates the deploy on a green checklist with literal
per-item signals and clean upstream manifests, with the user as the final eyes.
Next v2 steps: expert hiring + find-skills (step 5), then the full antibehavior
catalog and the rest of the hook suite and scaling tiers (step 6).
