# Process doctrine (the learned rules)

Two process rules learned in practice and wired into the harness so they apply by
default. They are surfaced at session start by hooks/process-doctrine.mjs and named
in the antibehavior catalog (references/antibehavior-catalog.md).

## Calibrate verification to the risk of the change

```yaml
rule:     match the weight of verification to the stakes
heavy:    a cold-review subagent (and the three-layer protocol) is for RISKY changes:
          real code with an attack surface, security-sensitive, or high blast radius
light:    for routine, low-risk increments (docs, wiring, config, small mechanical
          edits) lean on the fast deterministic checks: the project's own check scripts
          (selfcheck, eidolon-audit, persona-lint), encoding/dash scans, node --check,
          the test suite. Those ARE the verification for low-risk work.
cadence:  one review pass per logical unit, not per file edit; do not re-review what a
          prior pass or the canary already verified
why:      over-verification (a heavy review after every small edit) is the slow path;
          the deterministic checks are seconds and catch the routine failure modes
boundary: project-specific mandatory-dispatch rules still win where they apply; this is
          about not spending the heaviest tier on cheap, low-risk increments
```

## Mind background work

```yaml
rule:     a launched background workflow or task must be minded until it is confirmed
          done or confirmed hung, never left running unmonitored
how:      poll its status (block-wait a window, or a quick non-blocking check) and
          check liveness between windows (is the transcript or output still growing);
          growth means alive, no growth over a window means hung
on_hang:  stop it and either resume from where it cached, or finish the work inline
never:    end a turn assuming a completion notification will fire; the hang is exactly
          the moment you disengage and no notification comes
also:     do not block-wait idly when you can keep doing your own work and check the
          task once at the dependency point
```

## Where this comes from

These are not in the original design spec; they are operating lessons folded into the
harness so the next run starts with them. They live as advisory rows in the
antibehavior catalog (process and quality group) and as a SessionStart hook, not as
hard blocks: they are dispositions, surfaced as context, not gates on a tool call.
