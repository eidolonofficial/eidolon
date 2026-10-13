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

The wired set read from `.claude/settings.json`. Every entry passes `--project ${CLAUDE_PROJECT_DIR}`
after the script path, which pins the policy root to the project instead of the event's working
directory. An installed project wires the same files from `.claude/skills/eidolon/hooks/` with a 20
second timeout; this repository wires them from `hooks/` with a 10 second timeout. The exec form
(`command` plus `args`) substitutes `${CLAUDE_PROJECT_DIR}` into each argument.

| Event | Matcher | File | Project arg |
|---|---|---|---|
| PreToolUse | Bash\|PowerShell | hooks/guard-bash.mjs | --project ${CLAUDE_PROJECT_DIR} |
| PreToolUse | Write\|Edit | hooks/guard-write.mjs | --project ${CLAUDE_PROJECT_DIR} |
| PreToolUse | Agent\|Task | hooks/guard-dispatch.mjs | --project ${CLAUDE_PROJECT_DIR} |
| PostToolUse | Write\|Edit | hooks/post-tool-entry.mjs | --project ${CLAUDE_PROJECT_DIR} |
| SubagentStart | (empty) | hooks/subagent-start.mjs | --project ${CLAUDE_PROJECT_DIR} |
| SubagentStop | (empty) | hooks/subagent-stop.mjs | --project ${CLAUDE_PROJECT_DIR} |

One entry, as written in `.claude/settings.json`:

```json
{
  "matcher": "Bash|PowerShell",
  "hooks": [{
    "type": "command",
    "command": "node",
    "args": ["${CLAUDE_PROJECT_DIR}/hooks/guard-bash.mjs", "--project", "${CLAUDE_PROJECT_DIR}"],
    "timeout": 10
  }]
}
```

One process runs per matcher. Each dispatcher passes the payload through an ordered list of pure
evaluators (`runSuite` in `lib.mjs`). Precedence: the first block halts the call at once, so the
listed order decides which guard speaks first; otherwise every ask is joined into one ask to the
human; otherwise the advisories ride along together. Each guard file also has a standalone entry
point, so a per-guard test runs the exact file. `drift-guard.mjs` keeps a counter, so it is wired
through the dispatcher or standalone, never both. A shell tool call reaches the Bash suite whether the
host names the tool Bash or PowerShell; the evaluators see a normalized `Bash` call with a shell language.

## Evaluators

In the exact order the code runs them. Verdict tiers are as implemented. "What asks" and "What blocks"
below collect the shell cases by tier.

### Bash and PowerShell evaluators

Run by `hooks/guard-bash.mjs`, order from `bashEvaluators` in `suite-evaluators.mjs`.

| # | Evaluator | File | Checks | Verdict |
|---|---|---|---|---|
| 1 | `evalManagedState` | policy-manifest.mjs | When `.eidolon/policy-manifest.json` exists, reads `.claude/settings.json` and refuses the call if `disableAllHooks` is true, a managed hook handler (event, matcher, command, args) or managed deny rule is missing, or the manifest or settings are unreadable or invalid. | block |
| 2 | `evalRuntimeIntegrity` | runtime-integrity-guard.mjs | Blocks a shell operation that changes an authority path (`.git`, a settings file anywhere, `.claude/eidolon-manifest.yaml`, `.eidolon/policy-manifest.json`, `.eidolon/sessions/`, `.claude/skills/eidolon/`); only an operand the command writes, appends to, deletes, re-permissions or links counts, so a read-only source (`cp .claude/settings.json /tmp/x`) passes. Blocks a shell write, append, truncate or delete aimed at a file that has more than one hard link, as it does for Write and Edit. A shell `-c`, `eval` or `iex` body that names nothing protected, holds no variable and nests no other body is parsed one level and judged like top-level commands. Asks for a mutation the parser cannot place (including an extraction, `find -exec` of an unknown verb and `xargs -a` of a mutating verb), a string run as code (`iex`, an encoded PowerShell command, a pipe into a shell), an interpreter body, `eval`, heredoc or substitution that names git, a protected path, `hooks` or `.claude`, a shell body that nests another body or cannot be parsed, `Start-Process` of a shell, and a command it cannot parse; a command it cannot parse whose raw text matches a block net blocks instead. See "What asks". Any other internal error blocks. | block, ask |
| 3 | `evalLane` | lanes.mjs | A worker's redirect or write, append, delete or link outside its `write` roots in `.claude/agent-scopes.json`, a write outside the project root, a path-shaped string literal or a trailing path-like argv operand of an interpreter inline body outside the lane, or a whole-tree git rewrite (`reset --hard`, `checkout <rev>`, `switch`, `merge`, `pull`, `rebase`, `am`, `cherry-pick`, `revert`, `stash`, `read-tree`, `checkout-index`). A worker may write scratch files under the OS temp directory, the literal `/tmp/` prefix, `$TMPDIR`, `$TEMP` and `$TMP`, but every scratch root that contains the project root is dropped, and the variable forms are dropped whenever the project sits inside the OS temp directory or `/tmp`. See "Write lanes". | block |
| 4 | `evalVerification` | verification-guard.mjs | A `git commit` whose message claims a visual or runtime result works ("looks good", "renders correctly", "works in the browser") and names no evidence (a screenshot, an image path, `evidence:`, `verified via`, `signal:`, `proof:`). | block |
| 5 | `evalCommitQuality` | commit-quality-guard.mjs | Reads the parsed argv of each git invocation. Blocks `--no-verify` (and unambiguous prefixes, and `-n` on commit) on commit or push; a force push (`--force`, `--force-if-includes`, `-f`, a `+` refspec; `--force-with-lease` alone passes); a mirror push or `remote.*.mirror` or `remote.*.push` config; `include.path` config; a `core.hooksPath` override through `git -c`, `--config-env`, `GIT_CONFIG_KEY_n`, `GIT_CONFIG_PARAMETERS`, or a swapped `GIT_CONFIG_GLOBAL` or `GIT_CONFIG_SYSTEM`; `git config core.hooksPath`; an alias that runs commit or push with a hook-skipping or force flag; `filter-branch` and `filter-repo`. Blocks a PowerShell command that sets `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_n`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM` or `GIT_DIR` (`$env:`, `Set-Item env:`, `SetEnvironmentVariable`) and also runs git. Asks for a splat or an argument array in place of git arguments, and for a worktree overwrite (`reset --hard`, `--merge`, `--keep`, `checkout-index -f`, `read-tree -u` or `--reset`, `checkout -f`, `switch -f` or `--discard-changes`, `stash -u` or `-a`, `clean -f` with no pathspec). The raw patterns read the command without its commit message. Some cases ask; see "What asks". | block, ask |
| 6 | `evalPersonaConduct` | persona-conduct-guard.mjs | With a persona seated, an action that crosses one of its declared anti-behaviors. See "The seated persona". `irreversible-without-safety-net` asks; every other line blocks. No seat file is a no-op, except that a worker may never edit the seat file. | block, ask |
| 7 | `evalHookIntegrity` | hook-integrity-guard.mjs | Blocks a `core.hooksPath` change, an attribute change (`chmod`, `icacls`, `Set-ItemProperty` and kin) on a hook or authority path, and `mv`, `rm`, `rmdir`, `del`, `Remove-Item`, `Move-Item` or `Rename-Item` of a hook, the hooks directory or an authority path. Any other shell write to a hook file (`cp`, `tee`, a redirect, `sed -i`, `ln`, a hard link to a hook including `cp -l` and `rsync --link-dest`, `touch`) asks the controller and blocks a worker. The persona template and `references/security-policy.md` count as hook files here. | block, ask |
| 8 | `evalDeletion` | deletion-guard.mjs | A shell command that deletes, overwrites or creates over an append-only record (`docs/fixes/`, `docs/insights/`, `docs/decisions/`, root `DECISIONS.md`), or deletes or moves a parent directory that holds one, or makes a hard link to one (`ln`, `cp -l`, `cp --link`, `rsync --link-dest`, `New-Item -ItemType HardLink`). Appends (`>>`, `tee -a`, `Add-Content`) pass. The raw delete pattern reads the command without its commit message. | block |
| 9 | `evalProtectedPaths` | protected-paths-guard.mjs | A delete verb (`rm`, `rmdir`, `del`, `Remove-Item`, `truncate`, `shred`, `unlink`) aimed at `.git`, a record, a hook, `.claude/settings.json` or `references/persona-template.md`. Overlaps the record guards on purpose. | block |
| 10 | `evalVisualEvidence` | visual-evidence-gate.mjs | A `git commit` that stages a visual file (png, jpg, jpeg, gif, webp, svg, mp4, mov, webm, pdf), including one staged in the same command or swept in by `-a`, `--all` or `-am`, with a message that names no evidence (screenshot, looked at it, viewed it, verified visually, `see <image>`, `evidence:`, user confirmed, approved or saw). | ask |

### Write and Edit evaluators

Run by `hooks/guard-write.mjs`, order from `writeEvaluators` in `suite-evaluators.mjs`. A Write or Edit by the controller aimed outside the project root is not judged, except a Claude settings file, which is judged wherever it lives.

| # | Evaluator | File | Checks | Verdict |
|---|---|---|---|---|
| 1 | `evalManagedState` | policy-manifest.mjs | Same check as in the Bash suite. | block |
| 2 | `evalRuntimeIntegrity` | runtime-integrity-guard.mjs | Blocks a write to `.claude/skills/eidolon/`, `.eidolon/policy-manifest.json`, `.eidolon/sessions/` or `.claude/eidolon-manifest.yaml`, and a Write or Edit whose existing target has more than one hard link (it may be another name for a record, a hook or an authority file). Then applies the hook-file check of `evalHookIntegrity` to the write: a Write or Edit under `hooks/`, `.git/hooks/` or any directory named `hooks` that holds a wired guard asks the controller and blocks a worker. | block, ask |
| 3 | `evalLane` | lanes.mjs | A worker's Write or Edit outside its `write` roots, or outside the project root (scratch under the OS temp directory or `/tmp/` excepted unless the project sits inside it, as in the Bash row). | block |
| 4 | `evalAppendOnlyRecord` | append-only-record-guard.mjs | A Write or Edit to a record (`docs/fixes/`, `docs/insights/`, `docs/decisions/`, root `DECISIONS.md`) whose result is not the existing bytes plus an append. A record that does not exist yet may be created. A result that cannot be validated blocks. | block |
| 5 | `evalPersonaConduct` | persona-conduct-guard.mjs | Same check as in the Bash suite. | block, ask |
| 6 | `evalDrift` | drift-guard.mjs | Consecutive scaffold writes (`hooks/`, `.claude/`, `scripts/`, `.github/`, Dockerfile, Makefile, `.gitignore`, yaml, toml, ini, cfg, `*.config.js` and `*.config.ts`). Advises from a projected count of 6; blocks at 10 unless the policy manifest sets `workType` to `infrastructure` (then it only advises). Any other write resets the count. The count advances only after a successful write (PostToolUse). | advise, block |
| 7 | `evalSettingsIntegrity` | settings-integrity-guard.mjs | A write to a `.claude/settings.json` or `.claude/settings.local.json` anywhere, inside or outside the project, whose result sets `disableAllHooks` to anything but false, drops a managed hook handler or deny rule, drops an existing handler or deny rule when no manifest lists the file, or cannot be validated. | block |

### Dispatch evaluators

Run by `hooks/guard-dispatch.mjs` on the `Agent` and `Task` tools, in the order of its `runSuite` call. If the runtime cannot load, the dispatch is blocked.

| # | Evaluator | File | Checks | Verdict |
|---|---|---|---|---|
| 1 | `evalManagedState` | policy-manifest.mjs | Same check as in the Bash suite. | block |
| 2 | `evalSensitiveDispatch` | guard-dispatch.mjs | The dispatch text (description, prompt, message, agent type, task) matches a sensitive keyword: security, trust safety, red or blue team, deploy, release, publish, rollout, production, prod, migrat, pii, personal data, payment, cardholder, pci, credential, secret, token, key or keys, `.env`, destructive, `rm -rf`, drop table or database, truncate, delete, wipe, destroy, irreversible, force push. | ask |
| 3 | `evalWorkerRecursion` | dispatch-evaluators.mjs | A worker (an event with `agent_id`, or a transcript under a `subagents` directory) that dispatches. | block |
| 4 | `evalBriefGate` | dispatch-evaluators.mjs | A write-capable dispatch whose prompt has no line starting with `Done-check:` or `Acceptance:` followed by text (a leading list marker is allowed; the same words in running prose do not count; a value of none, n/a, na, tbd, todo, skip or a dash is a placeholder and counts as missing). Write-capable means an `agent-scopes.json` entry with a non-empty `write` list, or, with no entry, any agent type other than Explore, Plan, cavecrew-investigator or cavecrew-reviewer (a `caveman:` prefix is allowed; no agent type counts as write-capable). A payload with no prompt is not judged. | ask |
| 5 | `evalWavePlan` | dispatch-evaluators.mjs | A write-capable dispatch when no `.md` file in `.claude/waves/` with at least 20 non-blank characters is newer than the session start (the transcript's creation time). With no readable `transcript_path` the plan cannot be matched to the session, so it asks. | ask |
| 6 | `evalModelTier` | dispatch-evaluators.mjs | A dispatch with a prompt that names no model tier: no `model` on the call, no `model:` line in the frontmatter of `.claude/agents/<type>.md` (project first, then the home directory), and not a plugin agent type (one with a `:` in its name, whose definition carries its own model). The tier is a decision (conductor-standard section 4). | ask |
| 7 | `evalDispatchLog` | dispatch-evaluators.mjs | Nothing is refused. Appends one line per dispatch to `.claude/.dispatch-log.jsonl`: time, session, agent type, the tier (the call's model, else the agent file's model line, else `plugin-defined`), effort, description, persona, write roots and a SHA-256 of the prompt. A dispatch blocked by an earlier evaluator is not logged. A log failure never fails the hook. | none |

## What asks

The cases below end in a question to the human, not a refusal. Anything not listed here and not in
"What blocks" passes. Asks from several evaluators are joined into one question, and any block in the
same call wins.

```yaml
# why: an ask is for what the parser cannot place or what a human may legitimately want; each line is a case the code implements
unplaceable_operand:  a mutating op whose operand contains *, ?, [, { or an unexpanded $var and could reach a protected
                      location: its literal prefix is on the path to one, or it starts with $. A cd into a glob followed by a
                      mutation counts. A bare * delete at a directory that holds a protected path blocks instead.
patch_targets:        git apply (unless --check, --stat, --numstat or --summary), and patch with no file operand or with -i or --input
unmodeled_verb:       an unmodeled verb whose arguments name a protected path (docs/decisions, docs/fixes, docs/insights, DECISIONS.md,
                      hooks/, .claude/settings*, .eidolon, .git, the policy manifest): curl -o, Invoke-WebRequest -OutFile, vim, split, csplit,
                      a PowerShell [Type]::Method call, and any unmodeled verb with the word git among its arguments (parallel,
                      watch, fakeroot: an opaque wrapper). A flag value counts too: --output=hooks/x, -sohooks/x, -C docs/decisions
inert_verbs:          never ask: cat, ls, grep, git, node, python, bash, npm, Get-Content and the rest of the inert list in shell-operation.mjs
                      (sort, uniq and tree are not on it: they can write their output file)
opaque_body:          an interpreter inline body (sh, bash or zsh -c, node -e, --eval=, -p, deno eval, python -c, pwsh -Command, cmd /c), an eval
                      or Invoke-Expression body, a heredoc body fed to an interpreter, or a $(...) or backtick body that names git, a
                      protected path, settings, the word hooks or the word .claude. Read-only git
                      subcommands are exempt: status, log, diff, show, rev-parse, rev-list, describe, ls-files, ls-tree, cat-file,
                      blame, shortlog, merge-base. A sh, bash, zsh, dash or ksh -c body, a pwsh or powershell -Command body, a cmd /c body, an
                      eval body and an iex body that names none of those, holds no $ or backtick and nests no other body is not asked about:
                      it is parsed one level and its commands are judged like top-level ones (bash -c "npm test" and sh -c "ls src" pass,
                      bash -c 'rm -rf docs' blocks). A shell body that nests another body or cannot be parsed asks
opaque_execution:     iex and Invoke-Expression; an awk program that calls system(; pwsh or powershell with -EncodedCommand, -enc or -ec;
                      a pipe into a shell or interpreter that reads its program from standard input (| bash, | sh, | node, | python and kin
                      with no script operand); xargs -a FILE (or --arg-file) followed by a mutating verb; Start-Process (or start, saps) of
                      cmd, pwsh, powershell, bash or sh, with or without -FilePath
extraction:           tar -x or --extract, bsdtar -x, gtar, unzip (not -l, -t, -p), 7z x or e, cpio -i: asks unless a destination (-C, -d, -o<dir>)
                      is given and is neither the project root nor an ancestor of a protected location. A destination that is itself
                      protected is judged as a write to it. A worker needs a destination inside its lane
find_exec:            find -exec, -execdir, -ok, -okdir of a verb outside the modeled and inert lists
unparseable:          a command that cannot be parsed and whose raw text matches no block net
commit_quality:       an unknown git global option ahead of the subcommand; git push --delete, -d, or origin :ref; a splat or argument array
                      in place of git arguments (git @a in PowerShell, git "$@", git ${arr[@]}, git $args); git reset --hard, --merge or
                      --keep, git checkout-index -f, git read-tree -u or --reset, git checkout -f or --force (no -- pathspec), git switch -f, --force or
                      --discard-changes, git stash -u, -a, --include-untracked or --all, git clean -f or --force with no pathspec and no
                      -n (they discard uncommitted work; clean with a pathspec is judged by the pathspec)
hook_integrity:       a controller writing a hook file (a worker is blocked)
dispatch:             a write-capable brief with no Done-check: or Acceptance: line, or one whose value is none, n/a, na, tbd, todo, skip or -; no readable transcript_path; a wave plan under 20 non-blank characters;
                      a dispatch that names no model tier (no model on the call, no model line in its .claude/agents file, not a plugin agent)
other_asks:           the evaluator tables above also list the sensitive dispatch, the visual evidence gate and the persona line
                      irreversible-without-safety-net
```

## What blocks

Beyond the single-verb cases in the evaluator tables, the path parser follows `cd`, simple assignments,
wrappers (`env`, `sudo`, `xargs`, `timeout`, `cmd /c`) and the verbs below, then judges where each operand
really points. A protected location is `.git`, the settings files, the Eidolon manifest and sessions, the
installed skill, `hooks/`, the persona template, the security policy and the three records.

```yaml
# why: each line is a shape that once slipped past a single-verb check and is now judged
modeled_verbs:    ln, cp -l, cp --link and rsync --link-dest (a link onto a protected path, or one pointing into it; a hard link to a record or
                  authority path blocks, to a hook it asks the controller), find -delete or -exec/-execdir/-ok/-okdir of rm, mv, cp, chmod,
                  chown, truncate, tee, dd, sed -i, ln, install, touch or a shell (the find roots take a delete or write; when the command is
                  handed the found file {} as its target, a root that holds a protected path, such as docs or the project root, counts as
                  written, so find docs -exec sh -c ': > "$1"' _ {} ; blocks while find . -exec cp {} build/ ; passes), sort -o and --output, uniq with an output operand,
                  tree -o, tar and unzip and 7z and cpio extraction (destination judged as a write), rsync including --delete,
                  New-Item -Force, touch, mkdir, install, Move-Item, Rename-Item, icacls, attrib, Set-ItemProperty, patch with a file operand
git_pathspecs:    git checkout, restore, stash, clean (not -n), reset, rm and mv aimed at a protected path; a magic pathspec (:/, :(top), :!x)
                  counts as the whole tree
parents:          deleting or moving a parent of a protected path (rm -rf docs, mv hooks hooks2, rm -rf .)
bare_glob:        a bare * delete at a directory that holds a protected path
redirects:        >, >>, >| and <> to a protected path
git_config:       a mirror push, a remote.*.mirror or remote.*.push setting, an include.path setting, an alias that skips hooks; in PowerShell,
                  setting GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT, GIT_CONFIG_KEY_n, GIT_CONFIG_GLOBAL, GIT_CONFIG_SYSTEM or GIT_DIR
                  ($env:X = ..., Set-Item env:X, [Environment]::SetEnvironmentVariable) in a command that also runs git
path_spellings:   NTFS alternate data streams (file::$DATA), 8.3 short names (DECISI~1), MSYS /c/ drive paths, symlinks
raw_nets:         a line the tokenizer cannot parse is still matched against raw patterns (a hook-skipping commit, a core.hooksPath
                  override, a delete of .git, hooks, a record or settings) before it downgrades to an ask
workers:          a worker's write outside the project root, in any tool (scratch under the OS temp directory or /tmp/ excepted, each unless the project root sits inside it);
                  a worker's whole-tree git rewrite (reset --hard, --merge, --keep, checkout <rev> with no pathspec, switch, merge, pull,
                  rebase, am, cherry-pick, revert, stash other than list and show, read-tree, checkout-index); a trailing path-like
                  argv operand of an inline interpreter body outside the lane
hard_links:       a Write or Edit, or a shell write, append, truncate or delete (a redirect, tee, sed -i, truncate, rm, Set-Content and kin), whose
                  existing target is a file with more than one hard link (RUNTIME INTEGRITY GUARD); reading it, or copying it elsewhere, passes
command_words:    bash drops an unquoted backslash before an ordinary character in the command word, so g\it and r\m are git and rm;
                  wrappers env -S, timeout -s -k, stdbuf, winpty, flock, ionice, unbuffer and chronic unwrap
commit_messages:  the raw delete, record, hooks-path and chmod patterns read the command without its -m or --message text and the
                  heredoc body of a git commit, so a message that says rm docs/decisions is not a delete
settings:         a settings file anywhere, inside or outside the project, runs through settings-integrity for Write and Edit; a shell command that
                  writes, appends to, deletes, links or re-permissions a .claude/settings.json or .claude/settings.local.json at any path blocks as
                  an authority change (the shell parser does not know the written content); a read-only use of it passes
```

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
no_write_list: an entry with no write list means the worker may write nothing
outside_root: a worker with a lane may not write outside the project root at all
sees:        Write and Edit; redirects and the modeled verbs (rm, mv, cp, ln, touch, mkdir, tee, sed -i, Set-Content, git checkout and kin);
             path-shaped string literals in an interpreter inline body
does_not_see: a script file the worker runs, and a glob or $var operand
```

The same file decides whether a dispatch is write-capable (`evalBriefGate`, `evalWavePlan`). A reviewer gets an empty `write` list.

## Subagent and post-tool hooks

All three are advisory (they never block a tool call) and exit 0 on bad input.

| Hook | Event | Behavior |
|---|---|---|
| subagent-start.mjs | SubagentStart | Hands the worker its lane (read and write roots), the Brief contract summary and its latest dispatch record from the log, as additional context. |
| subagent-stop.mjs | SubagentStop | Logs an outcome line (agent, whether evidence was found). Evidence is a backtick-quoted span, an `Evidence:` line with text (markdown emphasis or a list marker around the label is ignored), or a path under the project root that exists. When the last message has none it sends the worker back once with a reason; after that it lets it stop. This proves the report names something real, not that the done-check passed. |
| post-tool-entry.mjs | PostToolUse (Write, Edit) | Advances the drift counter after a successful write, once per tool call id. On a bookkeeping failure it prints a system message and claims nothing. |

## The seated persona

`persona-conduct-guard.mjs` reads the controller's seat from `.claude/active-persona.json` (or an actor-scoped
state file under `.eidolon/sessions/`). The seat carries the persona id, title, anchors and two anti-behavior
layers. The guard enforces only the anti-behaviors one tool call can reveal. Worker detection is `actorIdentity`
in `operation.mjs`: an event with `agent_id` is a worker, and without one a transcript path under a `subagents`
directory marks a worker.

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
bad_command:  a shell command the parser cannot read is an ask from evalRuntimeIntegrity, unless its raw text
              matches a block net, which blocks; the evaluators that parse the command skip it
runtime_load: if a dispatcher cannot import its modules it exits 2 (blocks)
block:        reason on stderr, exit 2; Claude sees it and retries
ask:          hookSpecificOutput.permissionDecision "ask" with the reason, exit 0
advise:       { systemMessage, hookSpecificOutput.additionalContext } on stdout, exit 0
missing_hook: a hook script that is missing, or that crashes with exit 1, does not block the call; Claude Code shows
              the hook's stderr to the user as a non-blocking error and continues. The onFailure: block setting that
              would turn this into a block needs Claude Code 2.1.295 or newer; see references/current-platform-contract.md
```

## Known gaps

Labeled as defense in depth: these are the shapes the lexical checks and the deny floor do not cover.

```yaml
# why: a guard that claims more than it does is worse than none; this is the honest list
script_files:      a script file a worker runs (node build.js, sh run.sh) does what it does; the guards see only its command line
lane_operands:     a glob or $var operand does not trigger the lane check
shell_bodies:      a shell -c, eval or iex body is parsed one level only when it names nothing protected, holds no $ or backtick and nests no body;
                   otherwise it is asked about only when it names git, a protected path or settings. Bodies of node -e, python -c and other
                   interpreters are never parsed (node -e with rmSync('docs') names no protected child and passes)
git_aliases:       aliases defined in .git/config are not visible to the Git parser
subshells:         a subshell is judged as top-level commands, not as a unit
encoded_commands:  -EncodedCommand bodies are not decoded; the command asks
controller_whole_tree: git checkout <rev>, switch, merge, pull, rebase, am, cherry-pick, revert and a bare git stash stay allowed for the
                   controller (ordinary workflow, and history keeps the prior tree); only the commands that discard uncommitted work ask
                   (reset --hard, checkout -f, switch -f, stash -u or -a, clean -f with no pathspec, and the forms under commit_quality)
hard_link_scope:   the hard-link check runs on a literal operand that exists; a glob or $var operand is not checked, and rm of one name of a
                   hard-linked file refuses too. A hard link made outside the tool calls (a script) is not seen
cp_link_parents:   cp -al or rsync --link-dest of a parent directory (docs, the project root) is not judged as links to the records under it
bash_git_env:      GIT_DIR=... and GIT_CONFIG_COUNT=... without a core.hooksPath key in a bash prefix or export are not blocked; the
                   PowerShell forms are, and only when git runs in the same command (a variable set in an earlier call is not tracked)
ps_call_operator:  & $cmd and other call-operator targets held in a variable are not resolved; & cmd /c ... and & pwsh -Command ... are
                   judged like the same command without the &
archive_contents:  an archive extracted into a destination that is not protected can still hold entries that climb out of it (../x)
scratch_in_tmp:    a worker's scratch roots (the OS temp directory, the literal /tmp/ and the $TMPDIR, $TEMP and $TMP forms) each drop out when the
                   project root sits inside them, and the variable forms drop out when it sits inside the OS temp directory or /tmp, so a project
                   under /tmp gives its worker no scratch space at all
controller_outside_root: the controller's Write or Edit outside the project root is not judged, except a settings file
agent_type:        agent_type on a worker's PreToolUse is unverified until a live run with EIDOLON_HOOK_DEBUG=1
os_sandbox:        the hooks are not an operating-system sandbox
fail_open:         a hook script that is missing, or that crashes with exit 1, does not block the call; the failure is shown to the
                   user as a non-blocking hook error (onFailure: block needs Claude Code 2.1.295 or newer)
```

## Tests

```
node --test "hooks/*.test.mjs"
```

The test files are `hooks.test.mjs` (each guard run as Claude Code does, as a child process with the hook
JSON on stdin, in throwaway directories), `reds-2026-10-13.test.mjs`, `pipeline-2026-10-13.test.mjs`,
`review-2026-10-13.test.mjs`, `review-round2-2026-10-13.test.mjs`, `review-round3-2026-10-13.test.mjs`, `review-round4-2026-10-13.test.mjs`, `review-hardening.test.mjs`, `path-alias.test.mjs`, `guard-dispatch.test.mjs`,
`codebase-memory-orient.test.mjs` and `persona-conduct-guard.test.mjs`. This repository's `.gitignore` lists the
transient state: `.eidolon/sessions/`, `.claude/.dispatch-log.jsonl`, `.claude/.hook-debug.jsonl` and
`.claude/waves/`, with the seat file, `.claude/.session-state` and `.claude/.memory-synced-head`.

The append-only records are the fix log (`docs/fixes/`), the insight log (`docs/insights/`) and the decision
log (`docs/decisions/` or `DECISIONS.md`). They never retire, cap or auto-archive; removing one is an explicit
human decision, never a command.
