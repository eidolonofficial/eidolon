# Eidolon v2: scope and build path

v1 proved the spine: the staged pipeline, one review swarm (security), Explain
Mode, and a minimal hook suite, all validated by a canary run. v2 turns the
generic stages into a staffed crew. This document freezes the v2 build path and
its first buildable slice, the same way design-spec section 21 froze v1, so the
work does not sprawl.

## What v1 already has (do not rebuild)

```yaml
pipeline:   Modes router + SPECIFY->PLAN->BUILD->REVIEW->VERIFY->FIX->CLOSE,
            cold-context verify, fix loop bounded at three, two human gates
review:     exactly one swarm, security (red and blue), with the five anti-handwave gates
explain:    Explain Mode (favorite-teacher disposition, comprehension checks)
hooks:      three (verification, commit-quality, append-only-record)
```

## The dependency spine (why this order)

```
persona system  ->  is the foundation every swarm is staffed from (section 19)
      |
engineering swarm  ->  the first consumer of the persona system; makes BUILD a
      |                 real, hardened, TDD-per-task crew (not a generic stage)
the other review swarms + architect synthesis  ->  T&S and code-review add review
      |                 breadth; the architect's disposition table only earns its
      |                 keep once more than one swarm produces findings
ship-and-upload  ->  extends the pipeline to SHIP; reuses Interview Mode
      |
expert hiring + find-skills  ->  generate grounded personas / pull skills; both
      |                 depend on the persona system and the registries existing
full antibehavior catalog + complete hook suite + scaling  ->  hardening breadth;
                        the persona-conduct guard depends on personas declaring
                        anti-behaviors, so it rides with the persona system
```

## The v2 build path

```yaml
step_1: persona system        # the construction template + two-layer anti-behaviors
                              # + the persona-conduct guard hook
step_2: engineering swarm     # builds against the spec, TDD per task, anti-handwave
                              # hardening; staffed from the persona system
step_3: review breadth        # trust-and-safety + code-review swarms, and the
                              # solutions architect synthesis + disposition table
step_4: ship and upload       # the deploy-readiness interview (reuses Interview Mode)
                              # and the SHIP stage
step_5: expert hiring         # per-persona generation against the template + the
                              # anti-synthetic rail; find-skills reach beyond installed
step_6: hardening breadth     # the full antibehavior catalog (section 10) and the
                              # rest of the hook suite (section 11); scaling tiers,
                              # cost-ceiling enforcement, the cross-session decision
```

## v2 slice 1: the first buildable slice (frozen)

The smallest increment that proves the next spine capability: **Eidolon staffs a
swarm from a reusable construction template, and that swarm does disciplined,
self-bounded work.** v1's analogue was "pipeline skeleton plus one swarm"; v2
slice 1 is "persona system plus one more swarm (engineering)."

**In slice 1:**

- **The persona construction template** as a reference (`references/persona-template.md`):
  the ten parts every persona carries (title and mandate, expertise, authoritative
  anchors, review lens, failure modes owned, evidence contract, anti-behaviors,
  escalation triggers, retooled loadout, swarm and voice), the persona file format,
  and the rule that a persona with no framework anchor and no evidence contract is
  rejected (the anti-synthetic rail).
- **The two-layer anti-behaviors**, documented in the template: the shared
  destructive floor (every persona) plus persona-specific anti-behaviors scoped to
  blast radius.
- **The persona-conduct guard hook** (`hooks/persona-conduct-guard.mjs`): checks a
  seated persona's action against its own declared anti-behaviors; on a match it
  halts and names the persona and the line it crossed. Fire-drilled across
  block and allow paths, I/O contract mirroring the existing hooks.
- **The engineering swarm** as a reference (`references/engineering-swarm.md`):
  builds against the spec one task at a time, TDD per task, with its anti-handwave
  hardening (a seeded failing test must fail before implementation; no stub or
  NotImplementedError as done; the evidence contract is a test red-before and
  green-after, plus the build matching the spec's acceptance criteria).
- **One engineering persona built from the template**
  (`references/personas/fullstack-engineer.md`): the full-stack engineer (the
  elegant minimal change across the seam, allergic to both laziness and
  over-engineering), as the concrete proof the template produces a fully formed,
  bounded persona.
- **BUILD wired to the swarm** in `SKILL.md`: the BUILD stage dispatches the
  engineering swarm and seats the persona, instead of building generically.

**Deferred to later v2 steps (explicitly out of slice 1):**

- The other engineering personas (backend, frontend, UX, information architect,
  developer experience) and the full base roster.
- The trust-and-safety, code-review, and ship-and-upload swarms.
- The solutions architect synthesis and the disposition table.
- Expert hiring, per-persona generation at runtime, and find-skills reach.
- The full antibehavior catalog and the rest of the hook suite.
- Cross-session swarms and the higher scaling tiers.

**Slice 1 is done when:** a canary build run produces a spec, the engineering
swarm (staffed from the construction template) builds it one task at a time with
a test written first, the seeded-failing-test fire drill confirms test-first (a
planted test fails before the implementation exists), the persona-conduct guard
halts a seeded anti-behavior violation at the right `file:line`, and Close commits
with a decision-log entry. That proves the persona system and the engineering
swarm work end to end, the way v1's canary proved the pipeline and the security
swarm.

## How slice 1 was scoped (the three lenses, applied)

```yaml
minimality:   one engineering persona, not six; one new swarm, not four. The
              persona system needs a consumer to prove it, and the engineering
              swarm is the smallest consumer that proves real new capability.
dependencies: the persona system precedes every swarm (all swarms are staffed
              from it); the persona-conduct guard rides with it because it depends
              on personas declaring anti-behaviors. Nothing in slice 1 depends on
              a later step. All of it builds on v1 only.
spec_fidelity: every artifact maps to a named spec section (template -> 19;
              anti-behaviors -> 19; conduct guard -> 11; engineering swarm and its
              hardening -> 6, 16, 17). No over-claim past what one slice proves.
```
