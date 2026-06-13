---
name: harness-guard-verb-in-command
description: When a git commit message or Bash command must MENTION a guard-tripping verb (history-rewrite, removal, hooks-path) only to describe a change, phrase around the literal token so the conduct-guard / commit-quality-guard does not block your own command.
triggers: ["PERSONA CONDUCT GUARD [BLOCKED", "commit-quality-guard", "removal-verb on the hook suite", "disable-or-route-around-hook", "rewrite-history-to-dodge-gate"]
scope: project
project: fraud-forensic-replay
tool_scope: [Bash, Edit]
source: authored
authored: 2026-06-13
session_evidence: persona-conduct-guard.mjs:36-55 (the route-around-hook and history-rewrite detectors scan the whole command string, including a -m / -F message body)
---

# harness-guard-verb-in-command

The worked example that proves the skill-authoring machinery. Distilled from a real,
twice-repeated failure: a commit whose MESSAGE described guard-relevant verbs tripped the
guard that scans the command string, blocking the commit itself.

## When to invoke
You are about to run a `git commit` (`-m` / `-F`) or another Bash command whose message or
arguments must reference a guard-relevant verb -- a history-rewrite command, a removal command
on a hook path, a hooks-path override, or a non-lease force-push -- only to DESCRIBE a change,
not to perform it. The conduct-guard and commit-quality-guard scan the whole command string
and cannot tell a verb in a message from a verb being executed, so they block the command.

## Steps
1. Before composing the message or command, scan your own text for the literal tokens the
   guards match: the history-rewrite commands, the removal commands adjacent to a hook path,
   the hooks-path config key, and a non-lease force-push flag.
2. If a token appears only to DESCRIBE work (a commit body, a doc line), rephrase to the
   category: "history-rewrite" rather than the literal command, "the removal-verb set" rather
   than listing them, "a hooks-path override" rather than the literal key.
3. If the token must be literal because you are genuinely running the op, the block is the
   guard working as designed -- honor it: do the op a safe way or surface it to the operator;
   never route around the guard.
4. Re-run with the reworded text; the command passes because no executable verb pattern remains.

## Evals
1. Given a `git commit -F -` whose body lists three removal commands as documented verbs, when
   the message is composed, then they are reworded to "the removal-verb set" and the commit
   lands with no conduct-guard block.
2. Given a message describing a fix as blocking a real history-rewrite command (literal), when
   composed, then it is reworded to "a history-rewrite call" and the commit lands.
3. Given a command that ACTUALLY performs a hooks-path override, when attempted, then the skill
   does NOT suppress the guard -- the block is correct and is honored, not worked around.
4. Given a benign commit message with no guard verbs, when composed, then no rewrite happens
   and the command runs unchanged.
