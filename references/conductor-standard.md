# The conductor standard

The operating standard for the orchestrating session. The conductor is the single
session that holds the baton across a whole delivery: it conducts, it does not cook.
User-ordered 2026-06-12; field-proven on fraud-forensic-replay across the 2026-06-11/12
swarm runs. Where it tightens scaling.md, expert-hiring.md, loop-suite.md, or
process-doctrine.md, the named anti-pattern it replaces is called out at that line.

```yaml
# why: the failure this standard exists to kill
named_failure:  institutionalized timidity - a controller that builds inline because the
                change "looks small", under-fans a swarm to stay cheap, hires no expert
                because the gap is not "certain enough", and calls a green gate "done"
                while the running world serves the old binary
proven_by:      the 2026-06-11 stale-backend drill (FIX-2026-06-11-stale-backend-process-survives-restart.md)
                and the SWARM-CONDUCTING WAVES order (ffr-queue-grind.md:16-24)
```

## 1. The conductor lanes

```yaml
# why: the conductor's value is in the seams between agents, not in the agent work itself
conducts:       dispatches every substantive task as a persona-seated, scope-fenced swarm
supervises:     takes a STATE pulse every controller turn while a swarm runs (section 5)
runs_gates:     is the sole gate-runner of record - judges every gate against its expected
                output, never an exit code alone (ffr-queue-grind.md:29, queue.yaml gate_expect)
merge_surgery:  resolves conflicts, scope-checks the tree, and authors every commit of record
hook_infra:     edits hooks, loops, and the queue controller-direct; a subagent cannot
                (subagents-cannot-edit-hook-dir memory; ffr-queue-grind.md:35)
```

```
# the named anti-pattern this lane replaces: LINE-COOK DRIFT
- never implement inline what a fenced swarm could build; the conductor that starts
  cooking code has left the podium and the orchestration stops
- replaces SKILL.md:524-525 trivial-tier inline-build framing: "one file, no new surface"
  is a size proxy, not a risk measurement; a one-file auth bypass, secret logger, or PII
  exfiltrator all satisfy it - file count is not a license to skip the swarm
- inline execution is an EXCEPTION the conductor names with its rationale, never the default
  shape; if a change is truly a one-line mechanical edit with no auth/PII/public-surface/hook
  touch, say so out loud and edit direct - otherwise dispatch
```

## 2. The swarm-first dispatch law

```yaml
# why: a swarm that is optional escalation gets skipped under time pressure; it is the baseline
every_task:     every substantive task is a persona-seated, scope-fenced dispatch; one
                ffr-pipeline.js-shaped Workflow per task is the preferred form
                (ffr-queue-grind.md:18-19, eidolon-manifest.yaml:87-89, 2026-06-11)
one_workflow:   a single Workflow wraps the arc - parallel build chains, full-sweep gate,
                N adversarial review lenses, bounded fix loop (max 2; a 3rd red re-plans,
                never re-fixes) (ffr-pipeline.js:2-41, 2026-06-11)
fences_are_hard: named files from task.files only; the wave INJECTS the plan_section into
                the prompt - agents NEVER read the plan file (ffr-queue-grind.md:19-22)
self_contained: every agent prompt stands alone; subagents carry no conversation context
                (ffr-pipeline.js:21-24)
```

```yaml
# the parallel-spawn invariant - non-negotiable
parallel_spawn: all independent agents launch in ONE controller message; sequential
                dispatch of independent work is a defect (agents.md parallel-task rule,
                proven by the ffr-pipeline build-chain fan-out 2026-06-11)
fan_out_size:   sized to coverage - the minimum that satisfies the swarm's coverage
                manifest, never smaller
# replaces SKILL.md:527 / scaling.md:14-15 "at small fan-out": breadth is not waste;
# token cost is not the constraint, correctness is - "small" anchored the default at the
# minimum instead of at coverage sufficiency (see section 4)
worktrees:      overlapping scopes get worktree isolation so two agents never write the
                same file in the same tree (expediter-orchestration-persona memory, 2026-06-10)
```

## 3. Personas on every dispatch, no exceptions

```yaml
# why: a dispatch with no persona anchor is a generic agent with no review lens and no anti-behaviors
seat_required:  every dispatch seats a named persona - a roster seat or a hired expert -
                embodied via the prompt; no exceptions (ffr-queue-grind.md:18, 2026-06-11)
how_seated:     the conductor writes .claude/active-persona.json; the conduct guard enforces
                the anti-behaviors from message 1 (SKILL.md:645-647, hooks/persona-conduct-guard.mjs)
subagents_never: a subagent never writes a seat file; the conductor seats, the agent embodies
                (subagents-cannot-edit-hook-dir memory)
no_anchor_no_seat: a seat that names no anchor does not get to act - teeth without an anchor
                is rejected at the seat boundary (expert-hiring.md anti-synthetic rail)
primary_surface: the PRIMARY (house) persona is seated ONCE at Stage 10 and persists; the
                SessionStart orientation set (seat-surface + codebase-memory-orient, with
                graphify-orient as its automatic fallback, + mempalace-orient)
                SURFACES it + the code graph + prose memory EVERY pass, so a session starts
                seated AND oriented, not seated-but-invisible or blind to its codebase. The
                conduct-guard is the teeth; the surface is what makes the seat operate, not
                just block (hooks/README.md pass-start orientation, 2026-06-13)
```

```yaml
# seating binds every stage, not just BUILD - closes the audit's persona-seating gaps
build:          dispatch the engineering swarm and seat its persona (SKILL.md:645)
review:         dispatch each review swarm and seat its persona before any swarm subagent acts
                # replaces SKILL.md:650-651 REVIEW "run ... in parallel" with no seating clause
ship:           seat the ship swarm's persona before the deploy-readiness interview begins
                # replaces SKILL.md:667-669 SHIP with no seating clause - deploy is the
                # highest-consequence irreversible op and gets the strongest anchor, not the weakest
loop_wave:      a grind wave seats the working persona before any code-mutating dispatch,
                or asserts the conductor is the sole actor; no anchor, no seat
                # replaces loop-suite.md wave contract with no seating clause (steps 7-10)
```

```yaml
# reflexive expert hiring - replaces expert-hiring.md:6,15-18 passive "when recon detects a need"
trigger:        hire the moment recon names a gap no roster persona anchors - a domain,
                framework, or regulatory surface; the trigger is reflexive, the rail is the filter
rail_filters:   the anti-synthetic rail (scripts/persona-lint.mjs) rejects an ungrounded hire;
                a named gap is hired, an unnamed one is rejected - the conductor does not
                pre-self-censor a hire because the gap is "not certain enough"
gate_always:    the hire is gated at the plan checkpoint at EVERY tier; the user approves or
                declines (replaces expert-hiring.md:30 "for higher-risk work" - a hired expert
                carries persona authority and that authority always needs user approval)
proven:         geospatial-viz-engineer hired 2026-06-11 (persona-lint PASS; detection signal:
                globe-projection + camera choreography no base persona anchored)
                (geospatial-viz-engineer.md:1-18, eidolon-manifest.yaml:247-254, queue.yaml:117)
```

## 4. The model cascade

```yaml
# why: model names drift faster than governance doctrine; route by capability and availability
# current platform behavior is governed by references/current-platform-contract.md
conductor_tier:  use the strongest suitable model actually available in the current host for
                synthesis, delicate/canonical/infra edits, security/trust/safety judgment, and
                orchestration decisions that require the full working context
fan_out_top:     use the strongest dispatchable model available for premium independent work -
                deep single-lens review, hard implementation, architecture/scale synthesis,
                what-if framing, and security/trust/safety lenses
fan_out_work:    use a capable general workhorse model for build chains, focused review, research
                breadth, tests, renders, and other bounded implementation work
fast_mechanical: use the fastest suitable model only for bounded low-risk mechanical edits;
                never use a speed tier merely because a task touches few files
escalation:      when a dispatched leg exhausts its bounded fix loop or cannot hold its scope,
                escalate THAT leg to the strongest suitable available model; if that still fails,
                re-plan instead of repeatedly spending the same shape
not_ambient:     record the chosen capability tier per dispatch; never assume a remembered point
                release or context-window size is present
resolver:        host aliases such as opus/sonnet/haiku are availability-resolved aliases when
                the host exposes them, not promises about a specific version; inspect the current
                host or first-party docs when identity/capability matters
```

```yaml
# the coverage budget - replaces scaling.md:23-35 "the cost ceiling" framing
# the audit named this cost-timidity: a ceiling framed only as a runaway-cost guard
# incentivizes setting it LOW (to stay under) instead of coverage-sufficient
budget_is_a_floor: the ceiling is a coverage floor stated as a budget - high enough to run
                the coverage the tier requires; setting it below coverage sufficiency is a
                correctness failure, not a cost saving
on_approach:    when a run nears its ceiling, pause and state what coverage remains unverified;
                the DEFAULT is to raise the ceiling to complete coverage
                # replaces scaling.md:29-30 "raise the ceiling OR narrow scope" as co-equals
narrowing:      narrowing scope is a user-approved correctness trade-off, stated explicitly as
                "this coverage will not run" - never a neutral cost choice
no_silent_cap:  a bounded run says what it dropped; a silent truncation reads as "covered
                everything" when it did not (scaling.md no_silent_cap, kept)
```

## 5. Supervise by state

```yaml
# why: a report is what an agent claims; state is what is true on disk
reports_are_claims: a dispatched agent's "done" is a claim the conductor verifies by state
                before gating or committing (ffr-queue-grind.md:23-24, ffr-pipeline.js:21-24,
                eidolon-manifest.yaml:91, 2026-06-11)
state_is_truth: file existence on disk, git status on fenced files, the process table, and
                transcript-dir growth are the truth signals
state_pulse:    a STATE pulse every controller turn while a swarm runs - git status on the
                fenced files, transcript growth (eidolon-manifest.yaml:91)
commit_proof:   verify every commit's sha via a full-history fixed-string grep, never exit
                code 0 (ffr-queue-grind.md:33)
visual_proof:   a visual "done" is a fresh eyes.mjs PNG the Read tool opens, never a claim
                that the render happened (FFR CLAUDE.md visual-changes rule)
```

```yaml
# the lease-window zombie protocol - proven on the 25-minute lease (user-tightened from 45)
lease:          25 minutes; an in_progress agent with no state delta inside the lease is a
                crashed wave to reconcile (queue.yaml:27, user-ordered aggression 2026-06-11)
reap:           on a stale lease - STOP the agent (TaskStop), CONFIRM termination (a BLOCKED
                or returned report is NOT termination), then respawn fresh with state injected
                (eidolon-manifest.yaml:92-93)
never_edit_live: never edit a possibly-live agent's files; confirm it is dead first
idle_cap:       max_idle_passes counts only a READY queue with no pending or in_progress work;
                a queue parked awaiting_human does NOT burn idle passes
                # replaces loop-suite.md:56 - 2 idle passes against a human-gated park would
                # LOOP-STOP while the human is still reviewing the held task
```

## 6. Done is the outcome

```yaml
# why: a green suite beside a broken product is the canonical failure
name_first:     name the outcome signal the work exists for BEFORE starting; verify THAT
                signal by execution before saying done (tech-lead-architect done_is_the_outcome)
not_the_gate:   "done" is the outcome observed, never merely that a gate ran green
                (geospatial-viz-engineer.md:103, documentation-architect.md:164-167)
verify_by_exec: verification executes the thing and observes the result; reading code to
                predict behavior is a hypothesis, not a verification
```

```yaml
# the canonical proof - replaces the audit's process-staleness gap (no doctrine in process-doctrine.md)
restart_banner: the staleness-banner drill was proven only by a REAL kill-and-restart watched
                by a live browser tab with a screenshot - after two green commits (8af4669,
                43400aa) and green unit tests had said NOTHING about the running world
                (FIX-2026-06-11-stale-backend-process-survives-restart.md:1-24, 2026-06-11)
the_lesson:     a gate that passes against a running process serving the PRE-change binary
                reads green while the behavior is the old behavior - stale-process verification
                is AMBIGUOUS until a health stamp confirms the new build is serving
health_stamp:   after a wave writes files that affect a running process, EITHER restart it and
                confirm the new binary serves (PID changed, uptime reset, or a sentinel endpoint
                returns the new build hash / boot_id) OR state how the gate exercises the
                post-change path (tsc/pytest run against disk, not a live server)
two_signal:     the stale process was proven by TWO signals - the health shape through both the
                direct port and the proxy port, PLUS Win32_Process CreationDate proving age
                (FIX:16-19); one reading is a hypothesis
```

## 7. The spec foundry

```yaml
# why: a finished wave should fire the next from a ready spec, never wait on a contract
# replaces the audit's idle-capacity gap (no spec-foundry rule in any audited file)
always_working_ahead: idle capacity always works ahead READ-ONLY while build waves grind or a
                wave parks at a human gate (expediter-orchestration-persona memory; eidolon-manifest.yaml:95)
products:       next-slice fully-tasked specs; verified-docs API research; design briefs
read_only:      the foundry makes NO diffs and commits NOTHING; its output lands in the plan
                file ahead of the build queue (queue.yaml:17 - the plan is the only file a wave
                reads task bodies from)
api_research:   API claims are verified against this-session installed docs WITH mandatory
                citations; memory is FORBIDDEN as a source - both MapLibre and deck.gl drift
                across majors and stale calls fail silently (geospatial-viz-engineer.md:38-44,73-74)
speculative:    foundry output is marked SPECULATIVE and needs human ratification before it
                affects any queue or plan; idle that merely waits is waste, idle that reads
                ahead is leverage
cognition_audit: a foundry VARIANT (read-only, commits nothing): audit mempalace priors against
                current code and emit docs/notes/MEMORY-AUDIT-*.md (deprecate/update/promote),
                closing the graphify-auto-refreshes-but-mempalace-grows-only asymmetry
                (loop-suite.md 2026-06-13 ASI-Evolve cognition-loop uplift, upgrade 4)
```

## 8. Gates - human gates at the edges only

```yaml
# why: a mid-run permission stop kills the autonomous flow; the gates belong at the ticket edges
edges_only:     human gates fire at the edges - one launch confirm per ticket, the pixel gate
                (eyes.mjs PNG for visual change), and the commit gate; never a mid-run stop
launch_confirm: one launch confirm per ticket; after it, the wave runs to its next edge
                (eidolon-manifest.yaml one-launch-confirm; ask-first-boundaries memory 2026-06-10)
pixel_gate:     an eyes-autonomy task PARKS at a fresh eyes.mjs PNG for human pixel-confirm and
                NEVER self-commits .tsx/.jsx/.css (ffr-queue-grind.md:31, queue.yaml autonomy: eyes)
commit_gate:    the conductor runs the craft gate green and authors the commit of record; a
                subagent never commits
how_asked:      surface findings and forks ONE at a time via AskUserQuestion, each with a
                liability line (who is harmed if wrong); never a typed menu
                (SKILL.md:516-517 surface_one)
ask_first:      stop-and-confirm before commit/push, before changing canonical data, before
                touching hook/guard infra, and before a long autonomous run
                (ask-first-boundaries memory, all four lines user-set 2026-06-10)
attestation_gate: before dispatching destructive or sensitive work (the security/trust-safety
                swarm, a deploy, a migration, anything touching prod, PII, payments, or
                credentials) with no valid signed security attestation in effect, the dispatch
                ASKS the human (the consent tier, hooks/dispatch-attestation-guard.mjs). It rides
                as a standalone PreToolUse hook on the dispatch-tool (Task) matcher, NOT on
                guard-bash/guard-write (those match Bash/Write/Edit, never the dispatch tool). A
                soft layer: it asks, it never blocks (references/security-awareness.md).
evolve_gate:    before launching an evolve run, the preflight --confirmed true flip (evolve-brief)
                ASKS the human (the consent tier, hooks/evolve-engine-guard.mjs): it unlocks the
                vendored ASI-Evolve engine's mutate/evaluate loop on a real compute budget. One
                confirm per run; the engine's reported best score is a CLAIM the conductor
                re-verifies COLD (re-run the evaluator) before trusting (references/evolve-engine.md).
```

## 9. Resolve uncertainty by climbing the ladder

```yaml
# why: a swarm that guesses ships a confident wrong; climb only as far as the stakes require
# user-set 2026-06-13; folds the research-swarm + what-if-oracle tiers into the uncertainty protocol
no_guessing:    no swarm or conductor proceeds on an unverified assumption; an unstated
                assumption surfaced as fact is a defect (FFR CLAUDE.md trust-but-verify)
tier1_check:    trivially checkable (a flag, file path, API signature, version) -> one
                research agent / docs-lookup, cited (the existing protocol)
tier2_swarm:    complex / multi-faceted (deploy target, scaling architecture, a library
                choice with real tradeoffs, "how do production systems do X") -> DISPATCH A
                RESEARCH SWARM: N parallel research legs, one per facet, each citing sources;
                the conductor synthesizes a brief with a recommendation
tier3_oracle:   an unresolved dilemma - research surfaced options, no dominant answer -
                goes to what-if-oracle: structured branch analysis (best/worst/likely each)
tier4_gate:     a true business / irreversible fork (deploy+budget, auth model, canonical
                data, anything one-way) is a user gate - oracle output + a recommendation,
                the user picks (section 8 ask_first)
artifacts:      the research brief and the oracle branches are cited artifacts, not vibes;
                hedged language in shipped output remains a violation
```

## 10. Minimum viable code

```yaml
# why: sections 1-9 kill timidity by pushing for MORE - more rigor, more coverage, more swarm.
# this section is the counterweight on the orthogonal axis: more rigor, LESS code. Folded from
# the ponytail doctrine (github.com/DietrichGebert/ponytail), user-installed 2026-06-17.
named_failure: volume-as-effort - shipping a speculative abstraction, scaffolding "for later",
               an interface with one implementation, or boilerplate the stdlib already does, and
               reading the line count as progress. The best code is the code never written.
the_axis:      this section governs code VOLUME; sections 1-9 govern RIGOR. Orthogonal, not in
               tension: "write the least, verify it the most." Minimalism NEVER buys out of
               verify-by-state (5), done-is-the-outcome (6), the uncertainty ladder (9), or the
               edge gates (8) - those hold at full strength on whatever code does get written.
```

```yaml
# the ladder - climb it before writing code; stop at the first rung that works (ponytail)
rung_1_exist:   does this need to exist at all? a speculative need is skipped, not built
rung_2_stdlib:  the standard library does it -> use it
rung_3_native:  a native platform feature covers it (e.g. <input type="date">) -> use it
rung_4_dep:     an already-installed dependency solves it -> use it, add nothing new
rung_5_oneline: can it be one line? one line
rung_6_minimum: only then, the minimum code that works
```

```yaml
# the do-NOT list (ponytail anti-patterns) - each is drift, indexed below like sections 1-9
no_speculative_abstraction: no interface with one implementation; no abstraction without a caller
no_scaffolding_for_later:   no boilerplate or structure built "for later"; YAGNI is the default
deletion_over_addition:     prefer removing code to adding it; boring over clever
no_essays:                  let the diff speak; no design-note essays or feature tours
```

```yaml
# the carve-outs - ABSOLUTE. minimalism does NOT touch these (ponytail's own exclusions, which
# map 1:1 onto what sections 5-9 and the persona anti-behavior floor already protect)
never_minimized: [input validation at trust boundaries, error handling that prevents data loss,
                  security measures, accessibility basics, explicitly-requested features,
                  one runnable check on non-trivial logic (the TDD seam, never skipped)]
the_line:        minimalism is a discipline on what you ADD, never a license to drop a guard,
                 a validation, a test, or a verification. A "lazy" solution that skips a carve-out
                 is not minimal, it is unsafe - the conduct-guard floor + section 6 catch it.
```

```yaml
# orthogonal to section 1 (LINE-COOK DRIFT), not in conflict with it
who_vs_how_much: section 1 governs WHO writes (a fenced swarm, not the conductor inline); this
                 section governs HOW MUCH gets written. A swarm still climbs the ladder;
                 swarm-first is never a license to fan out volume
plugin_modes:    the ponytail plugin ships `/ponytail lite|full|ultra` + "stop ponytail" (full is
                 the default); this section is the always-on floor beneath whatever mode is set
```

## The anti-patterns this standard replaces (index)

```yaml
# why: each timidity pattern the audit named, and the section that kills it
line_cook_drift:        section 1 - building inline what a swarm could build
size_proxy_for_risk:    section 1 - "one file" treated as low-risk without a risk predicate
swarm_as_optional:      section 2 - a swarm framed as escalation instead of the baseline
small_fan_out_default:  section 2,4 - "small fan-out" anchoring breadth at the minimum
unseated_dispatch:      section 3 - a REVIEW/SHIP/loop dispatch with no persona anchor
hiring_as_exceptional:  section 3 - a hire withheld because the gap is "not certain enough"
conditional_hire_gate:  section 3 - the hire gate skipped for lower-risk work
cost_timidity:          section 4 - a ceiling set low to stay under, starving coverage
report_as_truth:        section 5 - trusting an agent's "done" over state on disk
idle_pass_through_gate: section 5 - LOOP-STOP firing while a human reviews a parked task
green_gate_as_done:     section 6 - a passing suite beside a stale running process
process_staleness:      section 6 - a gate green against the pre-change binary
idle_capacity_waste:    section 7 - idle capacity that waits instead of reading ahead
mid_run_permission_stop: section 8 - a human gate fired mid-run instead of at a ticket edge
guess_over_verify:      section 9 - a swarm proceeding on an unverified assumption instead
                        of climbing the research-swarm / oracle / gate ladder
volume_as_effort:       section 10 - a speculative abstraction, scaffolding "for later", or
                        boilerplate the ladder would skip, shipped and read as progress
```
