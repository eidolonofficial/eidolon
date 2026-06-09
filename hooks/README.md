# Eidolon hook suite

Neutral-named governance gates. Advisory hooks inject context; hard blocks exit
non-zero. This is the minimal v1 set; the full suite is in the design spec
section 11. Each hook reads the Claude Code hook JSON on stdin, fails open on bad
input, and follows the I/O contract proven by the lineage's `uncertainty-guard.mjs`.

| Hook | Event | Enforcement |
|---|---|---|
| verification-guard | PreToolUse (Bash, `git commit`) | Blocks a commit message that claims a visual or runtime result works without naming evidence. The most insistent guard. |
| commit-quality-guard | PreToolUse (Bash) | Blocks `--no-verify`, a non-lease `--force` push, `core.hooksPath` override, and `filter-branch` / `filter-repo` history surgery. |
| append-only-record-guard | PreToolUse (Write, Edit) | Advises on a shrinking edit to the fix / insight / decision logs; blocks an emptying one (silent deletion). |

## Wiring

Verified against the official Claude Code hooks docs
(https://code.claude.com/docs/en/hooks.md, checked 2026-06-08). The exec form
(`command` + `args`) substitutes `${CLAUDE_PROJECT_DIR}` as a plain string into
both `command` and each `args` element, so the path is portable across any clone
location and across macOS, Linux, and Windows. The `if` field is the documented
permission-rule conditional; it fails open (runs the hook) on an unparseable
command.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/hooks/verification-guard.mjs"],
            "if": "Bash(git commit *)",
            "timeout": 10
          },
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/hooks/commit-quality-guard.mjs"],
            "timeout": 10
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/hooks/append-only-record-guard.mjs"],
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

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
```

The append-only records are the fix log (`docs/fixes/`), the insight log
(`docs/insights/`), and the decision log (`docs/decisions/` or `DECISIONS.md`).
Operational rules can retire when they stop catching issues; the records never
retire, cap, or auto-archive. Removing a record requires an explicit human
decision, never a silent overwrite.
