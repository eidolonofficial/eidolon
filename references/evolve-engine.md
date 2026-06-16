# The evolve engine (vendored ASI-Evolve, agent-driven)

Eidolon's `evolve` mode runs a measurable, evaluator-driven search - for code, an algorithm, a
prompt, or a pipeline - using the **agent-driven** ASI-Evolve toolbelt vendored under
`engine/asi-evolve/` (Apache-2.0, GAIR-NLP, arXiv 2603.29640; provenance in
`engine/asi-evolve/PROVENANCE.md`, attribution in `CREDITS.md`). Claude is the engineer; the
toolbelt is deterministic bookkeeping. This is the sanctioned home for the population-search /
numeric-fitness machinery that `references/loop-suite.md`'s fence holds OUT of the delivery loop
(decision: `docs/decisions/2026-06-16-fold-asi-evolve-evolve-mode.md`).

## When it applies (and when it does not)

```yaml
use_when:    a MEASURABLE evaluator exists (a scorer that ranks candidate A above B), code/prompt
             changes are allowed in a bounded scope, and domain knowledge can improve the search
not_when:    one-off bug fixes, purely qualitative work, or anything with no scorer to distinguish
             better from worse -> that is the BUILD pipeline, not evolve
the_test:    no scorer, no evolve. If you cannot name the number that goes up, run build.
```

## The engine contract

```yaml
# why: a vendored runtime is trustworthy only with a stated interface; this is it
inputs:        a run spec (objective, core score, secondary metrics, evaluator command + MANDATORY
               timeout, success criteria, round budget, writable mutation scope, sampling algorithm,
               cognition source) + a baseline program + (optional) seed cognition
command_path:  engine/.venv/bin/python engine/asi-evolve/scripts/evolve-<brief|cognition|db|eval|files|summary> ...
run_dir:       .evolve_runs/<run-name>/   (the source of truth: run_spec.yaml, round_log.jsonl,
               cognition_data/, database_data/, steps/, best/)   # gitignored; never committed
outputs:       a best candidate (engine/.venv ... evolve-db best), its score, per-round analyses,
               and the experiment database (every branch, score, lineage, lesson)
isolation:     deps in the on-demand venv engine/.venv (numpy + pyyaml; faiss/sentence-transformers
               optional, graceful fallback); NO LLM-API key; Eidolon never edits engine/asi-evolve/
               during a run -- the run lives entirely under .evolve_runs/
```

## ASI-Evolve -> Eidolon mapping

```yaml
# the three upstream roles collapse into one Claude loop without changing the logic
researcher:  -> the FRAME/learn step: understand the problem, query cognition + the experiment DB
                for priors. Driven by Eidolon recon + Interview Mode, not an external LLM agent.
engineer:    -> the engine's OWN candidate search: Claude writes the next program into the approved
                mutation scope and runs the evaluator. NOT Eidolon's engineering swarm -- the swarm
                builds ordered DELIVERY tasks; here Claude searches interchangeable candidate variants.
analyzer:    -> the ROUTE step: each round's lesson (what helped/hurt, which parent informed it) is
                recorded in the DB and the durable lessons are written to docs/notes/ + mempalace.
cognition:   -> the cognition store (evolve-cognition): reusable external insight only (paper notes,
                heuristics, approved research). The analogue of loop-suite upgrade 1's prior_context,
                but it lives INSIDE the engine, retrieved per round by the agent.
experiment_db: -> the experiment database (evolve-db) with run-level sampling: ucb1 (default),
                island (diversity / MAP-Elites-style), greedy (exploit), random (explore). This runs
                in FULL here -- the parent-selection over a candidate population that loop-suite
                upgrade 3 deliberately ported only the narrowest slice of into the delivery loop.
```

## The toolbelt (read engine/asi-evolve/SKILL.md + references/ for the full policy)

```
evolve-brief    normalize the run spec; the --confirmed true flip is the consent gate (below)
evolve-cognition init | add | search    the cognition store (reusable insight only)
evolve-db       sample | record | best | stats    the experiment DB; SERIALIZE per run (one at a time)
evolve-eval     inspect | run    the evaluator, with a MANDATORY timeout
evolve-files    read | write | diff    candidate edits inside the mutation scope
evolve-summary  final    the closing report
```

## The consent gate (one ask per run)

```yaml
# why: an evolve run mutates files and burns real compute; the human authorizes it once
gate:        hooks/evolve-engine-guard.mjs (PreToolUse Bash, rides the guard-bash dispatcher)
moment:      the preflight confirmation flip -- evolve-brief normalize ... --confirmed true -- which
             unlocks the mutate/evaluate round loop. Upstream's toolbelt refuses to mutate or
             evaluate while approval.confirmed=false, so this flip IS the authorization act.
posture:     it ASKS, never blocks (like the security gate; the operator legitimately wants the run)
once:        one ask per run; the run spec's round budget bounds everything after. Drafting commands
             (normalize without the flip, evolve-eval inspect, cognition seeding) are not gated.
never_self_confirm: a detailed task request is NOT confirmation; never flip --confirmed true on the
             user's behalf without an explicit yes (upstream preflight rule + Eidolon consent law)
```

## The numeric evaluator is the second signal

```yaml
# why: the engine reporting a best score is a CLAIM; Eidolon's verify funnel applies to a number
verify:      before a result is trusted or routed, re-run the evaluator COLD on the best candidate
             (evolve-eval run, or the evaluator directly) and confirm the engine's reported score
             reproduces. A score the engine claims but a cold re-run does not reproduce is a RED.
state_not_report: the score is verified by EXECUTING the evaluator and reading the number, never by
             trusting the round_log -- the trust-but-verify discipline (SKILL.md verification) on a
             scalar instead of a diff.
```

## Where the run routes back

```yaml
analysis:    durable lessons -> docs/notes/EVOLVE-<slug>-<date>.md (a machine-written postmortem,
             mined to mempalace by the existing Stop/post-commit hook; same sink as loop-suite up. 2)
candidate:   the verified best program -> the working tree as a candidate change (then it enters the
             ordinary build/verify/CLOSE path if it is to ship)
record:      the run is registered in .claude/eidolon-manifest.yaml with last_verified
runs_stay:   .evolve_runs/, engine/.venv/, and the model cache are gitignored -- only the distilled
             result and the chosen candidate enter the tree
```

## Relationship to the loop-suite cognition-loop and its fence

`references/loop-suite.md` (2026-06-13, commit 8caa736) ported the ASI-Evolve **cognition-base +
analyzer + closed-loop SHAPE** into Eidolon's bounded delivery wave, and fenced OUT the
population-search / numeric-fitness / island-sampling machinery: *the delivery loop runs ordered
steps against a binary gate, not interchangeable variants scored by a number*. That fence is
correct **for the delivery loop**, and it still stands. The `evolve` mode is the deliberate
carve-out where the other condition is true - a real scorer over a candidate population - so the
fenced machinery runs here, for real, on measurable AI-R&D problems, consent-gated and bounded.
The fence now cross-references this mode rather than contradicting it.
