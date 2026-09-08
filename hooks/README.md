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
| append-only-record-guard | PreToolUse (Write, Edit) | Advises on a shrinking edit to the fix / insight / decision logs; blocks an emptying. The >50%-shrink block is Write-only; an Edit that shrinks short of emptying advises, not blocks. |
| persona-conduct-guard | PreToolUse (Bash, Write, Edit) | When a persona is seated (`.claude/active-persona.json`), blocks an action that crosses that persona's declared anti-behaviors, naming the persona and the line. One carve-out to the consent tier: `irreversible-without-safety-net` ASKS instead of blocking, because the line is conditional (never without the safety nets) and the operator may genuinely hold them; their yes attests the backup, the rollback path, and the post-op verify. A no-op when none seated. Carries the Expediter lock: the Expediter is the controller's persona, and a dispatched subagent seated as it is HARD STOPPED on any action and the seat is automatically deactivated (the guard clears the seat file itself); detection reads the harness `transcript_path`, which places subagent transcripts under a `subagents` directory, and fails open as the main session when the field is absent. |
| hook-integrity-guard | PreToolUse (Bash) | Blocks moving/deleting (`rm`, `rmdir`, `del`, `Remove-Item`) or `chmod` of any hook or the hooks directory, or a `hooksPath` change. Disable-by-deletion fires the rm/mv check; `chmod -x` fires the chmod check (two sub-checks). |
| deletion-guard | PreToolUse (Bash) | Walls outright deletion (`rm`, `rmdir`, `del`, `Remove-Item`, `shred`, `unlink`) of an append-only record (fix / insight / decision log, root `DECISIONS.md` or `DECISION.md`). |
| protected-paths-guard | PreToolUse (Bash) | Blocks a destructive op (`rm`/`rmdir`/`del`/`Remove-Item`/`truncate`/`shred`/`unlink`) on a protected path (.git, a record, a hook, settings.json, the persona template). `truncate` is caught here but not by deletion-guard; the two overlap on records (defense-in-depth). |
| visual-evidence-gate | PreToolUse (Bash, `git commit`) | Escalates (ask) a commit that stages a visual file (png/jpg/gif/webp/svg/mp4/mov/webm/pdf) without naming evidence - including files staged in the same command (`git add x.png && git commit ...`) and tracked visuals swept in by standalone `commit -a`/`--all` (combined `-am` is not caught by the -a sweep). Evidence phrases that pass: screenshot, looked at it, viewed it, verified visually, `see <file>`, `evidence:`, user confirmed/approved/saw. Consent tier: the human approving IS the final eyes. |
| conduct-guard | PreToolUse (Write, Edit, Bash `git commit`) | Advises on conduct-drift language (deferring doable work, stub-instead-of-fix, unverified claim). Silent no-op on hook files, the antibehavior-catalog, persona templates + definitions, CLAUDE.md, and READMEs (so the phrase list never flags itself). |
| settings-integrity-guard | PreToolUse (Write, Edit) | Blocks a settings edit that silences the suite from inside: introducing `disableAllHooks: true` into a Claude settings file, or dropping a hook entry that the target's manifest (`.claude/eidolon-manifest.yaml`) lists as wired. The content half of the two-layer floor (see "The two-layer floor" below). |
| advisor-guard | PreToolUse (any tool named like `advisor`) | Forbids a dispatched SUBAGENT from calling an advisor tool: hard block (exit 2) with redirection to its bounded task and the stop-and-report path. The main session passes through untouched; the controller owns judgment routing. Subagent detection mirrors the Expediter lock (`transcript_path` under `subagents`; fails open as main). |
| dispatch-attestation-guard | PreToolUse (the dispatch tool, `Task`) | The consent-tier security-awareness gate: when a dispatch is destructive or sensitive (security/trust-safety swarm, deploy, migration, prod, PII, payments, credentials, destructive verbs) AND no VALID signed attestation is in effect (`.claude/security-attestation.json`, verified against the trusted grader key at `.claude/security-grader-public.pem` over `references/security-policy.md`), it ASKS the human. Stands alone on the dispatch-tool matcher, like advisor-guard. Never hard-blocks; a non-sensitive dispatch or an unrecognized tool fails open to allow. Adapted from slartz/agent-security-awareness-training (MIT). |
| evolve-engine-guard | PreToolUse (Bash) | The consent-tier gate for the evolve mode (`references/evolve-engine.md`): a command that flips the vendored ASI-Evolve engine's preflight to confirmed (`evolve-brief normalize ... --confirmed true`) ASKS the human, because that flip unlocks the engine's mutate/evaluate round loop on a real compute budget. One ask per run; drafting commands (no flip) and per-round commands pass. Rides the guard-bash dispatcher (no own matcher); never hard-blocks. |
| drift-guard | PreToolUse (Write, Edit) | Counts consecutive scaffold-only edits; advises from 6, blocks at 10; resets on deliverable work. |
| session-save | PreCompact | Saves a run-state note before context is trimmed (template). |
| session-restore | SessionStart | Restores the run-state note (template). |
| process-doctrine | SessionStart | Surfaces the process doctrine (calibrate verification to risk; mind background work) as context. The text is hardcoded inline in the script, not read from references/process-doctrine.md at runtime. Advisory. |
| seat-surface | SessionStart | Surfaces the seated persona (identity + anchors + enforced anti-behaviors) on every session source, so the agent operates AS the persona instead of only being blocked when it strays. Source-aware: on source=compact it directs continue-in-flight; on other sources it surfaces the ask-first gates. Advisory; pairs with persona-conduct-guard (the teeth). |
| security-surface | SessionStart | Surfaces the security policy (`references/security-policy.md`) hash and the attestation status every pass, so a session knows the posture before it meets the dispatch gate. Advisory, fail-open; pairs with dispatch-attestation-guard (the consent gate). Non-cryptographic status (presence + result + policy-freshness); the gate does the real verify. |
| codebase-memory-orient | SessionStart | PRIMARY structural surface: sources god nodes (hotspots by fan-in) + layers + entry points from the codebase-memory-mcp index (`cli get_architecture`) when configured (`.claude/codebase-memory.json` `{project,exe}`), and writes a per-session sentinel so graphify-orient stays silent. Advisory, fail-open (no config/binary/index -> silent, graphify falls back). Template: fill `<WING>` in its gate block. |
| graphify-orient | SessionStart | The automatic FALLBACK to codebase-memory-orient: surfaces the code graph's god nodes (capped 12 lines) + key hyperedges (capped 16) + freshness (a prefix comparison of the built-from commit vs HEAD) ONLY when the primary produced nothing this session (its per-session sentinel is absent). Advisory, read-only. |
| mempalace-orient | SessionStart | Surfaces a seeded prose-memory recall (seed = branch + last-2 commit subjects, <=200 chars) every pass; 12s timeout, output capped 1600 chars, an error-string guard suppresses a broken index. Advisory, fail-open. Template: fill `<WING>` at install (unfilled -> runs without --wing, returns global results). |
| orient-gate | PreToolUse (Write/Edit, Task) + PostToolUse (Read/Bash/Skill sensor) | Blocks an agent dispatch or a source-code edit until BOTH the code graph (graphify) and cross-session memory (mempalace) have been ACTIVELY read this session - a Read of `graphify-out/GRAPH_REPORT.md` or a `graphify query`/`path`/`explain`, and a `mempalace search`. The PostToolUse sensor (`orient-gate-sensor.mjs`) records the reads into a per-session sentinel (`.claude/.orient-gate.<sessionId>.json`, anchored at the git repo root) -- one file per session, so concurrent sessions in the same repo never clobber each other's orientation; a new session re-orients. The teeth for the orient trio: graphify-orient + mempalace-orient SURFACE the graph and memory every session; this ENFORCES the read before code or a dispatch. Reads, non-source edits, docs/mockups/.claude/build edits, and markdown/config are never gated; fail-open on a missing session id or unreadable sentinel. Template: the source-code definition is by file extension outside docs/build/governance dirs, and the block message fills `<WING>` like mempalace-orient; a repo may narrow the source definition to its own code roots. |
| memory-sync | git post-commit | Fans out a graphify update immediately (if on PATH), a codebase-memory-mcp reindex (if `.claude/codebase-memory.json` is present + the binary is on PATH; persistence:false), and a prose capture once the `<CAPTURE_CMD>`/`<WING>` placeholder is filled (commented out until then); dedup-guarded against double-fire via a sentinel + atomic mkdir lock (shell template). |

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

The wired PreToolUse set in `.claude/settings.json` is four entries: one
dispatcher per matcher, the advisor ban, and the dispatch-attestation gate.

```yaml
Bash:         hooks/guard-bash.mjs                # runs the nine Bash evaluators (the eight old wired guards + the evolve-engine consent gate) in the old wired order
Write|Edit:   hooks/guard-write.mjs               # runs the five Write/Edit evaluators in the old wired order
.*advisor.*:  hooks/advisor-guard.mjs             # keys on the tool NAME (incl. MCP spellings); stays standalone
Task:         hooks/dispatch-attestation-guard.mjs # keys on the dispatch tool; the consent gate; stays standalone
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
security-surface: SessionStart event  -> a "SessionStart" key (advisory; surfaces the security policy hash + attestation status)
codebase-memory-orient: SessionStart event -> a "SessionStart" key (advisory; PRIMARY structural surface from the codebase-memory-mcp index; reads .claude/codebase-memory.json; fill <WING> in its gate block)
graphify-orient:  SessionStart event  -> a "SessionStart" key (advisory; FALLBACK structural surface; surfaces graph god-nodes + freshness only when the primary produced nothing)
mempalace-orient: SessionStart event  -> a "SessionStart" key (advisory; seeded prose-memory recall; fill <WING>)
orient-gate:      PreToolUse(Write|Edit + Task) gate + PostToolUse(Read|Bash|Skill) sensor -> orient-gate.mjs
                  on the edit + dispatch matchers (standalone, like dispatch-attestation-guard) and
                  orient-gate-sensor.mjs on the read matcher; the teeth for the orient trio. Fill <WING>
                  in the block message; per-session sentinels .claude/.orient-gate.<sessionId>.json (git-root anchored) are gitignored
memory-sync:     git post-commit     -> run scripts/inspect-git-hooks.mjs <repo> first;
                 after approval, install hooks/memory-sync.post-commit.sh at its
                 effective postCommit.path and chmod +x; preserve existing dispatchers.
                 Never fall back to a superseded .git/hooks. Path/presence checks
                 need independent cascade evidence (references/git-hooks-path.md).
```

The pass-start orientation set (seat-surface, codebase-memory-orient + graphify-orient,
mempalace-orient) is the SessionStart RECALL/ORIENT leg that complements Stage 7's
dual-capture SYNC: SYNC writes memory + graph on commit, ORIENT surfaces the persona, the
structural graph, and the prose memory at the START of every session so work never begins
seated-but-invisible or blind to the codebase it lives in. The structural surface is a
PRIMARY + FALLBACK pair: codebase-memory-orient (from the codebase-memory-mcp index) is
primary, and graphify-orient falls back automatically when the primary produced nothing
this session (a per-session sentinel arbitrates). orient-gate is the teeth for that
surface: surfacing the graph and memory does not make a session READ them, so the gate
blocks an agent dispatch or a source-code edit until both have actually been read this
session (recorded by its PostToolUse sensor) -- a codebase-memory cli/MCP query OR a
graphify read satisfies the structural half. Surface offers; gate enforces -- the same
pairing as seat-surface (surface) with persona-conduct-guard (teeth).

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
  Write, empty a record:        block (exit 2)
  Write, shrink a record > 50%: block (exit 2)
  Write, shrink a record:       advise (exit 0)
  Edit, delete a span to empty: block (exit 2)
  Edit, shrink a span:          advise (exit 0)   - no >50% threshold on the Edit path
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
dispatch-attestation-guard: ask (consent tier) - a destructive/sensitive dispatch with no valid
                           signed attestation in effect; never a hard block (awareness is a soft layer)
evolve-engine-guard:       ask (consent tier) - the evolve preflight --confirmed true flip that unlocks
                           the vendored engine's mutate/evaluate loop; one ask per run; never a hard block.
                           Note: lib.mjs touchesHookSuite() neutralizes engine/-prefixed path tokens so a
                           routine rm inside engine/asi-evolve or its venv (which carries third-party
                           hooks/ paths) is not read as tampering with the governance suite, while a
                           command that also names a real hook still trips (FIX-2026-06-16)
orient-gate:               block (exit 2) - an agent dispatch or a source-code edit before BOTH
                           graphify and mempalace have been read this session; reads, docs/markdown,
                           and non-source edits pass; fail-open on a missing session id or unreadable
                           sentinel. The teeth for the orient trio (the SessionStart surfaces)
session-save / restore:    no block - snapshot on PreCompact, restore on SessionStart (templates)
seat-surface / security-surface / codebase-memory-orient / graphify-orient / mempalace-orient:
                           no block - SessionStart orientation surfaces (persona seat, the security
                           policy hash + attestation status, the structural graph [codebase-memory-mcp
                           PRIMARY, graphify FALLBACK], prose-memory recall); advisory, fail-open (templates)
memory-sync:               no block - post-commit graph update + prose capture (prose leg commented out
                           until <CAPTURE_CMD>/<WING> is filled); dedup-guarded via a sentinel + atomic
                           mkdir lock (template)
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
scaffold counter), `.claude/.session-state` (the saved run note),
`.claude/.memory-synced-head` (the last captured commit), and
`.claude/.orient-gate.<sessionId>.json` (per-session orientation flags, one file per session).

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
