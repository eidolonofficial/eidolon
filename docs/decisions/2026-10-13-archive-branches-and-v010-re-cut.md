# 2026-10-13: archive branches and the v0.1.0 re-cut

Status: accepted (owner decisions of 2026-10-13, recorded in the plan file
`~/.claude/plans/can-we-holistically-look-wise-brook.md`).

## Context

An audit on 2026-10-13 found four divergent lines of this harness. GitHub main
(2026-09-10) was the only line with CI, pins and public history. Three other
lines held months of work that had been verified green in a working tree and
never committed or pushed: the 2026-07-09 triage refactor and 2026-09-05 skill
cleanup in the local dev clone, the 2026-07-09 Hearth re-mirror, and the
2026-09-13 Codex "safety program" worktrees (builds 01 to 04 and 07 verified,
stopped at build 05 of 14). Two independent measures agreed on the enforcement
picture: the hook suite is lexical and bypassable while the docs called it hard
enforcement (Opus audit of the hooks by code read; the Sept 13
`evidence/threat-measure.md`).

## Decision

1. GitHub main is canonical. One reviewed re-cut wave lands on `release/v0.1.0`.
2. The three uncommitted lines are preserved as archive branches, never merged:
   `archive/2026-07-09-triage` (eidolon fc250f6, eidolon-setup 1651e7c),
   `archive/2026-07-09-remirror` (Hearth 755f9cd),
   `archive/2026-09-13-safety-program` (eidolon ce7c068, eidolon-setup 3684c39,
   Hearth 0bec1f7). One Slack-token-shaped test fixture string in the setup
   archive was replaced so push protection would accept it.
3. Claude Code is the product. The Codex adapter, the vendored ASI-Evolve
   engine (its home is the standalone projects/asi-evolve MCP server), the
   three graphical installers, the security-attestation and review-receipt
   ceremonies, the Sept persona-pipeline CLI and the dead or orphan hooks are
   removed. The 2026-07-09 triage verdicts (recorded beside this file as
   `2026-07-09-feature-triage-study.md`) are re-applied on main.
4. The intent behind the persona CLI is rebuilt on Claude Code primitives:
   roster personas become `.claude/agents/*.md` with least-privilege tools,
   model and effort per persona; per-worker write lanes checked on every tool
   call; a brief gate, a dispatch log and SubagentStart/Stop hooks; a written
   wave plan before any swarm; causal logic as a persona rail.
5. Hooks are defense in depth and the docs say so. Every documented block or
   ask matches the code, enforced by a drift test.
6. Ship means a tagged v0.1.0 on all three repos with the live gates recorded.

## Consequences

The Hearth bundles are regenerated from the tagged eidolon and setup commits.
The Sept 13 accessibility measurements (installer contrast ratios 4.02, 3.42
and 2.89 to 1 against a 4.5 threshold) are moot once the GUIs are cut, and
are kept here as the record. The deployed skill on the owner's machine is
replaced by a clean checkout of the tag.
