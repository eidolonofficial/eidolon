# 2026-06-13 - Uncertainty resolution ladder + Opus-tier cascade + persona-per-leg

Status: ADOPTED (user-set 2026-06-13, during the FFR production push)

## Context

Fable was pulled, removing the prior conductor / top dispatch tier. The FFR
refactor is being driven to a production win state (deployable, not-a-joke,
scalable) as parallel swarms on an autonomous loop. Two doctrine gaps surfaced:

1. The uncertainty protocol resolved simple facts with a single research agent and
   forks with what-if-oracle, but had NO tier for complex, multi-faceted unknowns
   (deploy target, scaling architecture) that warrant parallel research.
2. The model cascade (`swarm-model-cascade` memory, `conductor-standard.md` section
   4) named Fable as the conductor / judgment tier. Fable is gone.

## Decision

**1. Uncertainty resolution ladder** (`conductor-standard.md` section 9; mirrored
into `~/.claude/CLAUDE.md` and FFR `CLAUDE.md`). Climb only as far as the stakes
require:
- tier 1 trivially checkable -> one research agent / docs-lookup, cited
- tier 2 complex / multi-faceted -> DISPATCH A RESEARCH SWARM (N parallel legs, one
  per facet, each cited) -> the conductor synthesizes a brief + recommendation
- tier 3 unresolved dilemma -> what-if-oracle (structured branch analysis)
- tier 4 true / irreversible fork -> user gate (oracle output + recommendation)
No swarm proceeds on an unverified assumption; hedged shipped language is a violation;
the research brief and the oracle branches are themselves cited artifacts.

**2. Model cascade** (`conductor-standard.md` section 4; `swarm-model-cascade`
memory), superseding the Fable-tier note:
- conductor = Opus 4.8 (1M), inline, the hivemind (holds full context, authors
  self-contained leg prompts, does synthesis + all delicate / canonical / infra
  edits, never delegated)
- fan-out: opus 4.7 (premium) > sonnet (workhorse) > haiku (doc-edits only)
- escalation: a broken opus-4.7 leg -> an Opus 4.8 (1M) leg; still fails -> re-plan

**3. Persona per leg** (reaffirms and sharpens `conductor-standard.md` section 3):
every swarm leg seats a persona exclusively tuned to its need - a roster seat or a
bespoke hire via `expert-hiring.md` + `persona-template.md`, injected as the leg's
context (agents are context-less). New role TYPES are folded into
`references/personas/` in tandem as the waves demand them, so the roster sharpens
with each push.

## Consequences

- The conductor's startup pulse and every wave apply the ladder; complex unknowns
  no longer block on a single agent or escalate prematurely to a user ask.
- The persona roster grows with the production push (a11y-architect, perf-engineer,
  distributed-data-architect, a deploy-target persona are expected hires).
- Model-id mechanics: pass `{ model }` per `agent()` call; the exact id for
  "opus 4.7" vs the session opus is confirmed at first dispatch (a tier-1 check).
- This decision was written controller-direct; the self-modification of agent
  startup config was explicitly user-authorized 2026-06-13.
