# Eidolon hook suite

Neutral-named governance gates. Advisory hooks inject context; hard blocks exit
non-zero. This is the full suite (design spec section 11), and it enforces the
unified antibehavior catalog (references/antibehavior-catalog.md, section 10).
Each hook reads the Claude Code hook JSON on stdin, fails open on bad input, and
follows the I/O contract proven by the lineage's `uncertainty-guard.mjs`.

| Hook | Event | Enforcement |
|---|---|---|
| verification-guard | PreToolUse (Bash, `git commit`) | Blocks a commit message that claims a visual or runtime result works without naming evidence. The most insistent guard. |
| commit-quality-guard | PreToolUse (Bash) | Blocks `--no-verify`, a non-lease `--force` push, `core.hooksPath` override, and `filter-branch` / `filter-repo` history surgery. |
| append-only-record-guard | PreToolUse (Write, Edit) | Advises on a shrinking edit to the fix / insight / decision logs; blocks an emptying one (silent deletion). |
| persona-conduct-guard | PreToolUse (Bash, Write, Edit) | When a persona is seated (`.claude/active-persona.json`), blocks an action that crosses that persona's declared anti-behaviors, naming the persona and the line. A no-op when none seated. |
| hook-integrity-guard | PreToolUse (Bash) | Blocks disabling, moving, or chmod of any hook, or changing the hooks path. |
| deletion-guard | PreToolUse (Bash) | Walls outright `rm` / `del` of an append-only record (fix / insight / decision log). |
| protected-paths-guard | PreToolUse (Bash) | Blocks a destructive op on a protected path (.git, a record, a hook, settings.json, the persona template). |
| visual-evidence-gate | PreToolUse (Bash, `git commit`) | Blocks a commit that stages a visual file without naming evidence it was looked at. |
| conduct-guard | PreToolUse (Write, Edit, Bash `git commit`) | Advises on conduct-drift language (deferring doable work, stub-instead-of-fix, unverified claim). |
| drift-guard | PreToolUse (Write, Edit) | Counts consecutive scaffold-only edits; advises from 6, blocks at 10; resets on deliverable work. |
| session-save | PreCompact | Saves a run-state note before context is trimmed (template). |
| session-restore | SessionStart | Restores the run-state note (template). |
| process-doctrine | SessionStart | Surfaces the process doctrine (calibrate verification to risk; mind background work) as context. Advisory. |
| memory-sync | git post-commit | Fans out a prose-memory capture and a graph update, resource-guarded (shell template). |

## Wiring

Verified against the official Claude Code hooks docs
(https://code.claude.com/docs/en/hooks.md, checked 2026-06-08). The exec form
(`command` + `args`) substitutes `${CLAUDE_PROJECT_DIR}` as a plain string into
both `command` and each `args` element, so the path is portable across any clone
location and across macOS, Linux, and Windows. The `if` field is the documented
permission-rule conditional; it fails open (runs the hook) on an unparseable
command.

The full wired PreToolUse set is in `.claude/settings.json`: eight Bash guards and
four Write/Edit guards, all in the same exec form, with `"if": "Bash(git commit *)"`
on the commit-scoped ones (verification, visual-evidence, conduct). One entry:

```json
{
  "type": "command",
  "command": "node",
  "args": ["${CLAUDE_PROJECT_DIR}/hooks/hook-integrity-guard.mjs"],
  "timeout": 10
}
```

### The template hooks (wired at install, not in the PreToolUse set)

```yaml
session-save:    PreCompact event    -> a "PreCompact" key (an event hook, no tool matcher)
session-restore: SessionStart event  -> a "SessionStart" key
process-doctrine: SessionStart event -> a "SessionStart" key (advisory; injects the doctrine)
memory-sync:     git post-commit     -> copy hooks/memory-sync.post-commit.sh to
                 .git/hooks/post-commit and chmod +x, or point the harness at it
```

These three depend on the target's events and tooling, so the installer wires them
per repo. They are templates: they fail open and ship with placeholders to fill
(the MemPalace capture command, the run-state snapshot fields).

## Behavior contract

```yaml
input:    Claude Code hook JSON on stdin (tool_name, tool_input, cwd). BOM-stripped.
fail_open: a parse error exits 0 (allow). A hook bug never bricks the workflow.
block:    write the reason to stderr, exit 2. Claude sees the reason and retries.
advise:   write { systemMessage, hookSpecificOutput.additionalContext } to stdout,
          exit 0. The tool proceeds; the note rides along as context.
```

## What blocks versus what advises

```yaml
verification-guard:        block (exit 2) - an unbacked visual/runtime claim in a commit
commit-quality-guard:      block (exit 2) - a bypass of the suite or history surgery
append-only-record-guard:
  empty a record:          block (exit 2)
  shrink a record > 50%:   block (exit 2)
  shrink a record:         advise (exit 0)
persona-conduct-guard:     block (exit 2) - a seated persona crossed its own declared
                           anti-behavior; a no-op (exit 0) when no persona is seated
hook-integrity-guard:      block (exit 2) - disable / move / chmod a hook, or change the hooks path
deletion-guard:            block (exit 2) - rm / del of an append-only record
protected-paths-guard:     block (exit 2) - a destructive op on a protected path
visual-evidence-gate:      block (exit 2) - a commit stages a visual file with no evidence named
conduct-guard:             advise (exit 0) - conduct-drift language in a file or a commit message
drift-guard:               advise from 6, block (exit 2) at 10 consecutive scaffold-only edits
session-save / restore:    no block - snapshot on PreCompact, restore on SessionStart (templates)
memory-sync:               no block - post-commit prose + graph fan-out, resource-guarded (template)
```

The transient runtime-state files the suite reads or writes are all git-ignored:
`.claude/active-persona.json` (the seated persona), `.claude/.drift-count` (the
scaffold counter), `.claude/.session-state` (the saved run note), and
`.claude/.memory-synced-head` (the last captured commit).

The append-only records are the fix log (`docs/fixes/`), the insight log
(`docs/insights/`), and the decision log (`docs/decisions/` or `DECISIONS.md`).
Operational rules can retire when they stop catching issues; the records never
retire, cap, or auto-archive. Removing a record requires an explicit human
decision, never a silent overwrite.

## The seated persona (`.claude/active-persona.json`)

The persona-conduct guard reads the seated persona from `.claude/active-persona.json`,
which Eidolon writes when it seats a persona for a task and clears when it unseats
it. The file carries the persona's id, title, and its two anti-behavior layers
(the shared destructive floor and the persona-specific list). The guard enforces
only the anti-behaviors a single tool action can reveal (a shipped stub, a
destructive op, history surgery, a hook bypass); the process-level ones
(skip-test-first, over-engineer, leave-failing-build) are caught by the
engineering swarm's closeout gate and the cold-context verifier. This file is
transient runtime state and is git-ignored, never committed.
