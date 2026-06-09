# Scaling

The pipeline is tiered to the change so the cure does not become its own drift. The
orchestrator picks the tier at PLAN and states it; a tier is a checkpoint decision
the user can override.

## The three tiers

```yaml
trivial:    one file, no new surface
            -> engineering builds, code-review tidies, VERIFY runs
            -> no security swarm, no trust-and-safety, no architect synthesis
standard:   a feature or a surface change
            -> add the security (red and blue) and trust-and-safety swarms at small
               fan-out, plus the architect synthesis
            -> code-review runs here too
high_risk:  auth / payments / PII / public surface
            -> full fan-out, larger swarms, the full antibehavior pass
            -> escalate to independent review where the trust tree says so
            -> hire an expert (references/expert-hiring.md) for an uncovered domain
```

## The cost ceiling (set at PLAN, shown to the user)

Each tier carries a stated cost ceiling, so the swarm does not become its own
runaway cost.

```yaml
ceiling:    an upper bound on the subagent count and the token budget for the run,
            set at PLAN and shown to the user before any tokens burn
on_approach: when a run nears its ceiling, Eidolon pauses and asks: raise the ceiling,
            or narrow the scope. It never spends past the bound without asking.
no_silent_cap: if a run bounds coverage (top-N, no-retry, sampling), it says what was
            dropped; a silent truncation reads as "covered everything" when it did not
```

## Cross-session: in-session now, separate sessions later

The swarms multiply subagents, and the load-bearing question is whether they run
in one session or graduate to separate sessions for true cold context.

```yaml
v1_and_v2:  the swarms run as in-session subagents. The cold-context VERIFY is spawned
            with only the diff, the spec, and the rubric, so it cannot inherit the
            build's reasoning: the two-signal rule turned into architecture, within
            one session.
deferred:   cross-session swarms (each swarm in its own session for genuinely
            independent context) are the higher tier, the later graduation. v1 and v2
            run in-session; the in-session cold-context verifier is the approximation,
            and cross-session is the stronger form when the change and the budget justify it.
decision:   resolved for now as in-session with a cold-context verifier; the
            cross-session graduation is confirmed per run when the risk tier and the
            cost ceiling justify the extra isolation.
```

## How scaling composes with the rest

```yaml
tier_picks_swarms: the tier decides which REVIEW swarms convene (the tier block in
                   SKILL.md); SHIP runs whenever the change deploys, at any tier
ceiling_bounds_cost: the cost ceiling bounds the fan-out the tier allows, so a
                   high-risk full fan-out still has a stated upper bound
hiring_on_demand:  high-risk work hires an expert for an uncovered domain, within the
                   same cost ceiling
```

## Where this is grounded

The three tiers and the cost ceiling are design spec section 12; the cross-session
question is section 15 (open question 1), resolved here as in-session with a
cold-context verifier for v1 and v2. The tier block in SKILL.md is the operative
copy; this reference is the fuller statement.
