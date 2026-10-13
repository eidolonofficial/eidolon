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
node scripts/install.mjs --project PATH [--yes] [--replace] [--lock FILE]
```

It previews by default and writes nothing until `--yes`. A project install writes `.claude/skills/eidolon/`, the hook wiring and deny floor in `.claude/settings.json`, `.eidolon/policy-manifest.json`, a stub `.claude/eidolon-manifest.yaml`, and marked blocks in `CLAUDE.md` and `.gitignore`. `--home PATH` installs the skill only. `--replace` is required to overwrite an existing skill and keeps a backup. `--lock FILE` checks every bundled file against a vendor lock and refuses a mismatch. It refuses to install into the home directory as a project. It does not generate agents or lanes; setup does.

## Proof of life

```sh
node --test "hooks/*.test.mjs" "scripts/*.test.mjs"   # 197 tests; exit 0 means none failed
node scripts/selfcheck.mjs                            # 63 PASS lines, then "selfcheck: PASS"
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
