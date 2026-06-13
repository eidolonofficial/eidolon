# The loop suite (bounded autonomous iteration, Expediter-operated)

Long-running work does not get a daemon, a watcher, or an unbounded "keep going"
prompt. It gets a LOOP SUITE: one mutating command that performs exactly one
bounded wave per invocation, one read-only status pane, and one state file that
is the loop's only memory. The runtime (an interval runner or a self-pacing
scheduler) re-invokes the wave command; everything the loop knows lives on disk,
so a context trim, a crash, or a restart loses nothing.

This shape was proven in production on a forensic-replay project (a six-task
implementation queue ground by waves) and hardened by an adversarial review that
confirmed twenty-four findings against the first draft. The rules below are the
survivors of that review, not aspirations.

## Why this shape

```yaml
one_wave_per_invocation: a loop that cannot stop was never a loop; bounding each
                         invocation to ONE task makes every iteration reviewable,
                         attributable, and abortable
state_on_disk:           the queue file is the single memory; every wave cold-reads
                         it and reconciles it against version-control history, so
                         the loop trusts no remembered state, including its own
reconcile_by_evidence:   a task is "done" when its commit exists in history and its
                         gate passes, never because a prior wave said so
human_gates_preserved:   work that requires human judgment (visual confirmation,
                         scope decisions) PARKS at the gate; the loop never
                         manufactures the human's signature
```

## The three artifacts

```yaml
grind_command:  .claude/commands/<project>-queue-grind.md   # the ONLY mutating loop
status_command: .claude/commands/<project>-queue-status.md  # read-only pane + stale-state cross-check
queue_state:    .claude/loop/queue.yaml                     # the loop's only memory
```

The grind command is a single-iteration slash command: drive it with an interval
runner ("every ten minutes, run one wave") or self-paced. The status command
never writes anything; it renders the queue, the budget burn, the halt block,
and a STALE-STATE cross-check of queue claims against version-control history.

## The queue schema (the safety surface lives here, not in hooks)

```yaml
plan:    <path>            # the ONLY file a wave may read task bodies from
branch:  <branch>          # asserted FIRST each wave; mismatch halts before any mutation
status:  ready             # ready | awaiting_human | halted_red | blocked | budget_exhausted | done
halt:    null              # written by post-budget halts: {code, task, reason, evidence, fixlog, ts}
budget:
  max_iterations: <n>      # hard wave ceiling, stated as auditable arithmetic, never magic
  iterations_used: 0       # incremented before any repo-mutating work; crashed waves still count
  max_attempts_per_task: 2 # exhausted -> blocked, halt
  lease_minutes: 45        # an in_progress task older than this is a crashed wave to reconcile
  max_idle_passes: 2       # consecutive no-op heartbeats against a parked queue before LOOP-STOP
tasks:                     # ordered; a wave takes the FIRST pending task and ONLY that task
  - id: <id>
    plan_section: <name>   # the only plan section this wave may read
    autonomy: full|eyes|human  # full = commit; eyes = park at evidence for human confirm; human = never executed by a wave
    files: [<path>, ...]   # the mutation allowlist; any stray changed path halts the wave
    gate: [<command>, ...] # the task's verification commands
    gate_expect: <text>    # the verdict is output-vs-expectation, never an exit code alone
    commit_msg: <text>     # byte-exact; reconcile-by-history depends on it (null = human-recorded completion)
    status: pending        # pending | in_progress | held | done | blocked
```

## The wave contract (every grind iteration, in order, no skips)

1. Cold-read the queue AND recent history. Trust no remembered state.
2. Preflight, writing nothing: any standing guard-bypass marker present halts;
   wrong branch halts; a dirty tree outside the loop's own state dir (and outside
   a held task's declared files) halts. Preflight halts are re-detected fresh
   each wave and never mutate the queue.
3. Release first: a held task the human has confirmed gets ONLY its commit, with
   the byte-exact message, the landed commit verified in history, then done.
4. Heartbeat: a non-ready queue burns an idle pass, reprints the halt block, and
   stops; at the idle-pass ceiling it prints LOOP-STOP so the human cancels the
   runner. A ready queue resets the idle counter.
5. Reconcile: an in_progress task or stale lease is judged by EVIDENCE - its
   commit message searched in FULL history (fixed-string, not the orientation
   read) plus its gate. Found and green is done; missing burns an attempt and
   returns to pending with the orphaned diff reported, NEVER auto-reverted.
6. Completion: no pending and no in_progress means done (all done) or a parked
   heartbeat (held or blocked remain). Detection costs no budget.
7. Budget, then work: increment the iteration counter BEFORE the work it pays
   for, take the first pending task, lease it, and execute ONLY its plan
   section, applying specified code verbatim. A deviation that looks like an
   improvement is a HOLD question for the human, not an edit.
8. Scope-check the tree against the task's file allowlist; a stray path halts
   with the tree left intact for the human.
9. Gate against gate_expect. An unexplained red burns an attempt; at the
   attempt ceiling, write the fix-log stub and halt. Never bulldoze a red.
10. Disposition by autonomy: full commits exactly the allowlisted files and
    verifies the commit landed in history; eyes captures the visual evidence,
    parks the task held, and sets the queue awaiting_human; human tasks are
    never executed by a wave at all.
11. Persist by surgical delta: re-read the queue fresh, apply only this wave's
    own field changes, read the result back. A human edit found mid-wave is
    preserved verbatim, never clobbered by a stale full-file write.
12. Print the one-line wave summary: wave n of max, task, disposition, evidence.

## Halt codes

Name every way the loop can stop, and map each to a queue status, so a halted
loop always has an exit and the status pane always has a next action. Preflight
halts (wrong branch, dirty tree, standing bypass marker) write nothing; halts
after the budget increment write the halt block with code, task, reason,
evidence, fix-log path, and timestamp.

## Authority and enforcement

```yaml
operator:        the Expediter (the controller); subagents NEVER edit the loop suite,
                 the queue, or any hook (see SKILL.md INVARIANTS orchestration.lock)
edits:           beneficial only - a change must make the loop SAFER or more accurate,
                 proven by executing the changed logic against the exact cases at stake,
                 and disclosed in a fix log; loosening a halt to dodge a live stop is
                 forbidden
guard_interplay: if the project runs a scaffold-drift or scope guard, the loop's state
                 dir must be exempt or neutral in that guard's matcher - and the claim
                 "it is neutral" is verified by EXECUTING the guard's matcher against
                 the exact commands the wave emits (a state commit naming the state dir
                 is the classic trap), never by reading the pattern and predicting
bypass_markers:  the loop never self-issues a guard's user-authorization marker; a
                 standing marker found at preflight is a halt, because verification
                 performed while a guard is muted is theater
```

## Operator runbook (four lines)

1. Point the queue at the branch and plan, seed the tasks, and clear the tree.
2. Start the runner against the grind command; watch the first wave land.
3. At each held park, confirm the evidence with your own eyes, then release.
4. At any terminal halt, read the status pane and follow its next action;
   cancel the runner when the queue reads done.

# 2026-06-12 standard uplift (field-proven on fraud-forensic-replay)

The loop suite above is the bounded-wave skeleton. This section codifies the
operating standard that ran it in production through 2026-06-11/12: the loop runs
as a self-rearming heartbeat, each wave conducts a swarm rather than cooking code
itself, the queue carries the full memory schema, and the defaults are tightened
for aggression. Every claim below carries its FFR-artifact provenance, dated
2026-06-11/12.

## The standing heartbeat (self-rearming wakeup loop)

```yaml
# why: a stateless wave invocation becomes a resilient queue-draining daemon only
#      when something re-arms it; the heartbeat IS that backstop.
cadence:        ~1500 seconds (the 25-minute lease window); one firing per cadence
                # prov: queue.yaml:27 lease_minutes 25; eidolon-manifest.yaml:87 loops block
fire_does:      [state-pulse every running swarm, reap past-lease zombies with
                 state-injected respawns, advance the queue one swarm-conducting wave,
                 re-arm self]
                # prov: ffr-queue-grind.md step 5 (heartbeat no-op path) + step 7 (reconcile stale lease)
state_pulse:    per running swarm read fenced-file git status, deliverable existence
                on disk, and the lease clock; reports are claims, this read is truth
                # prov: eidolon-manifest.yaml:91 "STATE pulse every controller turn ... reports are claims, state is truth"
zombie_reap:    no state delta inside the lease -> TaskStop, CONFIRM termination
                (a BLOCKED or returned report is NOT termination), respawn fresh with
                state injected; never edit a possibly-live agent's files
                # prov: eidolon-manifest.yaml:92-93; ffr-queue-grind.md step 7
park_only_at:   human gates (H7 awaiting_human, H10 eyes_unavailable); a parked queue
                does not advance, it heartbeats
                # prov: queue.yaml status enum awaiting_human; loop-suite human_gates_preserved above
rearm_unless:   queue reads done OR the operator says stop OR idle_passes >= max_idle_passes
                (then print LOOP-STOP and the halt block; never spin indefinitely)
                # prov: ffr-queue-grind.md step 5 "at >= max_idle_passes print LOOP-STOP"; queue.yaml:28-29
```

- Fire on the lease cadence; never sooner, never on a timer derived from a clock other than the lease.
- Pulse state on every running swarm before deciding anything; trust no remembered state, including the prior wave's.
- Reap a zombie only after CONFIRMING termination; a returned report is a claim, not a death certificate.
- Respawn a reaped task fresh with its state injected; never resume a possibly-live agent's files in place.
- Park at a human gate; never manufacture the human's signature to keep the loop moving.
- Re-arm after every non-terminal firing; stop only on done, operator-stop, or the idle-pass ceiling.

## Swarm-conducting waves (the default wave shape)

```yaml
# why: the wave is the conductor, not the cook; it dispatches the build and stays
#      the gatekeeper, so every commit-of-record passes one accountable scope check.
default_shape:  the wave dispatches persona-seated, scope-fenced build agents and
                itself remains gate-runner, scope-checker, and committer
                # prov: ffr-queue-grind.md:16-24; queue.yaml:11
prefer:         ONE standing-pipeline Workflow per task (build chains -> full gate ->
                N adversarial review lenses -> bounded fix rounds), invoked via
                scriptPath + args, over hand-dispatched agents
                # prov: ffr-pipeline.js:2-34; eidolon-manifest.yaml:89; queue.yaml:11
seat_every:     every dispatched agent seats a named eidolon persona from the roster;
                no exceptions
                # prov: ffr-queue-grind.md:18 "Every dispatch seats an eidolon persona ... no exceptions"
fences_hard:    named files from the task's allowlist only; the wave INJECTS the
                plan_section content into each prompt; agents NEVER read the plan file
                # prov: ffr-queue-grind.md:19
self_contained: every prompt stands alone (subagents carry no conversation context)
                # prov: ffr-pipeline.js:21-24
fix_loop:       bounded (maxFixRounds default 2), re-gated each round; a third red
                means the plan was wrong -> surface to the user, do not re-fix
                # prov: ffr-pipeline.js:41 MAX_FIX=2; eidolon-manifest.yaml:93
wave_verifies:  a dispatched agent's "done" is a claim the wave confirms BY STATE
                (git status on fenced files) before gating or committing
                # prov: ffr-queue-grind.md:23-24; ffr-pipeline.js:21-24
model_cascade:  cheap tier (Sonnet) for fan-out build/measure, deep tier (Opus) for
                adversarial review lenses, conductor tier for judgment/merge, smallest
                tier (Haiku) for doc edits only; model passed per agent() call
                # prov: memory/MEMORY.md swarm-model-cascade; ffr-pipeline.js:15-17
```

- Dispatch the build; do not cook the code in the wave itself.
- Seat a named persona on every agent; an unseated dispatch is rejected.
- Fence each agent to the task allowlist and inject the plan section; agents never open the plan file.
- Prefer one standing-pipeline Workflow per task over hand-rolled agent fan-out.
- Bound the fix loop at two rounds; surface a third red to the user instead of re-fixing.
- Verify every agent's "done" by state before the wave gates or commits; the report is a claim.
- Pass the model per call by tier: Sonnet fans out, Opus reviews, conductor judges, Haiku edits docs only.

## Queue-as-memory schema essentials

```yaml
# why: the YAML is the loop's only durable memory; every wave cold-reads it and
#      reconciles against version-control history, so trims, crashes, and restarts
#      lose nothing because the schema is the state surface, not the context window.
sole_memory:    the queue file is the loop's only state; cold-read it and reconcile
                against git log before acting, every wave
                # prov: queue.yaml:4-7
budgets:        max_iterations (hard wave ceiling), max_attempts_per_task (exhausted
                -> blocked), lease_minutes, max_idle_passes (no-op heartbeats before
                LOOP-STOP); iteration counter increments BEFORE the work it pays for
                # prov: loop-suite budget block above; queue.yaml:28-29
lease_default:  25 minutes (tightened from 45, user-ordered 2026-06-11): a task with no
                state delta past its lease is a crashed wave, eligible for reap+respawn
                # prov: queue.yaml:27
autonomy_tiers: full (implement + gate + commit); eyes (implement + gate + park for
                human pixel-confirm, NEVER self-commit visual files); human (never
                executed by a wave, halts at the human gate)
                # prov: queue.yaml:33-36
scope_caps:     per-task file allowlist named explicitly (task.files); any stray changed
                path halts the wave with the tree left intact
                # prov: queue.yaml task.files; loop-suite step 8 above
evidence_fields: per-task recorded signals that prove done (sha, gate_tail, png), NOT
                the agent's free-text claim
                # prov: queue.yaml:57-59
halt_codes:     every stop maps to a queue status (ready | awaiting_human | halted_red |
                blocked | budget_exhausted | done); a halted loop always has an exit and
                the status pane always has a next action
                # prov: loop-suite halt-codes section above; queue.yaml status enum
surgical_write: every queue write re-reads the file fresh first and applies ONLY this
                wave's own field deltas; never rewrite the whole file from a stale copy
                # prov: ffr-queue-grind.md:32
```

- Treat the queue YAML as the single source of memory; reconcile it against git log every wave.
- Increment the iteration counter before the work it pays for; a crashed wave still counts.
- Default leases to 25 minutes; a task idle past its lease is a crashed wave to reap.
- Tag every task with an autonomy tier; eyes-tier never self-commits visual files.
- Name the scope cap as explicit files; any stray path halts the wave with the tree intact.
- Record done with state-derived evidence fields (sha, gate_tail, png), never free text.
- Write the queue by surgical delta on a fresh re-read; never clobber a human edit with a stale full write.

## Aggression defaults (2026-06-11/12)

```yaml
# why: the line should not idle. Tighten the reap clock, treat a stale pointer as a
#      defect, and route slack time into the next slice's specs instead of sleeping.
lease_tightening: leases default to 25 minutes (from 45), for faster zombie reap
                  # prov: queue.yaml:27 "tightened from 45 (user-ordered aggression 2026-06-11)"
stale_pointer:    a queue pointing at a dead plan or a dead branch is itself a HARNESS
                  DEFECT; re-seed it immediately, do not grind against the corpse
                  # prov: loop-suite reconcile-by-evidence + branch-assert preflight (steps 1-2);
                  #       FIX-2026-06-11-stale-backend-process-survives-restart.md (staleness-is-a-defect lesson)
idle_routes_to:   idle passes route to the SPEC FOUNDRY (read-only parallel swarms
                  authoring the NEXT slice's tasked specs and verified-API briefs),
                  NOT to sleep; see conductor-standard.md
                  # prov: memory/MEMORY.md expediter-orchestration spec-foundry; eidolon-manifest.yaml:95
                  #       (idle_patrol is the read-only variant; spec-foundry is the active-parallel variant)
idle_floor:       an idle patrol writes BACKLOG candidates ONLY, never unrequested diffs;
                  the spec foundry commits nothing
                  # prov: eidolon-manifest.yaml:95
process_staleness: a feature whose outcome depends on a fresh process carries a restart
                  drill as its done-signal (kill + restart + verify a code-identity field
                  through both ports + screenshot); a green suite beside a stale process
                  proves nothing
                  # prov: FIX-2026-06-11-stale-backend-process-survives-restart.md:1-36; done_is_the_outcome above
```

- Default the lease to 25 minutes; reap faster, do not let a dead agent hold a task for 45.
- Treat a queue pointing at a dead plan or branch as a harness defect; re-seed it immediately.
- Route idle passes to the spec foundry, not to sleep; the line is never blocked on a missing spec.
- Hold the idle floor: patrol writes BACKLOG only, the spec foundry commits nothing.
- Carry a restart drill as the done-signal for any feature whose outcome depends on a fresh process.

# 2026-06-13 ASI-Evolve cognition-loop uplift (research-grounded)

The 2026-06-12 uplift made the loop a swarm-conducting heartbeat. This section adds a
COGNITION LOOP on top, ported from ASI-Evolve (arXiv 2603.29640, GAIR-NLP): a
learn -> design -> experiment -> analyze cycle with a COGNITION BASE (accumulated priors
injected each round) and an ANALYZER (distills outcomes into reusable insights). Eidolon
already owns the substrates -- mempalace (prose), graphify (code graph), docs/fixes/,
docs/notes/, /learn -- but the loop never wired them INTO the wave as a closed feedback
cycle: priors are read by controller habit, not injected per dispatch; failures get
fix-logs but successes are not distilled; mempalace grows but is never audited. These four
upgrades close the loop. The "does not transfer" fence at the end is load-bearing.

## 1. Cognition injection at wave-start (cognition base -> mempalace + fix-logs)

```yaml
# why: a dispatched agent prompt "stands alone" (self_contained) for scope isolation,
#      which is correct -- but it means zero prior knowledge rides along, so the swarm
#      re-explores territory the fix-logs already mapped. ASI-Evolve retrieves ~150
#      curated cognition entries per round; the analogue is a bounded, query-derived prior.
inject_step:   before dispatch, the CONDUCTOR (never the agent) runs
               `mempalace search "<task domain + files>" --wing <wing> --results 3-5` plus a
               filename-keyword glob of docs/fixes/FIX-*.md, and folds the top hits into a
               `prior_context` stanza alongside the plan_section it already injects
not_inheritance: this is NOT conversation/context inheritance -- the agent still cannot read
               the plan file or the transcript; it gets ONLY the retrieved, bounded hits
once_per_wave: retrieval happens once at the conductor level per wave, not per agent turn
               # prov: swarm-conducting fences_hard (the wave already INJECTS plan_section);
               #       ASI-Evolve Cognition section (semantic retrieval of curated priors)
```

- Inject a bounded `prior_context` (mempalace + fix-log hits) into every dispatch, beside the plan section.
- The conductor retrieves; the agent receives. Retrieval is query-derived and capped, never a history dump.
- This does not loosen scope isolation: the prior is curated hits, not the plan file or the conversation.

## 2. Distilled task-analysis record (analyzer -> /learn + structured postmortem)

```yaml
# why: today failures emit a fix-log and /learn is human-invoked; SUCCESSES vanish. ASI-Evolve's
#      Analyzer persists a structured record of every trial (motivation, program, result, analysis)
#      so future rounds retrieve it. The loop's evidence fields (sha, gate_tail, png) are evidence,
#      not analysis.
emit_step:     after the wave one-line summary (step 12), every COMPLETED task (not only reds)
               emits a 4-field record: what_worked (the decision that produced green),
               what_failed_enroute (red rounds before green), prior_misses (injected cognition
               that did NOT help -> downweight), new_priors (patterns worth injecting next time)
persist_to:    docs/notes/ (a machine-written postmortem, distinct from the human INSIGHT notes),
               mined to mempalace by the existing Stop/post-commit hook
               # prov: queue.yaml evidence_fields (evidence, not analysis); ASI-Evolve Analyzer section
```

- Emit a structured analysis record for every completed task, successes included, not just fix-logs on red.
- Record what_worked / prior_misses / new_priors so upgrade 1's injection sharpens over time.

## 3. Informed re-seed after a halt (experiment DB parent-selection, narrow port only)

```yaml
# why: at the attempt ceiling a task halts and the human re-plans blind. ASI-Evolve picks a
#      PARENT to build from (UCB1/greedy/MAP-Elites). Only the narrowest form ports: a one-step
#      greedy "re-insert after the task this one most depends on", read from the analysis records.
on_halt:       before the human re-plans a blocked task, the conductor consults the upgrade-2
               records to find whether an already-completed task's new_priors unblock it, and
               proposes re-inserting the blocked task after that dependency, not at its old slot
               # prov: loop-suite step 9 halt; ASI-Evolve Database parent-selection (narrow port)
```

- After an attempt-ceiling halt, propose an informed re-seed (re-order by discovered dependency), not a blind re-fix.

## 4. Cognition-audit wave (prior-quality hygiene -- closes the mempalace asymmetry)

```yaml
# why: graphify auto-refreshes the code graph on every commit; mempalace only GROWS -- stale
#      priors accelerate the swarm in the wrong direction. ASI-Evolve notes wrong priors are worse
#      than none. This is the missing hygiene pass.
audit_wave:    a periodic READ-ONLY spec-foundry variant (commits nothing) that queries every
               wing-tagged mempalace entry, cross-checks it against current code (does the named
               file/pattern still exist? does the fix-log root cause still match the architecture?),
               and emits docs/notes/MEMORY-AUDIT-YYYY-MM-DD.md listing entries to deprecate / update / promote
skills:        the same wave governs the self-authored SKILL library (references/skill-authoring.md
               step 6): merge duplicates, prune the consistently-unused, and flag a skill that
               encoded one run's literals (file names, paths, magic numbers) as stale
trigger:       operator-triggered, not autonomous -- the output is human-ratifiable (SPECULATIVE
               until the operator accepts it), like every foundry product
               # prov: conductor-standard.md spec foundry (foundry commits nothing, output is speculative);
               #       eidolon-manifest.yaml graphify-auto-refresh vs mempalace-grows-only asymmetry
```

- Run a read-only cognition-audit foundry wave to flag stale mempalace priors against current code; the operator ratifies.

## What does NOT transfer (the fence)

ASI-Evolve runs 50-150 exploration rounds scored by a numeric evaluator (perplexity, accuracy),
with MAP-Elites / UCB1 parent selection over a candidate POPULATION searching a continuous
improvement space. Eidolon is a DELIVERY machine: bounded waves, a binary gate (green/red) against
a spec, a human pixel gate. The population-search, numeric-fitness, and island-sampling machinery
does NOT port -- tasks are ordered delivery steps, not interchangeable variants of one solution.
Only the cognition-base + analyzer + closed-loop SHAPE ports; upgrade 3 is deliberately the
narrowest slice of parent-selection that survives that distinction. Source: ASI-Evolve arXiv
2603.29640 + github.com/GAIR-NLP/ASI-Evolve; mapping grounded in this file + conductor-standard.md.
