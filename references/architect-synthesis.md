# Solutions architect synthesis

Above the swarms sits one synthesizing role. It does not react finding by finding.
It ingests everything in one pass and produces one coherent build and one ordered
disposition of findings, so nothing is dropped between swarms. Staffed by the tech
lead and codebase architect and the sprint architect and planner personas
(references/personas/tech-lead-architect.md, references/personas/sprint-architect.md).

## What it ingests (one pass, all durable artifacts on disk)

```yaml
findings:    the red findings, the blue findings, the trust-and-safety findings,
             and the code-review findings
records:     the fix log (docs/fixes), the insight log (docs/insights), and the
             decision log (docs/decisions)
attribution: the attribution record (who and what the work is built on)
views:       the MemPalace prose view and the Graphify structural view
```

Inputs are durable artifacts on disk, so the architect's view is reconstructable
and the cold-context verifier can pick up from the same artifacts. The architect
reads; it does not invent findings of its own.

## The disposition table (the load-bearing output)

Every finding from every swarm appears in one table, with its disposition,
traceable to its source. No finding is silently dropped; no finding is
cherry-picked out.

```yaml
# one row per finding
columns: [id, swarm, file:line, severity, the finding, disposition, the signal that
          backs the disposition, traceable_source]
dispositions: [fix-now, fix-as-blue-task, hand-to-engineering, escalate-to-human,
               accept-with-reason, bypass (counts against the circuit breaker)]
rule: severity = base times blast radius; rows sorted by that product; surfaced one
      at a time via AskUserQuestion with a liability line; a finding that has not
      cleared an independent second signal is a claim, not a row.
```

## The hardening pattern (the five parts, tuned to the architect)

```yaml
named_failure_mode:  dropping a swarm's findings; cherry-picking the convenient ones
evidence_it_hands_over: the disposition table - every finding from every swarm with
                     its disposition, each traceable to its source
coverage_manifest:   which swarms reported, how many findings each produced, and the
                     count dispositioned vs bypassed
fire_drill:          a planted critical finding must appear in the disposition, never
                     silently dropped; a miss halts the run
closeout_gate:       no build closes with an un-dispositioned finding; the bypass
                     circuit breaker applies (halts when most of four-plus findings
                     are bypassed)
```

## Governance the architect enforces (design spec section 8)

```yaml
two_signals:      a candidate that has not cleared a second independent signal is a
                  claim, not a finding, and does not enter disposition
root_cause:       HIGH and CRITICAL findings require root-cause analysis, not a
                  symptom-only fix, confirmed by an independent signal
bypass_double_gate: skipping verification on a high-severity finding needs a second
                  confirmation naming the harm and the exposure, recorded as a bypass
circuit_breaker:  more than half of four-or-more findings bypassed halts the run and
                  asks the user whether the bypasses are legitimate, the checks are
                  mis-calibrated, or the discipline is slipping
out_of_scope:     a finding that exceeds self-assessment (a real cryptographic or
                  formal privacy review) is escalated, not faked
```

## The output is itself reviewable

The architect commits to a plan, and that plan is gated before BUILD continues
(SYNTHESIZE feeds the plan gate). The architect never commits a plan past its own
gate; the user approves or edits it. The disposition table is a durable artifact
the cold verifier can re-derive from.

## What blocks closeout

```yaml
undispositioned:   any finding from any swarm with no row in the disposition table
dropped_finding:   a finding present in a swarm report but absent from the disposition
breaker_tripped:   the bypass circuit breaker fired and was not resolved with the user
ungated_plan:      a plan that continued to BUILD without passing its gate
```

## Installed-skill loadout

```yaml
from_installed: [architect, code-architect, planning-and-task-breakdown, multi-plan
                 (planning only, never touches code), documentation-and-adrs,
                 graphify, mempalace, what-if-oracle, consciousness-council]
```

## Where this is grounded

The synthesizing role is design spec section 7; the disposition table, the
hardening pattern, and the fire drill are section 17; the decision-tree governance
is section 8. The personas that staff it are built from
references/persona-template.md (section 19).
