# Build pipeline (spec-driven mode)

The staged line from a work item to a committed change. Each arrow is a gate where
a human can approve, edit, or stop. Only CLOSE commits; everything before it lives
in the working tree, so the rollback for a bad run is the pre-run git state, stated
before CLOSE runs. SKILL.md routes here when the person asks for work to be built,
changed, or fixed.

```
  work item
    ->  SPECIFY   (reuse Stage 1 recon + Setup Interview Mode)   ->  the spec
        [gate 1: approve the spec before any tokens burn]
    ->  PLAN      (components, order, risk tier, cost ceiling)   ->  the plan
        [gate 2: approve the plan on standard or larger work]
    ->  BUILD     (engineering swarm builds against the spec, one task at a time, test first)
    ->  REVIEW    (by tier: security red/blue, trust-and-safety, code-review)  ->  findings
    ->  SYNTHESIZE (solutions architect: one ordered disposition of every finding)
    ->  VERIFY    (cold-context: rubric + independent second signal) ->  PASS | red
        red and under three tries  ->  FIX (bounded); 3rd red  ->  re-plan, do not re-fix
        [gate 3: visual or runtime check; the user is the final eyes]
    ->  SHIP      (ship-and-upload: deploy-readiness interview, then deploy)   # when the change deploys
    ->  CLOSE     (commit of record + decision-log entry + memory sync)
```

## The load-bearing rules

```yaml
# why: these four are the spine; everything else is detail layered on them
cold_context:        VERIFY is spawned with only the diff, the spec, and the rubric.
                     It cannot inherit BUILD's reasoning; it re-derives PASS or red itself.
fix_loop:            bounded at three. A third red means the plan was wrong: re-plan,
                     do not grind fixes. If the re-plan also fails, surface the open
                     findings to the user. Never exhaust the loop and ship.
only_close_commits:  nothing commits before CLOSE. State the pre-run git SHA as the
                     rollback path before CLOSE runs.
human_gates:         gate 1 (approve the spec) and gate 3 (visual/runtime) are required;
                     gate 2 (approve the plan) is required on standard or larger work.
surface_one:         findings are surfaced one at a time via AskUserQuestion, never a
                     typed menu, each with a liability line (who is harmed if wrong).
```

## Tier and cost ceiling (picked at PLAN, shown to the user)

```yaml
# why: scale the pipeline to the change so the cure does not become its own drift
trivial:    one file, no new surface              ->  BUILD, code-review tidy, VERIFY;
                                                       no security, trust-and-safety, or architect
standard:   a feature or surface change           ->  add security, trust-and-safety, and
                                                       code-review swarms at small fan-out, plus the architect
high_risk:  auth / payments / PII / public surface ->  full fan-out, full antibehavior pass,
                                                       escalate to independent review where the trust tree says so
# SHIP is a stage (see the pipeline diagram and step 9), not a risk tier: it runs whenever the change deploys
ceiling:    each tier states a max subagent count and token budget at PLAN.
            on approach, pause and ask: raise the ceiling or narrow scope. never spend without limit.
# conductor-standard.md sections 1 and 4 tighten two lines above: file count is not a risk
# measurement, so "one file" never licenses skipping the swarm on auth, PII, public-surface or hook
# work; and the ceiling is a coverage floor, so fan-out is sized to coverage and the default on
# approach is to raise the ceiling, with narrowing a user-approved correctness trade-off.
```

## Governance (referenced, not restated here)

```yaml
# why: each rule lives in one file; this table says where, so the pipeline never restates it
decision_tree:   docs/spec/2026-06-08-eidolon-swarm-retrofit-design.md section 8 - severity =
                 base x blast radius; two signals or it is not a finding; HIGH/CRITICAL need
                 root cause; bypass double-gated; a circuit breaker halts a run when most of
                 four-plus findings are bypassed.
uncertainty:     the same spec, section 9 - subagents return literal evidence (file excerpt,
                 tool output, URL + response), never "I checked"; the orchestrator inspects
                 that evidence itself and names the second signal; hedged language is refused.
security_swarm:  references/security-swarm.md - red/blue methodology, the coverage manifest,
                 the seeded-defect fire drill, the five anti-handwave gates.
explain_mode:    references/explain-mode.md - plain-language teaching, comprehension checks,
                 the favorite-teacher disposition; available at every stage on request.
personas:        references/persona-template.md - the ten-part construction template, the
                 two anti-behavior layers, the anti-synthetic rail, the Reasoning rail and the
                 Brief contract. references/personas/*.md are the built personas.
primary_persona: references/persona-template.md (section "The primary persona") - Stage 2.5: the
                 user's own house agent, interviewed into existence from recon + five ratified
                 questions, assembled against the template, linted by the same rail (a FAIL
                 re-prompts, never seats), and seated at Stage 10 (.claude/active-persona.json)
                 so the conduct guard enforces from message 1.
engineering_swarm: references/review-swarms.md - builds against the spec, TDD per task,
                 with the seeded-failing-test fire drill and the no-stub closeout gate.
conduct_guard:   hooks/persona-conduct-guard.mjs - checks a seated persona against its own
                 declared anti-behaviors (.claude/active-persona.json) and enforces the rail at
                 the seat boundary (teeth but no anchor does not get to act); halts and names the line.
trust_safety_swarm: references/review-swarms.md - harm, abuse, privacy/PII, a11y, fairness
                 (GDPR, CCPA, WCAG 2.2); the seeded-PII fire drill and the coverage manifest.
code_review_swarm: references/review-swarms.md - behavior-preserving only; a behavior change
                 is a finding for engineering; the suite-guards-behavior fire drill.
architect_synthesis: references/architect-synthesis.md - ingests every swarm's findings plus the
                 three logs in one pass; the disposition table; no finding silently dropped.
ship_upload_swarm: references/review-swarms.md - the deploy-readiness interview (reuses
                 Interview Mode) and the SHIP stage; the seeded missing-env-var / staged-secret
                 fire drill; no deploy on a red gate; the user is the final eyes.
expert_hiring:   references/find-skills-reach.md (section "Hiring an expert persona") - when recon
                 finds a need the base roster does not cover, generate a grounded expert against
                 the template, gated at PLAN; the anti-synthetic rail (scripts/persona-lint.mjs)
                 rejects an ungrounded hire.
find_skills:     references/find-skills-reach.md - pull an installable skill for a named
                 capability gap; consent before install, verify before trust. The three-
                 actor split is structural: skill-scout (references/agents/skill-scout.md)
                 discovers read-only and returns evidence; the controller holds the
                 AskUserQuestion gate and the install (a subagent cannot pause the human).
skill_authoring: references/skill-authoring.md - Eidolon authors a skill for ITSELF from a
                 recurring PROVEN gap (the skill analog of expert-hiring): build against the
                 construction template, lint with scripts/skill-lint.mjs (the rail: no trigger,
                 no eval, no skill), independent test-gate the evals, human consent + install,
                 then govern the library. Distilled-from-success only; one-shot speculation is
                 worse than nothing.
antibehavior_catalog: references/antibehavior-catalog.md - the unified deduplicated drift
                 catalog; each row names its owning stage and enforcing hook.
hook_suite:      hooks/README.md - the wiring, the evaluators in order with their verdict tiers,
                 the write lanes, the subagent hooks, and the known gaps.
cross_session:   references/cross-session.md - the higher isolation tier: a separate session
                 verifies from a self-contained packet (scripts/verify-packet.mjs), graduated
                 per run on high-risk work.
conductor_standard: references/conductor-standard.md - conductor lanes, swarm-first dispatch law,
                 the swarm preflight (.claude/waves/), personas-every-dispatch, the model cascade,
                 supervise-by-state, done-is-the-outcome, the spec foundry, edge-only gates;
                 closes with the anti-patterns index mapping every clause it replaces.
heartbeat_loops: references/loop-suite.md (2026-06-12 section) - the standing self-rearming
                 heartbeat at the lease-window cadence: state pulse, zombie reap with
                 state-injected respawns, one swarm-conducting wave per firing, parks only at
                 human gates; 25-minute default leases; a stale queue is a defect to re-seed.
```

## What you must do in build mode

1. Confirm the mode out loud and state the pre-run git SHA as the rollback path.
2. SPECIFY: reuse recon (Stage 1) and Setup Interview Mode; write the six core
   areas and `.claude/session.yaml`. Stop at gate 1 for approval.
3. PLAN: name the tier and the cost ceiling; split into dependency-ordered tasks,
   each with an acceptance check and a verify step. If recon found a need the base
   roster does not cover, hire an expert here (generate it against the template,
   gated at this checkpoint; the anti-synthetic rail rejects an ungrounded hire).
   Stop at gate 2 on standard or larger work.
4. BUILD: dispatch the engineering swarm and seat its persona (write the persona's
   anchors and anti-behaviors to `.claude/active-persona.json`; the conduct guard enforces
   the anti-behaviors and refuses to act for a seat that names no anchor: no anchor, no seat).
   One task at a time, test first (the test red before the change, green after),
   against the spec. No scope drift; new ideas go to the work queue, never the live diff.
   Every write-capable brief carries a line that starts "Done-check:" (exact spelling) and a
   fresh wave plan exists in `.claude/waves/` before the first dispatch; the dispatch gate
   asks otherwise (hooks/guard-dispatch.mjs).
5. REVIEW: by tier, run the security swarm (red finds, blue hardens), the
   trust-and-safety swarm, and the code-review swarm, in parallel
   (references/review-swarms.md; the security method is in references/security-swarm.md).
   Each red finding becomes a blue hardening task, closed only when its post-fix verify
   passes; a code-review behavior change is a finding for engineering, not a silent edit.
   Dispatching these sensitive swarms (and any destructive or deploy work) asks the human
   (the consent tier, hooks/guard-dispatch.mjs; references/security-policy.md).
6. SYNTHESIZE: the solutions architect ingests every swarm's findings plus the three
   logs in one pass and produces one ordered disposition table; no finding is
   dropped. The plan it commits to is gated before continuing.
7. VERIFY: spawn the cold-context verifier with only the diff, spec, and rubric.
   On a high-risk graduated run, assemble a verify packet (scripts/verify-packet.mjs)
   and verify in a separate session (references/cross-session.md). Red under three
   tries enters the bounded fix loop; a third red re-plans.
8. Gate 3: hand the visual or runtime result to the user as the final eyes. A
   screenshot proves the render happened, not that it is right.
9. SHIP (when the change deploys): the ship-and-upload swarm (references/review-swarms.md)
   runs a deploy-readiness interview, then deploys only when every checklist item is green
   with its signal and every upstream manifest is clean. The user approves the deploy as
   the final eyes.
10. CLOSE: only now commit. Write the decision-log entry and run the memory sync.
    Do not declare done while any finding is unverified or any AMBIGUOUS stands.
