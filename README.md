# Eidolon

A Claude Code skill with two modes.

**Setup mode** points at a repo and builds a verified Claude Code environment
for it: a CLAUDE.md, a house persona interviewed into existence and ratified by
you, skills and slash commands, subagents, governance in two layers (permission
deny rules that hold even with hooks disabled, plus the hook suite), and memory
wiring. Four phases, eleven stages (1 to 10 plus the 2.5 persona interview),
three operator checkpoints.

**Build mode** carries a work item through a spec-driven pipeline: SPECIFY,
PLAN, BUILD, REVIEW (swarms scaled by risk tier), SYNTHESIZE, VERIFY
(cold-context), SHIP when the change deploys, CLOSE. Only CLOSE commits; three
human gates along the way.

In both modes, nothing lands without your say, and every generated command is
verified against a second, independent signal before it ships.

## Install

This repository is the skill. Copy or clone it into your Claude Code skills
directory:

```
git clone <this repo> ~/.claude/skills/eidolon
```

There is no plugin package; the skills-directory copy is the whole install.
Restart Claude Code (skills load at session start), then run `/eidolon`.

## Proof of life

From the repo root, all three must be green:

```
node --test "hooks/*.test.mjs"    # the hook suite: 118 tests, 0 failures
node scripts/selfcheck.mjs        # encoding + reference discipline: PASS
node scripts/eidolon-audit.mjs    # harness coherence: PASS
```

The scripts carry their own suite too: `node --test "scripts/*.test.mjs"`
(14 tests).

## Use

```
/eidolon                      # run on the current directory
/eidolon <path>               # run on a specific repo
/eidolon <path> --dry-run     # stages 1-2 only: recon + plan, never writes
/eidolon <path> --no-capture  # skip Stage 7 (MemPalace/Graphify fan-out)
/eidolon <path> --no-mcp      # skip Stage 8 (MCP wiring)
```

## The five consent gates

Eidolon works autonomously between checkpoints, but five kinds of moment always
pause for your explicit yes:

1. **Install a skill** (Stage 4).
2. **Seat the primary persona** (ratified at Stage 2.5, seated at Stage 10).
3. **Deploy** (the SHIP stage).
4. **Run an irreversible operation** (the ask tier).
5. **Dispatch destructive or sensitive work**
   (hooks/dispatch-attestation-guard.mjs, citing
   references/security-policy.md).

## Read next

- [SKILL.md](SKILL.md) - the full pipeline: every stage, invariant, and gate.
- [The design spec](docs/spec/2026-06-08-eidolon-swarm-retrofit-design.md) -
  why it is built this way; its section 3 is the glossary for the project's
  jargon (anchor, seat, rail, Expediter, wing).
- [references/conductor-standard.md](references/conductor-standard.md) - the
  operating standard for orchestration: conductor lanes, swarm-first dispatch,
  supervision by state.
- [CREDITS.md](CREDITS.md) - the open-source work this stands on.

## Status

Early days. Built by Jonah Butterbaugh, alongside Claude.
