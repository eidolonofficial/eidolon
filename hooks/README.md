# Eidolon hook suite

The hooks are defense in depth. They are lexical checks on Claude Code tool calls plus a
permission deny floor. They are not an operating-system sandbox, and the list of things they
cannot see is in "Known gaps" below. Each verdict has one of three tiers: block (exit 2, the call
does not run), ask (the human approves or declines, the consent tier) or advise (the call runs and
a note rides along as context).

This file is checked against the code by `node scripts/hooks-readme-check.mjs`. When a hook,
an evaluator or a wiring entry changes, change this file in the same commit; never silence the check.

Shared modules: `lib.mjs`, `operation.mjs`, `shell-operation.mjs`, `confined-path.mjs`, `suite-evaluators.mjs`, `dispatch-evaluators.mjs`, `lanes.mjs`, `policy-manifest.mjs`.

## Wiring

The wired set read from `.claude/settings.json`. An installed project wires the same files from
`.claude/skills/eidolon/hooks/` with `--project ${CLAUDE_PROJECT_DIR}` and a 20 second timeout; this
repository wires them from `hooks/` with a 10 second timeout. The exec form (`command` plus `args`)
substitutes `${CLAUDE_PROJECT_DIR}` into each argument.

| Event | Matcher | File |
|---|---|---|
| PreToolUse | Bash\|PowerShell | hooks/guard-bash.mjs |
| PreToolUse | Write\|Edit | hooks/guard-write.mjs |
| PreToolUse | Agent\|Task | hooks/guard-dispatch.mjs |
| PostToolUse | Write\|Edit | hooks/post-tool-entry.mjs |
| SubagentStart | (empty) | hooks/subagent-start.mjs |
| SubagentStop | (empty) | hooks/subagent-stop.mjs |

One process runs per matcher. Each dispatcher passes the payload through an ordered list of pure
evaluators (`runSuite` in `lib.mjs`). Precedence: the first block halts the call at once, so the
listed order decides which guard speaks first; otherwise every ask is joined into one ask to the
human; otherwise the advisories ride along together. Each guard file also has a standalone entry
point, so a per-guard test runs the exact file. `drift-guard.mjs` keeps a counter, so it is wired
through the dispatcher or standalone, never both. A shell tool call reaches the Bash suite whether the
host names the tool Bash or PowerShell; the evaluators see a normalized `Bash` call with a shell language.

## Evaluators

In the exact order the code runs them. Verdict tiers are as implemented.

### Bash and PowerShell evaluators

Run by `hooks/guard-bash.mjs`, order from `bashEvaluators` in `suite-evaluators.mjs`.

| # | Evaluator | File | Checks | Verdict |
|---|---|---|---|---|
| 1 | `evalManagedState` | policy-manifest.mjs | When `.eidolon/policy-manifest.json` exists, reads `.claude/settings.json` and refuses the call if `disableAllHooks` is true, a managed hook handler (event, matcher, command, args) or managed deny rule is missing, or the manifest or settings are unreadable or invalid. | block |
| 2 | `evalRuntimeIntegrity` | runtime-integrity-guard.mjs | A shell operation that changes an authority path (`.git`, the settings files, `.claude/eidolon-manifest.yaml`, `.eidolon/policy-manifest.json`, `.eidolon/sessions/`, `.claude/skills/eidolon/`) is blocked. An interpreter inline body (`node -e`, `python -c`, `pwsh -Command`, `bash -c`) that names settings, the policy manifest or a hooks path asks. A command the shell parser cannot read asks. Any other internal error blocks. | block, ask |
| 3 | `evalLane` | lanes.mjs | A worker's redirect or write, append or delete verb outside its `write` roots in `.claude/agent-scopes.json`. See "Write lanes". | block |
| 4 | `evalVerification` | verification-guard.mjs | A `git commit` whose message claims a visual or runtime result works ("looks good", "renders correctly", "works in the browser") and names no evidence (a screenshot, an image path, `evidence:`, `verified via`, `signal:`, `proof:`). | block |
| 5 | `evalCommitQuality` | commit-quality-guard.mjs | `--no-verify` (and unambiguous prefixes, and `-n` on commit) on commit or push; an unconditional force push (`--force`, `-f`, a `+` refspec; `--force-with-lease` alone passes); a `core.hooksPath` override through `git -c`, `--config-env`, `GIT_CONFIG_KEY_n` or an inline `GIT_CONFIG_PARAMETERS`; `git config core.hooksPath`; `filter-branch` and `filter-repo`. Message text is not read as flags. | block |
| 6 | `evalPersonaConduct` | persona-conduct-guard.mjs | With a persona seated, an action that crosses one of its declared anti-behaviors. See "The seated persona". `irreversible-without-safety-net` asks; every other line blocks. No seat file is a no-op, except that a worker may never edit the seat file. | block, ask |
| 7 | `evalHookIntegrity` | hook-integrity-guard.mjs | Blocks a `core.hooksPath` change, `chmod` on a hook, and `mv`, `rm`, `rmdir`, `del` or `Remove-Item` of a hook, the hooks directory or an authority path. Any other shell write to a hook file (`cp`, `tee`, a redirect, `sed -i`) asks the controller and blocks a worker. The persona template and `references/security-policy.md` count as hook files here. | block, ask |
| 8 | `evalDeletion` | deletion-guard.mjs | A shell command that deletes or overwrites an append-only record (`docs/fixes/`, `docs/insights/`, `docs/decisions/`, root `DECISIONS.md`). Appends (`>>`, `tee -a`, `Add-Content`) pass. | block |
| 9 | `evalProtectedPaths` | protected-paths-guard.mjs | A delete verb (`rm`, `rmdir`, `del`, `Remove-Item`, `truncate`, `shred`, `unlink`) aimed at `.git`, a record, a hook, `.claude/settings.json` or `references/persona-template.md`. Overlaps the record guards on purpose. | block |
| 10 | `evalVisualEvidence` | visual-evidence-gate.mjs | A `git commit` that stages a visual file (png, jpg, jpeg, gif, webp, svg, mp4, mov, webm, pdf), including one staged in the same command or swept in by `-a`, `--all` or `-am`, with a message that names no evidence (screenshot, looked at it, viewed it, verified visually, `see <image>`, `evidence:`, user confirmed, approved or saw). | ask |

### Write and Edit evaluators

Run by `hooks/guard-write.mjs`, order from `writeEvaluators` in `suite-evaluators.mjs`. A Write or Edit aimed outside the project root is not judged.

| # | Evaluator | File | Checks | Verdict |
|---|---|---|---|---|
| 1 | `evalManagedState` | policy-manifest.mjs | Same check as in the Bash suite. | block |
| 2 | `evalRuntimeIntegrity` | runtime-integrity-guard.mjs | Blocks a write to `.claude/skills/eidolon/`, `.eidolon/policy-manifest.json`, `.eidolon/sessions/` or `.claude/eidolon-manifest.yaml`. Then applies the hook-file check of `evalHookIntegrity` to the write: a Write or Edit under `hooks/`, `.git/hooks/` or any directory named `hooks` that holds a wired guard asks the controller and blocks a worker. | block, ask |
| 3 | `evalLane` | lanes.mjs | A worker's Write or Edit outside its `write` roots. | block |
| 4 | `evalAppendOnlyRecord` | append-only-record-guard.mjs | A Write or Edit to a record (`docs/fixes/`, `docs/insights/`, `docs/decisions/`, root `DECISIONS.md`) whose result is not the existing bytes plus an append. A record that does not exist yet may be created. A result that cannot be validated blocks. | block |
| 5 | `evalPersonaConduct` | persona-conduct-guard.mjs | Same check as in the Bash suite. | block, ask |
| 6 | `evalDrift` | drift-guard.mjs | Consecutive scaffold writes (`hooks/`, `.claude/`, `scripts/`, `.github/`, Dockerfile, Makefile, `.gitignore`, yaml, toml, ini, cfg, `*.config.js` and `*.config.ts`). Advises from a projected count of 6; blocks at 10 unless the policy manifest sets `workType` to `infrastructure` (then it only advises). Any other write resets the count. The count advances only after a successful write (PostToolUse). | advise, block |
| 7 | `evalSettingsIntegrity` | settings-integrity-guard.mjs | A write to `.claude/settings.json` or `.claude/settings.local.json` whose result sets `disableAllHooks` to anything but false, drops a managed hook handler or deny rule, drops an existing handler or deny rule when no manifest lists the file, or cannot be validated. | block |

### Dispatch evaluators

Run by `hooks/guard-dispatch.mjs` on the `Agent` and `Task` tools, in the order of its `runSuite` call. If the runtime cannot load, the dispatch is blocked.

| # | Evaluator | File | Checks | Verdict |
|---|---|---|---|---|
| 1 | `evalManagedState` | policy-manifest.mjs | Same check as in the Bash suite. | block |
| 2 | `evalSensitiveDispatch` | guard-dispatch.mjs | The dispatch text (description, prompt, message, agent type, task) matches a sensitive keyword: security, trust safety, red or blue team, deploy, release, publish, rollout, production, migrat, personal data, payment, cardholder, credential, secret, destructive, truncate, irreversible, force push. See "Known gaps" for the entries that do not match. | ask |
| 3 | `evalWorkerRecursion` | dispatch-evaluators.mjs | A worker (an event with `agent_id`, or a transcript under a `subagents` directory) that dispatches. | block |
| 4 | `evalBriefGate` | dispatch-evaluators.mjs | A write-capable dispatch whose prompt names no done-check (done-check, done when, acceptance, exits 0, must pass, verify by, `evidence:`). Write-capable means an `agent-scopes.json` entry with a non-empty `write` list, or, with no entry, any agent type other than explore, plan, or a name containing investigator or reviewer (no agent type counts as write-capable). A payload with no prompt is not judged. | ask |
| 5 | `evalWavePlan` | dispatch-evaluators.mjs | A write-capable dispatch when no `.md` file in `.claude/waves/` is newer than the session start (the transcript's creation time; 24 hours back when it cannot be read). | ask |
| 6 | `evalDispatchLog` | dispatch-evaluators.mjs | Nothing is refused. Appends one line per dispatch to `.claude/.dispatch-log.jsonl`: time, session, agent type, model, effort, description, persona, write roots and a SHA-256 of the prompt. A dispatch blocked by an earlier evaluator is not logged. A log failure never fails the hook. | none |

## Write lanes

```yaml
# why: a worker that can write anywhere can undo the controller's gates; a lane limits it to its own subtree
file:        .claude/agent-scopes.json
shape:       { "<agent-type>": { "read": ["<root>"], "write": ["<root>"] } }
roots:       prefixes relative to the project root; "src/**" and "docs/" mean a subtree, "hooks/x.mjs" one file
applies_to:  workers only. The controller is never gated.
lane_is_set: only when the worker's PreToolUse input carries a string agent_type that has an entry; an agent
             with no entry, and a worker whose input has no agent_type, are unconstrained
unverified:  agent_type arrival on a worker's PreToolUse is unverified until a live run with EIDOLON_HOOK_DEBUG=1
             (it appends the key names of each hook input, never the values, to .claude/.hook-debug.jsonl)
no_entry_write_list: an entry with no write list means the worker may write nothing
shell:       redirects and the verbs the path parser knows (rm, mv, cp, tee, sed -i, Set-Content and kin)
```

The same file decides whether a dispatch is write-capable (`evalBriefGate`, `evalWavePlan`). A reviewer gets an empty `write` list.

## Subagent and post-tool hooks

All three are advisory (they never block a tool call) and exit 0 on bad input.

| Hook | Event | Behavior |
|---|---|---|
| subagent-start.mjs | SubagentStart | Hands the worker its lane (read and write roots), the Brief contract summary and its latest dispatch record from the log, as additional context. |
| subagent-stop.mjs | SubagentStop | Logs an outcome line (agent, whether evidence was found). When the last message contains no evidence token (the word evidence, a path-like `a/b` token, or a backticked span) it sends the worker back once with a reason; after that it lets it stop. The check is lexical. |
| post-tool-entry.mjs | PostToolUse (Write, Edit) | Advances the drift counter after a successful write, once per tool call id. On a bookkeeping failure it prints a system message and claims nothing. |

## The seated persona

`persona-conduct-guard.mjs` reads the controller's seat from `.claude/active-persona.json` (or an actor-scoped
state file under `.eidolon/sessions/`). The seat carries the persona id, title, anchors and two anti-behavior
layers. The guard enforces only the anti-behaviors one tool call can reveal.

```yaml
# why: the seat is where the persona's own rules become checks; the rest are caught by closeout gates
block:  (anti-behavior lines only when the seat declares them)
        no framework anchor on a seat that declares anti-behaviors (no anchor, no seat)
        a dispatched worker seated as the Expediter (controller-only persona); the controller seat is retained
        a worker editing the controller seat file
        unreadable or invalid seat state or anti-behavior schema
        disable-or-route-around-hook, rewrite-history-to-dodge-gate, ship-stub-as-done
ask:    irreversible-without-safety-net (rm -rf, DROP TABLE, TRUNCATE TABLE, del /f, git push --force); the human's yes
        attests the backup, the rollback path and the post-op verify
caught_elsewhere: skip-test-first, over-engineer, leave-failing-build (the engineering swarm closeout gate and the cold verifier)
```

## Template hooks

Not in this repository's `.claude/settings.json` and not wired by the installer. Setup wires each into a
target when its tool is present. All are advisory and fail open.

| Hook | Event | Behavior |
|---|---|---|
| session-save.mjs | PreCompact | Saves a run-state note (HEAD, branch, recent commits, tree summary) to `.claude/.session-state` before context is trimmed. |
| session-restore.mjs | SessionStart | Restores that note as context, framed as a hypothesis and flagged when stale. |
| seat-surface.mjs | SessionStart | Surfaces the seated persona, its anchors and enforced anti-behaviors on every session source. |
| codebase-memory-orient.mjs | SessionStart | Primary structural orientation from the codebase-memory-mcp index, when `.claude/codebase-memory.json` configures it. |
| graphify-orient.mjs | SessionStart | Fallback: surfaces the Graphify report only when the primary produced nothing this session. |
| mempalace-orient.mjs | SessionStart | Seeded prose-memory recall; silent when the store is absent or slow. |
| memory-sync.post-commit.sh | git post-commit | Graph update, optional codebase-memory reindex and prose capture after each commit, with a sentinel and an atomic lock against a double fire. Install it at the effective hooks path found by `scripts/inspect-git-hooks.mjs` (references/git-hooks-path.md). |

## The two-layer floor

Hooks alone have a hole: one settings edit can silence every gate. The floor is two layers.

**Layer A, permission deny rules** (`permissions.deny`). Claude Code's own permission parser evaluates
them, so they hold when hooks are disabled. They match tool and command or path, never file content.

```json
"permissions": {
  "deny": [
    "Bash(git push --force *)",
    "PowerShell(git push --force *)",
    "Bash(git push * --force *)",
    "PowerShell(git push * --force *)",
    "Bash(git push -f *)",
    "PowerShell(git push -f *)",
    "Bash(git push * -f *)",
    "PowerShell(git push * -f *)",
    "Bash(git config*core.hooksPath*)",
    "PowerShell(git config*core.hooksPath*)",
    "Bash(git filter-branch *)",
    "PowerShell(git filter-branch *)",
    "Bash(git filter-repo *)",
    "PowerShell(git filter-repo *)",
    "Write(**/.claude/settings.local.json)",
    "Edit(**/.claude/settings.local.json)"
  ]
}
```

The installer adds, for a project, Write and Edit denials on `**/.claude/skills/eidolon/**`,
`**/.eidolon/policy-manifest.json`, `**/.eidolon/sessions/**` and `**/.claude/eidolon-manifest.yaml`.
A space before a trailing `*` enforces a word boundary, so `git push --force *` never matches
`git push --force-with-lease`. Spellings a prefix rule cannot express (`git -C x filter-branch`,
`git -c core.hooksPath=...`) are left to the hook layer.

**Layer B, content checks** stay hooks, because "this write introduces `disableAllHooks: true`" is a
fact about content that no permission rule can see. That is `evalSettingsIntegrity` and `evalManagedState`.

## Behavior contract

```yaml
# why: the contract lib.mjs implements, so a guard author and a reader agree on what each exit means
input:        Claude Code hook JSON on stdin, BOM stripped, at most 5 MiB; tool_input must be an object
bad_input:    an enforcement hook (guard-bash, guard-write, guard-dispatch) that cannot parse or
              normalize its input writes a notice and exits 2 (blocks); an advisory hook exits 0
bad_command:  a shell command the parser cannot read is an ask from evalRuntimeIntegrity; the evaluators
              that parse the command skip it, so the human decides
runtime_load: if a dispatcher cannot import its modules it exits 2 (blocks)
block:        reason on stderr, exit 2; Claude sees it and retries
ask:          hookSpecificOutput.permissionDecision "ask" with the reason, exit 0
advise:       { systemMessage, hookSpecificOutput.additionalContext } on stdout, exit 0
missing_hook: a hook script that is missing, or that crashes with exit 1, does not block the call
              (Claude Code treats it as a non-blocking error); see references/current-platform-contract.md
```

## Known gaps

Labeled as defense in depth: these are the shapes the lexical checks and the deny floor do not cover.

```yaml
# why: a guard that claims more than it does is worse than none; this is the honest list
shell_bodies:      "bash -c" and "sh -c" bodies are not parsed recursively; only an authority path named in
                   an interpreter inline body asks
powershell_env:    $env:GIT_CONFIG_PARAMETERS set in PowerShell is not tracked (only the inline and exported forms)
encoded_commands:  -EncodedCommand bodies are not decoded
git_aliases:       aliases defined in .git/config are not visible to the Git parser
subshells:         (cd x; rm y) is not followed
interpreter_code:  a script run by node, python or another interpreter does what it does; its body is opaque
outside_root:      a Write or Edit aimed outside the project root is not judged by any evaluator
lanes:             a worker without an agent_type, or an agent without an entry, has no lane
dispatch_keywords: in guard-dispatch.mjs the sensitive-keyword entries written with \b or \s inside ordinary
                   string literals (prod, pii, pci, token, key, .env, rm -rf, drop table, delete, wipe, destroy)
                   never match; this is a defect in the code and not a feature
os_sandbox:        the hooks are not an operating-system sandbox
fail_open:         a hook that is missing, or that crashes with exit 1, does not block the call
```

## Tests

```
node --test "hooks/*.test.mjs"
```

`hooks.test.mjs` runs each guard as Claude Code does, as a child process with the hook JSON on stdin, in
throwaway directories. The other `*.test.mjs` files cover the dispatch gate, the persona guard, path spellings,
the native pipeline hooks and the 2026-10-13 reds. The installer adds the transient state to `.gitignore`: `.eidolon/sessions/`,
`.claude/.drift-count`, `.claude/.session-state`, `.claude/.dispatch-log.jsonl`, `.claude/.hook-debug.jsonl`
and `.claude/waves/`.

The append-only records are the fix log (`docs/fixes/`), the insight log (`docs/insights/`) and the decision
log (`docs/decisions/` or `DECISIONS.md`). They never retire, cap or auto-archive; removing one is an explicit
human decision, never a command.
