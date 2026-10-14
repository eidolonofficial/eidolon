# Changelog

## v0.1.2 (2026-10-14)

Tests: the two tests that read this repository's `.gitignore` skip when the file is absent,
so the suite also passes inside a Hearth bundle, which leaves that file out because npm
renames it inside a published package. No hook or script changed.

## v0.1.1 (2026-10-14)

Added: an advisory update check, `scripts/check-updates.mjs`. It compares this copy's
version with the latest Hearth release on GitHub (one request, at most once a day,
nothing sent but a fixed user agent; `EIDOLON_UPDATE_CHECK=0` turns it off) and the
skill runs it at its second step, asking before it runs `npx -y eidolon-hearth@latest
--yes`. The house persona names its root-cause method: `references/problem-solving-frameworks.md`
(5 Whys, Fishbone, Fault Tree, Bow-Tie, Kepner-Tregoe, Pareto and DMAIC, with the
selection matrix adapted from the owner's trust-but-verify skill), Q6 of the Stage 2.5
interview, and a `## Problem solving` section that persona-lint requires on every
`*-primary.md` persona.

Hardened (hook review round 5): script files named on a command line are read one level
deep and judged; interpreter bodies (`node -e`, `python -c`, `pwsh -Command` and the
others) are judged; git aliases are expanded before the commit checks; `cd` is scoped to
its subshell and heredoc bodies are read; PowerShell `-EncodedCommand` bodies are decoded;
a controller `checkout`, `merge` or `pull` that would change hooks, settings or records
asks and lists the paths; hard links onto records (`cp -al`, `ln`, `rsync --link-dest`)
block; `GIT_DIR` and `GIT_CONFIG_VALUE_n` prefixes block unless they name the project's
own `.git`; a PowerShell call operator with a variable target is judged; archive
extraction with a path escape blocks; a worker may write under `.eidolon/scratch/` and
the OS temp dir; a controller write outside the project root to a hook, record or
settings path asks; the installer emits `"onFailure": "block"` on every hook entry
(Claude Code 2.1.295 or newer blocks when a hook file is missing; older hosts fail open,
as hooks/README.md says).

Docs: the second-host wording removed from the records and the changelog; the
2026-10-13 decision record notes the branch removal of 2026-10-14; hooks/README.md
"Known gaps" rewritten to what remains.

## v0.1.0 (2026-10-13)

Re-cut to the product the owner stated on 2026-10-13: Claude Code only.

Removed: the second-host adapter and dual-host text, the vendored ASI-Evolve engine
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
