# Decision log: 2026-06-09 the seat-time anchor gate (closing a rail seam)

Append-only. A gap in the anti-synthetic rail, surfaced by tracing the knowledge
graph of this very repo, then closed with a runtime gate.

## How it was found

A graphify deep build of the repo flagged an INFERRED (0.75) edge:
`validatePersona` (the lint-time rail) and `persona-conduct-guard` (the runtime
guard) are "semantically similar". Tracing that edge to the code showed they are NOT
the same check, and exposed a real seam:

```yaml
validatePersona:        enforces the rail on persona DEFINITION FILES (anchors: [...]
                        non-empty + evidence contract). Never runs at action time.
persona-conduct-guard:  enforced only the 4 detectable ANTI-BEHAVIORS of the seated
                        persona. It read seat.anti_behaviors and never looked at an anchor.
```

So the rail "no anchor, no seat" was enforced at the persona-file layer
(scripts/persona-lint.mjs, run by eidolon-audit) and at expert-hire time, but NOT at
the seat boundary itself. Seating is a by-hand orchestrator write of
.claude/active-persona.json (SKILL.md BUILD step), and the seat schema did not even
carry an anchor. A cold adversarial verifier confirmed it: `rg -i 'anchor' hooks/`
returned zero matches across all 14 hooks. A persona could be seated with teeth and
no anchor, and its anti-behaviors would be enforced while it was never grounded: the
exact synthetic persona the rail exists to forbid.

## The work item

`hooks/persona-conduct-guard.mjs`: add a seat-boundary anchor gate, and make the hook
testable for the first time.

```yaml
refactor:    extract the decision into two pure, exported functions, hasAnchor(seat)
             and evaluateSeat(seat, toolName, toolInput); guard the stdin handler behind
             an invokedDirectly check so importing the module (for tests) does not attach
             the handler. Mirrors the pattern in persona-lint / verify-packet / review-receipt.
gate:        evaluateSeat acts only when a persona with teeth is seated (declared
             anti-behaviors non-empty). At that point the anchor gate runs FIRST: if the
             seat names no anchor, block (no anchor, no seat), before any anti-behavior
             detection. An ungrounded persona does not get to act at all.
seat schema: the seat now carries the persona's anchors (a non-empty list). SKILL.md's
             seating step and hooks/README.md's schema were updated to match.
preserved:   the 4 anti-behavior detectors and their block message are byte-identical;
             a teethless seat is still a no-op; fail-open on bad input is unchanged.
```

## How it ran (Prove-It TDD + canary + cold review)

```yaml
tdd:     7 tests written first (RED via missing exports), including THE GAP test (an
         unanchored persona with teeth is blocked) and three preservation tests. GREEN
         after the refactor.
canary:  the stdin handler is behind invokedDirectly, so unit tests cover only the pure
         functions. A subprocess canary fed real PreToolUse JSON to the hook via cmd
         redirection (PowerShell's pipe does not deliver stdin reliably here): unanchored
         seat -> exit 2 with the no-anchor message; anchored + benign -> exit 0; anchored
         + stub -> exit 2 (anti-behavior preserved); no seat -> exit 0.
review:  a cold adversarial review of the diff confirmed all seven properties (behavior
         preservation, gate ordering, hasAnchor bypass, the invokedDirectly refactor,
         fail-open, migration) HOLD, no CRITICAL/HIGH. It caught one MEDIUM and one LOW,
         both fixed (below).
gates:   eidolon-audit PASS, selfcheck PASS, no dash, 9/9 hook tests.
```

## What the cold review caught, both fixed

```yaml
MEDIUM: the no-anchor gate ran before the tool was inspected, so a Write/Edit that
        REPAIRS the seat (adds an anchor to .claude/active-persona.json) was itself
        blocked: the documented recovery was unreachable through the agent's own tools,
        a potential session wedge. Fix: isSeatRepair() exempts a Write/Edit targeting
        .claude/active-persona.json from the gate, so repair and unseat are always
        reachable. Verified through the real hook (repair -> exit 0, normal action -> exit 2).
LOW:    hasAnchor stringified non-string entries, so anchors: [["TDD"]] or [5] read as
        anchored. Fix: count only non-empty STRING entries (the stricter, safe direction);
        a nested/numeric value is not a named framework, so it does not satisfy the rail.
```

## Behavior change to be aware of

A persona seated by the OLD convention (anti_behaviors written, no anchors field) will
now be blocked on its first governed action with the no-anchor message. The seat is
transient runtime state (git-ignored, re-written on every seat), so the fix is to
re-seat from a linted persona (which carries anchors) or unseat. This is the intended
effect of the rail, not a regression.

## Decision

The rail now holds at all three layers it should: definition (persona-lint), hire
(expert-hiring), and seat (this gate). "No anchor, no seat" is mechanically true at the
seat boundary, not just a slogan enforced upstream. The conduct guard gains its first
unit tests as a side benefit of the testable-extraction refactor.
