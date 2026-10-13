# Eidolon

Eidolon is a Claude Code skill. It sets up a repository for Claude Code, carries a work item from spec to committed change, and guides loops, goals and routines. It asks before any action that installs, deploys, seats an identity or cannot be undone, and it checks its own claims against a second signal.

## Install

Clone into the user skills directory:

```sh
git clone https://github.com/eidolonofficial/eidolon.git ~/.claude/skills/eidolon
```

Or install a tagged bundle through Hearth. Copying the skill does not wire any hooks; a project install does (see "The installer"). Then run `/eidolon` in Claude Code.

## Requirements

Node 22 or newer for the installer and the hooks. Git. Claude Code is the only supported host.

## Modes

| Mode | When | Owning reference |
|---|---|---|
| setup | no work item, or "set up this repo" | `references/setup-workflow.md` |
| build | a work item to build, change or fix | `references/build-pipeline.md` |
| autopilot | `/eidolon loop`, `goal` or `routine` | `references/autopilot-guide.md` |

`SKILL.md` is a router: it picks the mode and points at the file that owns the procedure.

## Consent gates

Eidolon works without asking and pauses only at these moments: installing a skill, seating the primary persona, deploying, running an irreversible operation, and dispatching sensitive work. Each is one question with a line saying who is harmed if the answer is wrong. Nothing is written before the plan is approved.

## The native persona pipeline

- Setup generates `.claude/agents/*.md` from the persona roster, each with least-privilege tools and a model and effort tier.
- Each worker gets a write lane in `.claude/agent-scopes.json`; a lane breach is blocked.
- A dispatch gate asks for a done-check on every write-capable brief and a wave plan in `.claude/waves/` before a swarm.
- Every dispatch is appended to `.claude/.dispatch-log.jsonl`.
- SubagentStart hands the worker its lane and brief contract; SubagentStop sends a worker that reports no evidence back once.

## The installer

```sh
node scripts/install.mjs --project PATH [--yes --expect-plan DIGEST] [--replace] [--lock FILE] [--work-type standard|infrastructure]
```

It needs Node 22 or newer and previews by default; nothing is written until `--yes`. Preview only is the default for the CLI, and `install()` in the API behaves the same: with `dryRun: false` it needs `expectedPlan`, the digest of a plan you previewed, and refuses without one. `planInstall` and `applyPlan` are the lower-level pair; a wrapper binds the plan object itself.

Unverified: the Node 22 check runs before any syntax that an older Node would reject; settle by running the installer under Node 20.

- `--project` installs the skill and wires the hooks; `--home PATH` installs the skill only.
- The preview ends with `To apply exactly this plan: --yes --expect-plan <digest>`. `--yes` without `--expect-plan` is refused with a message to run the preview first and no digest, and a plan that changed since the preview is refused.
- A project install writes `.claude/skills/eidolon/`, the hook wiring and deny floor in `.claude/settings.json`, `.eidolon/policy-manifest.json`, a stub `.claude/eidolon-manifest.yaml`, and one delimited block each in `CLAUDE.md` (`<!-- eidolon:begin -->` to `<!-- eidolon:end -->`) and `.gitignore` (`# eidolon:begin` to `# eidolon:end`). A reinstall replaces the block in place.
- The markers count only as whole lines, so a human line that merely mentions one is left alone. A file with more than one begin line, more than one end line, an end line before the begin line or a begin line with no end line is refused, naming the file. An older undelimited copy of the block is migrated once.
- A project install also sets `env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to `"1"`, `effortLevel` to `xhigh` and `maxEffortLevel` to `max`, overwriting any existing values of those three keys (they are Eidolon requirements). The preview of `.claude/settings.json` says so under its path, above the diff.
- A source with `.git` installs tracked files only; a tracked file that is missing from the worktree is refused by name. A plain bundle directory, as Hearth ships, is walked. A project install also refuses when the bundle lacks one of the six hook files the settings wire, because a wired hook that is not there would fail open.
- `--lock FILE` checks every bundled file's hash and, for a git source, that HEAD is the pinned commit; a pin of 7 or more characters may be abbreviated. A mismatch, an extra file or a missing file is refused. The bytes checked are the bytes installed.
- `--work-type standard|infrastructure` sets the work profile recorded in `.eidolon/policy-manifest.json` (default `standard`).
- `--replace` is required to overwrite an existing skill, and the old one is kept as a backup.
- Every changed install leaves `.eidolon/backups/<id>/journal.json` and `receipt.json`, under `--home` too. An identical reinstall changes nothing and leaves no backup.
- Files are staged under `.eidolon/stage`. A stage directory or install lock older than 15 minutes is treated as left by a dead run and swept, with a note printed, except that a lock whose journal is in `recovery-required` is never swept: the install refuses and names that journal.
- It refuses: the home directory or a parent of it as a project, including any alias of them (8.3 short names, `\localhost\C$\` shares, case), compared by file identity rather than spelling; a drive or filesystem root; a `.claude/settings.json` or `.claude/settings.local.json` that already sets `disableAllHooks`; a malformed `permissions.deny`, `env`, hook group or `.eidolon/policy-manifest.json` (the message names the file or event); a skill name that is a Windows reserved device name such as `con` or `com1`; and a `CLAUDE.md` or `.gitignore` that is not valid UTF-8.
- A hook entry counts as Eidolon's only when its path, normalized, equals one of our six hook paths exactly; a foreign handler with a similar path survives a reinstall.
- It does not generate agents or lanes; setup does.

## Proof of life

```sh
node --test "hooks/*.test.mjs" "scripts/*.test.mjs"   # 283 tests; exit 0 means none failed
node scripts/selfcheck.mjs                            # 67 PASS lines, then "selfcheck: PASS"
node scripts/eidolon-audit.mjs                        # PASS: references resolve, personas pass the rail, wired hooks exist
node scripts/hooks-readme-check.mjs                   # PASS: wiring, evaluator order and hook rows match the code
```

## What the hooks are

The hooks are defense in depth: lexical checks on tool calls plus the permission deny floor. They are not a sandbox, and the known gaps are listed in `hooks/README.md`.

## Read next

- `SKILL.md`: the router and the invariants.
- `docs/spec/2026-06-08-eidolon-swarm-retrofit-design.md`: the design spec.
- `references/conductor-standard.md`: how the orchestrating session works.
- `CREDITS.md`: the work this builds on.

## Status

Early. Built by Jonah Butterbaugh alongside Claude.

## License

MIT.
