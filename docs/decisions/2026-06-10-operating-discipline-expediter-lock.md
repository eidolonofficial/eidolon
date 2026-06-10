# Decision log: 2026-06-10 operating discipline, the Expediter lock, the advisor ban, the loop suite

Append-only. Records the increment that carries the production-learned operating
discipline into every persona, locks the Expediter to the controller, forbids
subagents from advisor calls, and lands the loop-suite reference.

## What was built

1. **Operating discipline (every persona).** A shared block, identical across the
   template and all fourteen personas (twelve base plus two examples), added as a
   sibling of the engineering disposition: done_is_the_outcome,
   measure_before_build, scope_every_claim, verify_by_execution, evidence_first.
   The five rules are production-learned, each from a named failure in the source
   project: a feature declared "done, verified, green" while the product it
   shipped was wrong; a build dispatched on assumed state; a "gate green" claim
   over a latent lint error; a guard interaction read instead of executed; a
   challenge answered with confidence instead of evidence. Inserted by a single
   script so the block is byte-identical everywhere; persona-lint passes on all
   fourteen.

2. **The Expediter lock (persona-conduct-guard).** The Expediter is the
   controller's persona: the executive dispatcher that owns done-criteria,
   measures before dispatch, and holds sole authority over hooks and loops. A
   dispatched subagent seated as the Expediter is now HARD STOPPED on any action
   and the seat is automatically deactivated (the guard unlinks the seat file
   itself). The check runs before the teeth gate (a bare seat still trips it) and
   before the seat-repair carve-out (repair is not an escape hatch). Subagent
   detection reads the harness transcript_path (subagent transcripts live under a
   subagents directory) and fails open as the main session when absent.

3. **The advisor ban (advisor-guard, new).** A dispatched subagent calling any
   advisor-shaped tool is hard-blocked with a redirection to its bounded task and
   the stop-and-report path. The main session passes untouched. Grounding
   incident: four orchestrated agents each opened with an advisor call and
   produced zero file writes; the loss was caught from the filesystem, not from
   their reports.

4. **The loop suite (references/loop-suite.md, new).** The generalized bounded-
   iteration shape: one mutating wave command, one read-only status pane, one
   queue-state file, budgets, leases, halt codes, autonomy tiers, and the
   guard-interplay rule that neutrality claims are verified by executing the
   guard's matcher. Distilled from a production queue ground by waves and an
   adversarial review that confirmed twenty-four findings against the first
   draft.

5. **SKILL.md INVARIANTS.** The verification block gains state/fanout/triage
   (changed-state over reported-success; probe one item before scaling a swarm;
   root-cause a failing tool before working around it). A new orchestration block
   carries the Expediter persona in its executive-dispatcher register, the lock,
   DMAIC, the five-rule discipline, wave control, the advisor rule, the
   hooks-and-loops authority bound to beneficial-only changes, and the loop-suite
   pointer.

## Validation

```yaml
persona_lint: fourteen of fourteen PASS after the block insertion
hook_tests:   node --test hooks/*.test.mjs -> 58 pass, 0 fail (includes six new
              Expediter-lock tests and three new advisor-guard tests)
parse:        node --check on both changed/new guards -> clean
dashes:       the inserted block and all new copy carry no em or en dash
settings:     .claude/settings.json gains one matcher entry (.*advisor.*); nothing
              existing was weakened or removed
```

## Decision

The discipline is persona-wide; the authority is not. Every persona carries the
five operating rules. Only the Expediter, and only in the main session, touches
hooks and loops, and only for beneficial, second-signal-proven, disclosed
changes. Workers work; the dispatcher conducts.
