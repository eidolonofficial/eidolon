# Changelog

## v0.1.0 (2026-10-13)

Re-cut to the product the owner stated on 2026-10-13: Claude Code only.

Removed: the Codex adapter and dual-host text, the vendored ASI-Evolve engine
and evolve mode, the security-attestation and review-receipt ceremonies, the
Sept persona-pipeline CLI (orchestrate, dispatch-plan, task-contract,
persona-selection, skill-router, skill-inventory, persona-registry), the
advisor, conduct, process-doctrine, security-surface and orient-gate hooks.

Added: a native persona pipeline (agents generated from the roster with tools,
model and effort; write lanes per worker; a brief gate; a dispatch log;
SubagentStart and SubagentStop hooks; a wave plan before any swarm; a causal
reasoning rail in every persona), the autopilot guide (loops, goals, routines
with a brain dump and chips interview), the engineering principles reference,
a hooks README drift test, a hardened installer.

Fixed: the PowerShell tool now reaches the shell guards; combined short flags
(`-nm`), `GIT_CONFIG_*` hooksPath, `cd` plus relative paths, redirect and copy
overwrites of records, and path spellings that bypassed the record guards;
PostToolUse wiring for the drift counter; the dispatch matcher is `Agent`.

Docs: SKILL.md is a router; every claim in hooks/README matches the code.
