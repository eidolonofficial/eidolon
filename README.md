# Eidolon

A Claude Code skill that sets up a repository so Claude understands it from the
first message.

Point Eidolon at a project and it reads the repo, works out the languages and
tools in play, and builds a complete, verified Claude Code environment: a
CLAUDE.md, the right skills and subagents, governance hooks, and memory wiring.
It runs in four phases across ten stages, with three checkpoints where you
approve before anything is written. Nothing lands without your say, and every
generated command is checked against a second, independent signal before it
ships.

## Use

```
/eidolon                   run on the current folder
/eidolon <path>            run on a specific repo
/eidolon <path> --dry-run  plan only, never writes
```

## How it works

- Phase A, Recon and Plan: read the repo, present a tailored plan, wait for approval.
- Phase B, Structure: CLAUDE.md, skills, subagents, and governance hooks.
- Phase C, Wiring: memory and graph capture, plus MCP config.
- Phase D, Verify and Closeout: prove every generated command, then hand back a clean summary.

## Status

Early days. Built by Jonah Butterbaugh, alongside Claude.