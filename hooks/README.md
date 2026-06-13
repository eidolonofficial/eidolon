# Eidolon hook suite

Neutral-named governance gates. Advisory hooks inject context; hard blocks exit
non-zero. This is the full suite (design spec section 11), and it enforces the
unified antibehavior catalog (references/antibehavior-catalog.md, section 10).
Each hook reads the Claude Code hook JSON on stdin, fails open on bad input, and
follows the I/O contract proven by the lineage's `uncertainty-guard.mjs`. The
contract itself (stdin parsing, the git-commit detector, the commit-message
extractor, block/advise) lives once, in `hooks/lib.mjs`, so the guards cannot
drift into divergent parsers again.

| Hook | Event | Enforcement |
|---|---|---|
| verification-guard | PreToolUse (Bash, `git commit`) | Blocks a commit message that claims a visual or runtime result works without naming evidence. The most insistent guard. |
| commit-quality-guard | PreToolUse (Bash) | Blocks `--no-verify` (and commit's `-n` short form) on commit and push, a non-lease `--force` push, a `core.hooksPath` override, and `filter-branch` / `filter-repo` history surgery. |
| append-only-record-guard | PreToolUse (Write, Edit) | Advises on a shrinking edit to the fix / insight / decision logs; blocks an emptying or more-than-half-shrinking one (silent deletion). |
| persona-conduct-guard | PreToolUse (Bash, Write, Edit) | When a persona is seated (`.claude/active-persona.json`), blocks an action that crosses that persona's declared anti-behaviors, naming the persona and the line. One carve-out to the consent tier: `irreversible-without-safety-net` ASKS instead of blocking, because the line is conditional (never without the safety nets) and the operator may genuinely hold them; their yes attests the backup, the rollback path, and the post-op verify. A no-op when none seated. Carries the Expediter lock: the Expediter is the controller's persona, and a dispatched subagent seated as it is HARD STOPPED on any action and the seat is automatically deactivated (the guard clears the seat file itself); detection reads the harness `transcript_path`, which places subagent transcripts under a `subagents` directory, and fails open as the main session when the field is absent. |
| hook-integrity-guard | PreToolUse (Bash) | Blocks disabling, moving, or chmod of any hook - or of the hooks directory as a whole - or changing the hooks path. |
| deletion-guard | PreToolUse (Bash) | Walls outright `rm` / `del` of an append-only record (fix / insight / decision log, the root DECISIONS.md). |
| protected-paths-guard | PreToolUse (Bash) | Blocks a destructive op on a protected path (.git, a record, a hook, settings.json, the persona template). |
| visual-evidence-gate | PreToolUse (Bash, `git commit`) | Escalates (ask) a commit that stages a visual file without naming evidence it was looked at - including files staged by the same command (`git add x.png && git commit ...`) and tracked visuals swept in by `commit -a`. The consent tier on purpose: the human being asked is the final eyes, and their yes is the missing evidence. |
| conduct-guard | PreToolUse (Write, Edit, Bash `git commit`) | Advises on conduct-drift language (deferring doable work, stub-instead-of-fix, unverified claim). |
| settings-integrity-guard | PreToolUse (Write, Edit) | Blocks a settings edit that silences the suite from inside: introducing `disableAllHooks: true` into a Claude settings file, or dropping a hook entry that the target's manifest (`.claude/eidolon-manifest.yaml`) lists as wired. The content half of the two-layer floor (see "The two-layer floor" below). |
| advisor-guard | PreToolUse (any tool named like `advisor`) | Forbids a dispatched SUBAGENT from calling an advisor tool: hard block (exit 2) with redirection to its bounded task and the stop-and-report path. The main session passes through untouched; the controller owns judgment routing. Subagent detection mirrors the Expediter lock (`transcript_path` under `subagents`; fails open as main). |
| drift-guard | PreToolUse (Write, Edit) | Counts consecutive scaffold-only edits; advises from 6, blocks at 10; resets on deliverable work. |
| session-save | PreCompact | Saves a run-state note before context is trimmed (template). |
| session-restore | SessionStart | Restores the run-state note (template). |
| process-doctrine | SessionStart | Surfaces the process doctrine (calibrate verification to risk; mind background work) as context. Advisory. |
| seat-surface | SessionStart | Surfaces the seated persona (identity + anchors + enforced anti-behaviors) on every session source, so the agent operates AS the persona instead of only being blocked when it strays. Advisory; pairs with persona-conduct-guard (the teeth). |
| graphify-orient | SessionStart | Surfaces the code graph's god nodes + key hyperedges + freshness (build-commit vs HEAD) every pass. Advisory, read-only. |
| mempalace-orient | SessionStart | Surfaces a seeded prose-memory recall (branch + recent commits) every pass. Advisory, fail-open. Template: fill the wing at install. |
| memory-sync | git post-commit | Fans out a prose-memory capture and a graph update, resource-guarded (shell template). |

## The two-layer floor

Hooks alone have a hole: a single settings edit (`disableAllHooks: true`, or
deleting the wired entries) silences every gate at once. The floor is therefore
two layers, because each does what the other cannot.

**Layer A - permission deny rules** (`.claude/settings.json` `permissions.deny`).
Evaluated by Claude Code's own permission parser, so they hold even with hooks
disabled: deny rules outrank allow at every settings level, and hook decisions
cannot bypass them (verified against the official permissions docs, 2026-06-11).
They match tool + command/path, never file content.

```json
"permissions": {
  "deny": [
    "Bash(git push --force *)",
    "Bash(git push * --force *)",
    "Bash(git push -f *)",
    "Bash(git push * -f *)",
    "Bash(git config*core.hooksPath*)",
    "Bash(git filter-branch *)",
    "Bash(git filter-repo *)",
    "Write(**/.claude/settings.local.json)",
    "Edit(**/.claude/settings.local.json)"
  ]
}
```

Pattern notes, verified by the documented glob semantics rather than assumed: a
space before a trailing `*` enforces a word boundary, so `git push --force *`
matches `git push --force` and `git push --force origin main` but never
`git push --force-with-lease` (which commit-quality-guard deliberately allows);
a bare `*` spans spaces, so `git push * --force *` catches the flag in any later
position. The settings.local.json denials close the unreviewed side door: that
file outranks the project settings and is gitignored, so nothing gets to write
one. Exotic spellings the prefix rules cannot express (`git -C x filter-branch`,
`git -c core.hooksPath=...`) stay covered by the hook layer.

**Layer B - content checks** stay hooks, because "this write introduces
`disableAllHooks: true`" is a content fact no permission rule can see. That is
settings-integrity-guard, including its manifest cross-check (a settings write
that drops a hook the manifest lists as wired is refused; unwiring is an explicit
human decision made by updating the manifest first, in the open).

## Wiring

Verified against the official Claude Code hooks docs
(https://code.claude.com/docs/en/hooks.md, checked 2026-06-08). The exec form
(`command` + `args`) substitutes `${CLAUDE_PROJECT_DIR}` as a plain string into
both `command` and each `args` element, so the path is portable across any clone
location and across macOS, Linux, and Windows. The `if` field is the documented
permission-rule conditional; it fails open (runs the hook) on an unparseable
command.

The wired PreToolUse set in `.claude/settings.json` is three entries: one
dispatcher per matcher plus the advisor ban.

```yaml
Bash:         hooks/guard-bash.mjs    # runs the eight Bash evaluators in the old wired order
Write|Edit:   hooks/guard-write.mjs   # runs the five Write/Edit evaluators in the old wired order
.*advisor.*:  hooks/advisor-guard.mjs # keys on the tool NAME (incl. MCP spellings); stays standalone
```

One spawn per matcher instead of one per guard. Each guard exports a pure
evaluator (`evalX(payload) -> verdict | null`) that the dispatcher imports, and
keeps its own standalone entry point, so the per-guard tests exercise the exact
files and a hand wiring still works. Verdict precedence lives in lib.mjs
`runSuite`: the first block halts the call (order is the old wiring order, so
consolidation never changes which guard speaks first), an ask escalates to the
human, advisories accumulate and ride along together. drift-guard is stateful
(the consecutive-scaffold counter), so it is wired through the dispatcher OR
standalone, never both. One entry:

```json
{
  "type": "command",
  "command": "node",
  "args": ["${CLAUDE_PROJECT_DIR}/hooks/guard-bash.mjs"],
  "timeout": 10
}
```

### The template hooks (wired at install, not in the PreToolUse set)

```yaml
session-save:    PreCompact event    -> a "PreCompact" key (an event hook, no tool matcher)
session-restore: SessionStart event  -> a "SessionStart" key
process-doctrine: SessionStart event -> a "SessionStart" key (advisory; injects the doctrine)
seat-surface:     SessionStart event  -> a "SessionStart" key (advisory; surfaces the seated persona every pass)
graphify-orient:  SessionStart event  -> a "SessionStart" key (advisory; surfaces graph god-nodes + freshness)
mempalace-orient: SessionStart event  -> a "SessionStart" key (advisory; seeded prose-memory recall; fill <WING>)
memory-sync:     git post-commit     -> copy hooks/memory-sync.post-commit.sh to
                 .git/hooks/post-commit and chmod +x, or point the harness at it
```

The pass-start orientation trio (seat-surface, graphify-orient, mempalace-orient) is
the SessionStart RECALL/ORIENT leg that complements Stage 7's dual-capture SYNC: SYNC
writes memory + graph on commit, ORIENT surfaces the persona, the graph, and the prose
memory at the START of every session so work never begins seated-but-invisible or blind
to the codebase it lives in.

These depend on the target's events and tooling, so the installer wires them per repo.
They are templates: they fail open and ship with placeholders to fill (the MemPalace
capture command + wing, the run-state snapshot fields).

## Behavior contract

```yaml
input:    Claude Code hook JSON on stdin (tool_name, tool_input, cwd). BOM-stripped.
fail_open: a parse error exits 0 (allow). A hook bug never bricks the workflow.
block:    write the reason to stderr, exit 2. Claude sees the reason and retries.
ask:      write hookSpecificOutput.permissionDecision "ask" with the reason, exit 0.
          The call neither proceeds nor dies; the human approves or declines with the
          reason in front of them. The consent tier, for actions an operator may
          legitimately have a safety net for.
advise:   write { systemMessage, hookSpecificOutput.additionalContext } to stdout,
          exit 0. The tool proceeds; the note rides along as context.
```

## What blocks versus what advises

```yaml
verification-guard:        block (exit 2) - an unbacked visual/runtime claim in a commit
commit-quality-guard:      block (exit 2) - a bypass of the suite (--no-verify / -n on
                           commit or push, a non-lease force push, a hooksPath override)
                           or history surgery. Flags are read with the -m message spans
                           stripped, so quoting a flag in a message never trips it.
append-only-record-guard:
  empty a record:          block (exit 2)
  shrink a record > 50%:   block (exit 2)
  shrink a record:         advise (exit 0)
persona-conduct-guard:     block (exit 2) - a seated persona crossed its own declared
                           anti-behavior, or was seated with anti-behaviors but no
                           framework anchor (no anchor, no seat); a no-op (exit 0) when
                           no persona is seated or the seat declares no anti-behaviors.
                           Exception: irreversible-without-safety-net ASKS (consent
                           tier) - the operator's yes attests the safety nets the
                           guard cannot see
hook-integrity-guard:      block (exit 2) - disable / move / chmod a hook, or change the hooks path
deletion-guard:            block (exit 2) - rm / del of an append-only record
protected-paths-guard:     block (exit 2) - a destructive op on a protected path
visual-evidence-gate:      ask (consent tier) - a commit stages a visual file with no
                           evidence named; the human approving IS the final eyes
conduct-guard:             advise (exit 0) - conduct-drift language in a file or a commit message
settings-integrity-guard:  block (exit 2) - a settings edit that introduces disableAllHooks:true
                           or drops a manifest-wired hook entry
drift-guard:               advise from 6, block (exit 2) at 10 consecutive scaffold-only edits
session-save / restore:    no block - snapshot on PreCompact, restore on SessionStart (templates)
seat-surface / graphify-orient / mempalace-orient:
                           no block - SessionStart orientation surfaces (persona seat, graph
                           god-nodes, prose-memory recall); advisory, fail-open (templates)
memory-sync:               no block - post-commit prose + graph fan-out, resource-guarded (template)
```

## Tests

The suite is tested at two levels, both with `node:test`:

```
node --test 'hooks/*.test.mjs'
```

`hooks.test.mjs` exercises every guard as Claude Code does - a child process, the
hook JSON on stdin - and asserts the exit code and the block/advise output, in
throwaway temp dirs (and a throwaway git repo for the visual-evidence gate).
`persona-conduct-guard.test.mjs` unit-tests the seat-boundary anchor gate through
the module's exported functions.

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
it. The file carries the persona's id, title, its framework anchors, and its two
anti-behavior layers (the shared destructive floor and the persona-specific list). The guard enforces
only the anti-behaviors a single tool action can reveal (a shipped stub, a
destructive op, history surgery, a hook bypass); the process-level ones
(skip-test-first, over-engineer, leave-failing-build) are caught by the
engineering swarm's closeout gate and the cold-context verifier.

Before any of that, the guard enforces the anti-synthetic rail at the seat boundary: a
persona seated with anti-behaviors but no framework anchor is the synthetic persona the
rail forbids, so the guard blocks every governed action until the seat is anchored or
unseated (no anchor, no seat). The anchor is also enforced on persona definition files
(scripts/persona-lint.mjs) and at hire time; this gate closes the seat boundary so the
rail holds there too. This file is transient runtime state and is git-ignored, never
committed.
