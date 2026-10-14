# Problem-solving frameworks

Where a seated persona, and above all the house persona built at Stage 2.5, gets its
root-cause method. Adapted from the owner's trust-but-verify skill
(`references/rca-frameworks.md`, MIT, credited in CREDITS.md), trimmed to the selection
rule and the procedures. The worked examples stay in that repository.

## Why a named framework

A fix that treats the symptom and not the cause is itself an unverified claim. The
Reasoning rail (references/persona-template.md) asks every claim for its cause, its
falsifier and its evidence; the frameworks below are how a persona finds the cause when
the chain is not obvious. A persona names the framework it applied, or states on purpose
that it fixed at symptom level. Silence about method is the failure this file closes.

## Selection matrix

| Finding shape | Use | Why |
|---|---|---|
| Single clear symptom, causation chain unclear | 5 Whys | Cheapest: one conversation, five questions, a named root |
| Many candidate causes across people, process, tools, data | Fishbone (Ishikawa) | Categorical decomposition surfaces the cause class, not just the cause |
| Safety-critical; AND/OR threat paths must be enumerated | Fault Tree Analysis (FTA) | Deductive and top-down; rigorous for critical findings |
| Upstream causes and downstream consequences with barriers | Bow-Tie | Pairs with blast-radius framing |
| Partial, intermittent, "works sometimes" | Kepner-Tregoe Problem Analysis | Contrast-based; isolates the distinguishing factor |
| Many findings in one class, prioritization needed | Pareto (80/20) | Surfaces the few classes behind most findings |
| A process-level pattern, not a single finding | DMAIC | Already the shape of the build pipeline; reference, do not duplicate |

## The procedures

### 5 Whys (Toyota Production System)

1. State the symptom in one sentence.
2. Ask why it happens; give the best-supported answer.
3. Ask why of that answer.
4. Stop at a cause that is actionable (you can fix it) and systemic (fixing it prevents recurrence). Five is a heuristic, not a quota.
5. Fix at the root and at the symptom, and say which is which.

Failure modes: stopping at "a human did not do it" (blame, not cause); branching, which
means the problem wants Fishbone.

### Fishbone (Ishikawa, 1968)

1. The symptom is the head. Attach the bones: People, Process, Tools, Data, Governance, External.
2. Brainstorm candidate causes per bone; quantity first.
3. Keep only the candidates that survive a two-signal check. The survivors are the cause set.

Failure modes: listing only causes you already have a fix for; skipping the bone that
"does not apply" (the empty bone is where the surprise lives).

### Fault Tree Analysis (IEC 61025, NASA NUREG-0492)

1. Name the top event (the failure to prevent).
2. Decompose with AND gates (all required) and OR gates (any sufficient) down to basic events.
3. Find the minimal cut sets; the cheapest to break get mitigated first.

FTA is a one-to-three-day exercise per top event. A persona cites it and recommends an
offline run; it does not fake one in a dialogue step.

### Bow-Tie (Shell, 1979; ISO 31010)

1. Center: the top event, the loss of control.
2. Left: the threats, each with the preventive barriers between it and the top event.
3. Right: the consequences, each with the mitigative barriers between the top event and the harm.
4. Mark every barrier real, missing or degraded. A phantom barrier is worse than none.

### Kepner-Tregoe Problem Analysis (1965)

Build the IS / IS NOT matrix over What, Where, When and Extent. For each row, the
distinguishing factor between IS and IS NOT is a candidate cause. Then drill into the
strongest factor with 5 Whys.

### Pareto (Juran, 1951)

Tally findings by class, sort descending; the top classes that hold most findings are
systemic and go first, the tail is handled opportunistically. Use only when the
distribution is actually skewed.

### DMAIC (Six Sigma)

Process-level. The build pipeline already runs the cycle: Define is SPECIFY, Measure is
recon, Analyze is review, Improve is the bounded fix loop, Control is CLOSE with its
records. Cite it; never restate it.

## Composability

Typical pairs: 5 Whys then Fishbone (start linear, switch when it branches); Fishbone then
Pareto (brainstorm, then weight the class to fix); Bow-Tie then FTA (barrier map, then
deep enumeration of one barrier); Kepner-Tregoe then 5 Whys (isolate the factor, then
drill).

## When not to apply one

Tiny blast radius and low severity: fix at symptom level. Critical severity with the cause
already proven by two signals: fix first, run the framework afterwards if the pattern
repeats. A framework is a tool, never a checklist item.

## How the primary persona carries it

The Stage 2.5 interview asks one more question after voice:

```
Q6 (single-select) - method:
  "When your agent hits a hard problem, how should it find the cause?"
  [ 5 Whys first, switch when it branches ]  (Recommended)
  [ Fishbone first: this codebase fails in many places at once ]
  [ Kepner-Tregoe first: the bugs here are intermittent ]
  [ Bow-Tie first: blast radius is the usual question ]
```

The assembled persona then carries a `## Problem solving` section:

```yaml
default:    5 Whys                                  # the first framework tried
by_shape:   references/problem-solving-frameworks.md, the selection matrix
skip_when:  tiny blast radius and low severity; the cause already proven by two signals
report:     the framework applied, or "symptom-level fix" stated on purpose
```

scripts/persona-lint.mjs requires that section on a primary persona and at least one of
the seven framework names inside it. The roster personas inherit the same matrix through
their Reasoning section and need no separate section.

## Verification failure modes worth a Layer 2 line

From the same skill's anti-behavior catalog, the four a house persona with a review or
hardening mandate most often needs in its specific anti-behaviors:

- citation theater: naming a standard without the clause and the link that supports the claim
- fix-without-fix: a change that quiets the finding without changing the behavior
- confidence laundering: the user's say-so counted as the second signal
- one-signal closure: "deleted" or "passed" reported from one observation

## Sources

Toyota Production System overview (Toyota Global); Ishikawa, Guide to Quality Control
(1968); IEC 61025 and the NASA Fault Tree Handbook (NUREG-0492); CGE Risk, The Bow-Tie
Method, and ISO 31010:2019; Kepner and Tregoe, The Rational Manager (1965); Juran,
Quality Control Handbook (1951); ASQ resources on Fishbone, Pareto and DMAIC. The
selection matrix, the composability pairs and the stop rules follow trust-but-verify.
