# Eidolon

A repository workflow for Claude Code and Codex, with shared evidence checks,
project records and consent gates. The original workflow below describes Claude;
the Codex adapter preserves it with explicit host-specific mappings.

Point Eidolon at a project and it reads the repo, works out the languages and
tools in play, and builds a complete, verified Claude Code environment: a
CLAUDE.md, a house persona crafted for you and this codebase, the right skills
(including ones it goes and finds, installed only on your explicit yes),
subagents, governance in two layers (permission rules that hold even with hooks
disabled, plus the hook suite), and memory wiring. It runs in four phases
across eleven stages, with three checkpoints where you approve before anything
is written, and it pauses at six kinds of moment: installing a skill,
seating the persona, deploying, anything irreversible, dispatching destructive
or sensitive work without a valid security attestation, and confirming an
evolve run. Nothing lands
without your say, and every generated command is checked against a second,
independent signal before it ships.

## Install for Codex or both clients

Requires Node.js 18+ and Git. Preview first, then approve the writes:

```sh
node scripts/install.mjs --host codex --project /path/to/project
node scripts/install.mjs --host codex --project /path/to/project --yes
```

Use `--host both` for both clients. Existing skill replacement needs `--replace`
and retains a backup. Restart Codex, review project trust and `/hooks`, then
invoke `$eidolon`. Copying the skill does not activate hooks.

See [Codex compatibility and limits](codex/README.md). In particular, Codex
ask-tier operations are blocked for manual operator review rather than silently
allowed. The adapter does not claim native approval parity or sandbox coverage.

## Use

```
/eidolon                   run on the current folder
/eidolon <path>            run on a specific repo
/eidolon <path> --dry-run  plan only, never writes
```

## How it works

- Phase A, Recon and Plan: read the repo, present a tailored plan, wait for approval.
- Phase B, Structure: the house persona (a short interview, grounded in named
  standards: no anchor, no seat), CLAUDE.md, skills (found and installed only
  with consent), subagents, and governance hooks in two layers.
- Phase C, Wiring: memory and graph capture, plus MCP config.
- Phase D, Verify and Closeout: prove every generated command, then hand back a clean summary.

## Status

Early days. Built by Jonah Butterbaugh, alongside Claude.
