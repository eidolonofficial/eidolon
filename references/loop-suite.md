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
