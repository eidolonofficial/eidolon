# The loop suite (bounded autonomous iteration, conductor-operated)

Long-running work does not get a daemon, a watcher, or an unbounded "keep going"
prompt. It gets a LOOP SUITE: one mutating command that performs exactly one
bounded wave per invocation, one read-only status pane, and one state file that
is the loop's only memory. The runtime (an interval runner or a self-pacing scheduler)
re-invokes the wave command; a context trim, a crash, or a restart loses nothing.

Proven in production on a forensic-replay project (a six-task queue ground by waves)
and hardened by an adversarial review that confirmed twenty-four findings against the
first draft. Loops that are not grind queues (a goal, a poll, a routine) follow
`references/engineering-principles.md` section 2 and are built with
`references/autopilot-guide.md`.

## Why this shape

```yaml
# why: a loop that cannot stop was never a loop
one_wave_per_invocation: ONE task per invocation makes every iteration reviewable and abortable
state_on_disk:           the queue file is the single memory; every wave cold-reads it and
                         reconciles it against version-control history, trusting no remembered state
reconcile_by_evidence:   a task is "done" when its commit exists in history and its gate passes,
                         never because a prior wave said so
human_gates_preserved:   work needing human judgment (visual confirmation, scope decisions) PARKS
                         at the gate; the loop never manufactures the human's signature
```

## The three artifacts

```yaml
# why: one mutating command, one read-only pane, one memory; nothing else may write loop state
grind_command:  .claude/commands/<project>-queue-grind.md   # the ONLY mutating loop, one iteration
status_command: .claude/commands/<project>-queue-status.md  # read-only pane + stale-state cross-check
queue_state:    .claude/loop/queue.yaml                     # the loop's only memory
```

## The queue schema (the safety surface lives here, not in hooks)

```yaml
# why: the schema is the state surface; a trim, crash, or restart loses nothing
plan:    <path>            # the ONLY file a wave may read task bodies from
branch:  <branch>          # asserted FIRST each wave; mismatch halts before any mutation
status:  ready             # ready | awaiting_human | halted_red | blocked | budget_exhausted | done
halt:    null              # written by post-budget halts: {code, task, reason, evidence, fixlog, ts}
budget:
  max_iterations: <n>      # hard wave ceiling, stated as auditable arithmetic, never magic
  iterations_used: 0       # incremented before any repo-mutating work; crashed waves still count
  max_attempts_per_task: 2 # exhausted -> blocked, halt
  lease_minutes: 25        # an in_progress task older than this is a crashed wave to reconcile
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
    evidence: {}           # state-derived signals that prove done (sha, gate_tail, png), never free text
```

## The wave contract (every grind iteration, in order, no skips)

1. Cold-read the queue AND recent history. Trust no remembered state.
2. Preflight, writing nothing: a standing guard-bypass marker halts; wrong branch halts;
   a dirty tree outside the loop's state dir (and a held task's files) halts. Preflight
   halts are re-detected fresh each wave and never mutate the queue.
3. Release first: a held task the human confirmed gets ONLY its commit, with the
   byte-exact message, the landed commit verified in history, then done.
4. Heartbeat: a non-ready queue burns an idle pass, reprints the halt block, and stops;
   at the idle-pass ceiling it prints LOOP-STOP so the human cancels the runner. A
   ready queue resets the idle counter.
5. Reconcile: an in_progress task or stale lease is judged by EVIDENCE: its commit
   message searched in FULL history (fixed-string) plus its gate. Found and green is
   done; missing burns an attempt and returns to pending, the orphaned diff reported,
   NEVER auto-reverted.
6. Completion: no pending and no in_progress means done, or a parked heartbeat (held or
   blocked remain). Detection costs no budget.
7. Budget, then work: increment the iteration counter BEFORE the work it pays for, lease
   the first pending task, and execute ONLY its plan section, applying specified code
   verbatim. A deviation that looks like an improvement is a HOLD question, not an edit.
8. Scope-check the tree against the file allowlist; a stray path halts with the tree intact.
9. Gate against gate_expect. An unexplained red burns an attempt; at the attempt ceiling,
   write the fix-log stub and halt. Never bulldoze a red.
10. Disposition by autonomy: full commits exactly the allowlisted files and verifies the
    commit landed; eyes captures the visual evidence, parks the task held, and sets the
    queue awaiting_human; human tasks are never executed by a wave.
11. Persist by surgical delta: re-read the queue fresh, apply only this wave's own field
    changes, read the result back. A human edit found mid-wave is preserved verbatim.
12. Print the one-line wave summary: wave n of max, task, disposition, evidence.

## Halt codes

Map every way the loop can stop to a queue status, so a halt always has an exit and a next
action. Preflight halts (wrong branch,
dirty tree, standing bypass marker) write nothing; halts after the budget increment write
the halt block with code, task, reason, evidence, fix-log path, and timestamp.

## Authority and enforcement

```yaml
# why: the loop is safe only while one accountable actor edits it
operator:        the conductor; subagents NEVER edit the loop suite, the queue, or any hook
                 (conductor-standard.md section 1, hook_infra)
edits:           beneficial only: a change makes the loop SAFER or more accurate, proven by
                 executing the changed logic against the cases at stake and disclosed in a fix
                 log; loosening a halt to dodge a live stop is forbidden
guard_interplay: the loop's state dir must be exempt or neutral in any scope or drift guard's
                 matcher, verified by EXECUTING the matcher against the exact commands the wave
                 emits (a state commit naming the state dir is the classic trap)
bypass_markers:  the loop never self-issues a guard's user-authorization marker; a standing
                 marker at preflight is a halt, because verification under a muted guard is theater
```

## Operator runbook (four lines)

1. Point the queue at the branch and plan, seed the tasks, and clear the tree.
2. Start the runner against the grind command; watch the first wave land.
3. At each held park, confirm the evidence with your own eyes, then release.
4. At any terminal halt, read the status pane and follow its next action;
   cancel the runner when the queue reads done.

# 2026-06-12 standard uplift (field-proven on fraud-forensic-replay)

The skeleton above ran through 2026-06-11/12 as a self-rearming heartbeat whose waves conduct swarms.

## The standing heartbeat (self-rearming wakeup loop)

```yaml
# why: a stateless wave becomes a queue-draining daemon only when something re-arms it
cadence:      ~1500 seconds (the 25-minute lease window); one firing per cadence
fire_does:    [state-pulse every running swarm, reap past-lease zombies with state-injected
               respawns, advance the queue one swarm-conducting wave, re-arm self]
state_pulse:  fenced-file git status, deliverable existence on disk, the lease clock;
              reports are claims, this read is truth
zombie_reap:  no state delta inside the lease -> TaskStop, CONFIRM termination (a returned
              report is NOT termination), respawn fresh with state injected; never edit a
              possibly-live agent's files
park_only_at: human gates (awaiting_human, eyes_unavailable); a parked queue heartbeats
rearm_unless: queue reads done OR the operator says stop OR idle_passes >= max_idle_passes
              (then print LOOP-STOP and the halt block; never spin)
```

## Swarm-conducting waves (the default wave shape)

```yaml
# why: the wave is the conductor, not the cook; every commit of record passes one scope check
default_shape:  the wave dispatches persona-seated, scope-fenced build agents and remains
                gate-runner, scope-checker, and committer
prefer:         ONE standing-pipeline Workflow per task (build chains -> full gate -> N
                adversarial review lenses -> bounded fix rounds) over hand-dispatched agents
fences_hard:    named files from the task allowlist only; the wave INJECTS the plan_section
                into each prompt; agents NEVER read the plan file; every prompt stands alone
fix_loop:       bounded (default 2 rounds), re-gated each round; a third red means the plan
                was wrong -> surface to the user, do not re-fix
wave_verifies:  an agent's "done" is a claim the wave confirms BY STATE before gating or committing
model_cascade:  tiers per conductor-standard.md section 4; model and effort passed per agent
```

## Queue-as-memory essentials

```yaml
# why: the YAML is the loop's only durable memory, not the context window
sole_memory:    cold-read the queue and reconcile against git log before acting, every wave
autonomy_tiers: full (implement, gate, commit); eyes (park for human pixel-confirm, NEVER
                self-commit visual files); human (never executed by a wave)
surgical_write: every queue write re-reads fresh and applies ONLY this wave's own field deltas
```

## Aggression defaults (2026-06-11/12)

```yaml
# why: the line should not idle; reap faster, treat a stale pointer as a defect, route slack to specs
lease:             25 minutes (from 45), for faster zombie reap
stale_pointer:     a queue pointing at a dead plan or branch is a HARNESS DEFECT; re-seed it
                   immediately, do not grind against the corpse
idle_routes_to:    the SPEC FOUNDRY (conductor-standard.md section 7), not sleep; the idle
                   patrol writes BACKLOG candidates only, the foundry commits nothing
process_staleness: a feature that depends on a fresh process carries a restart drill as its
                   done-signal (kill, restart, verify a code-identity field, screenshot); a
                   green suite beside a stale process proves nothing
```

# 2026-06-13 cognition-loop uplift

The loop gains a learn, design, experiment, analyze cycle over substrates it already
owns: mempalace (prose), graphify (code graph), docs/fixes/, docs/notes/, and /learn.
The cycle is adapted from ASI-Evolve (GAIR-NLP, arXiv 2603.29640); no upstream code ships.

## 1. Cognition injection at wave-start

```yaml
# why: a dispatched prompt stands alone for scope isolation, so no prior knowledge rides
#      along and the swarm re-explores ground the fix-logs already mapped
inject_step:    before dispatch, the CONDUCTOR (never the agent) retrieves a bounded prior of
                3 to 5 hits from `mempalace search "<task domain + files>"` plus a
                filename-keyword glob of docs/fixes/FIX-*.md, and injects them as a
                `prior_context` stanza beside the plan section
```

- The conductor retrieves; the agent receives only the capped hits and never reads history.
- Retrieve once per wave; the prior is curated hits, never the plan file.

## 2. Task-analysis record after each completed task

```yaml
# why: failures emit a fix-log; successes vanish. Evidence fields prove done, they do not analyze.
emit_step:  after the wave summary (step 12), every COMPLETED task emits what_worked,
            what_failed_enroute, prior_misses (injected hits that did not help), new_priors
persist_to: docs/notes/, mined to mempalace by the post-commit hook (hooks/memory-sync.post-commit.sh)
```

- Emit the four-field record for every completed task, successes included.
- Feed new_priors and prior_misses back into upgrade 1.

## 4. Memory-audit wave

```yaml
# why: graphify refreshes the code graph on every commit; mempalace only grows, and a stale
#      prior steers a swarm the wrong way
audit_wave: a periodic READ-ONLY spec-foundry variant (commits nothing) that checks each
            mempalace entry against current code and emits docs/notes/MEMORY-AUDIT-YYYY-MM-DD.md
            listing entries to deprecate, update, or promote; it also covers the self-authored
            skill library (references/skill-authoring.md)
```

- Run the audit read-only and operator-triggered; its output is SPECULATIVE until the operator ratifies it.
- The audit never deletes a record; removal is a human decision.
