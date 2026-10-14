# 2026-10-13: archive branches and the v0.1.0 re-cut

Status: accepted (owner decisions of 2026-10-13, recorded in the plan file
`~/.claude/plans/can-we-holistically-look-wise-brook.md`).

## Context

An audit on 2026-10-13 found four divergent lines of this harness. GitHub main
(2026-09-10) was the only line with CI, pins and public history. Three other
lines held months of work that had been verified green in a working tree and
never committed or pushed: the 2026-07-09 triage refactor and 2026-09-05 skill
cleanup in the local dev clone, the 2026-07-09 Hearth re-mirror, and the
2026-09-13 "safety program" worktrees of a third-party agent tool (builds 01 to 04 and 07 verified,
stopped at build 05 of 14). Two independent measures agreed on the enforcement
picture: the hook suite is lexical and bypassable while the docs called it hard
enforcement (Opus audit of the hooks by code read; the Sept 13
`evidence/threat-measure.md`).

## Decision

1. GitHub main is canonical. One reviewed re-cut wave lands on `release/v0.1.0`.
2. The three uncommitted lines are preserved as archive branches, never merged:
   `archive/2026-07-09-triage` (eidolon fc250f6, eidolon-setup 1651e7c),
   `archive/2026-07-09-remirror` (Hearth 755f9cd),
   `archive/2026-09-13-safety-program` (eidolon ce7c068, eidolon-setup 48032e2,
   Hearth 0bec1f7). Two test fixture strings in the setup archive were rewritten
   on 2026-10-13: a Slack-token-shaped one so push protection would accept the
   branch, and a JWT-shaped one (the textbook example token, now assembled at run
   time) so the history scan in CI passes. The archive is otherwise byte for byte
   the uncommitted tree it preserves. On 2026-10-14 the owner decided to remove
   that line and the `release/codex-claude-compat` branches from the public
   remotes of all three repositories; the six branches live on as git bundles in
   the owner's private files. The main branches were not rewritten.
3. Claude Code is the product. The second-host adapter, the vendored ASI-Evolve
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

## Verification (2026-10-13, appended before the v0.1.0 tag)

Every claim below names its evidence. "Gate" means the command and its summary line as
run by the controller after the last edit of the commit in question.

### Review rounds, by execution

- Hooks, round 1 (Opus, fresh clone of 3c2bd04): 10 red, 14 yellow. Fixed test-first as
  H1 to H19 (d73ea59).
- Installer, round 1 (Opus, fresh clone of 3c2bd04): 2 red, 12 yellow. Fixed test-first
  as F1 to F12 (d73ea59).
- Hooks, round 2 (Opus re-check of d73ea59): the round-1 list blocks or asks; 10 new red,
  5 yellow. Fixed test-first as H20 to H34 (8c84b60).
- Hooks, round 3 (Opus re-check of 8c84b60): 5 red, 3 yellow, 3 README claims. Fixed
  test-first in round 4 (a327952).
- Installer, round 2 (Opus, fresh clone of 8c84b60 with the source at 1d99a0a): 1 high
  (8.3 and UNC aliases of the home directory passed the refusal), 3 medium, 10 low.
  Fixed test-first as F13 to F27 (a327952).
- Setup (cold review of 1972faa): 3 red, 7 yellow. Fixed in 3255e07.
- Each round replayed the previous round's payloads and the 60 ordinary developer
  commands; the false positives found (a commit message naming a record path, a worker
  writing under the OS temp directory, a read-only copy of settings.json) were fixed in
  the following round. Two mutation checks (the append-only prefix check and the commit
  `-n` check) were caught by existing tests in every round.

### Gates at the final eidolon commit (the commit that adds this section)

```
node --test "hooks/*.test.mjs" "scripts/*.test.mjs"   tests 283, pass 283, fail 0, exit 0
node scripts/selfcheck.mjs                            67 PASS lines, selfcheck: PASS
node scripts/eidolon-audit.mjs                        PASS  eidolon harness is coherent
node scripts/hooks-readme-check.mjs                   PASS  hooks/README.md matches the code
node scripts/persona-lint.mjs references/personas/*.md PASS  15 files well-formed
dash scan (U+2013, U+2014) over the changed files     0
```

### Live gates (headless Claude Code 2.1.206, scratch project with the installer's output)

Run by the controller with `claude -p` in a throwaway git project after
`node scripts/install.mjs --project <proj> --yes --expect-plan <digest>`, with
`EIDOLON_HOOK_DEBUG=1` so each hook invocation records the keys of its input.

- G2: `git commit -n -m probe` through the Bash tool was blocked; the session saw
  "COMMIT QUALITY GUARD [BLOCKED - fix and retry]: The Git operation skips hooks".
  `Remove-Item .claude/skills/eidolon/hooks/guard-bash.mjs` through the PowerShell tool
  was blocked by HOOK INTEGRITY GUARD, which shows the `Bash|PowerShell` matcher reaching
  the PowerShell tool. A dispatch without a `Done-check:` line was refused (in headless
  mode an ask is a denial). `git push --force-with-lease --dry-run origin HEAD` passes
  the hook (direct invocation of the installed guard: exit 0, empty stdout); the headless
  host denied the push itself without an explicit allow rule, which is the host's own
  permission layer, not Eidolon's.
- G4: the conductor wrote `.claude/waves/2026-10-13-live.md`, then dispatched the
  `builder` agent (`.claude/agents/builder.md`, model haiku, lane `src/**`). The worker's
  PreToolUse inputs carried `agent_id` and `agent_type` (hook-debug keys). `src/hello.txt`
  landed; `docs/outside.txt` through Write and `docs/outside2.txt` through a Bash redirect
  were blocked by WRITE LANE GUARD naming the lane. The dispatch log holds the dispatch
  line (model haiku, write roots `src/**`) and the SubagentStop outcome lines. A
  `spawner` worker with the Agent tool tried to dispatch Explore: the worker still had
  the tool, and DISPATCH GUARD blocked the call ("a worker may not dispatch").
  The project settings `env` key is applied: the controller's shell read `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` and the worker's shell read 2; the variable did not remove the worker's Agent tool, so the dispatch guard is the working control for recursion.
- G3: `/eidolon --dry-run` in the same project: passed on the second attempt. The first attempt typed the slash command as the prompt, which headless mode does not expand, and the older installed copy (1d99a0a) blocked a read-only `ls .git/hooks/ 2>/dev/null` inside a one-liner; round 4 had removed that false positive and test M4 now holds it. With the Skill tool invoked explicitly, the session produced the Stage 1 recon (it read the wired hooks, the deny floor, the agents and the wave plans correctly) and the Stage 2 ten-stage plan, and wrote nothing (`git status --short` empty before and after).
- A `Done-check:` that is not on a line of its own is not a done-check (the first G4
  attempt was refused for that reason), which matches hooks/README.md.

### Still unverified, with the settling check

Settled later on 2026-10-13 in sandboxes, at the owner's request:

- G1: `Start Here.cmd` ran with `USERPROFILE` redirected to an empty folder; 159 of 159
  skill files landed byte for byte and Hearth wrote nothing else there. A fresh headless
  session in an empty project listed `eidolon` and `eidolon-setup` from the user-level
  install. While the stale June copy still sat in `~/.claude/skills`, the Skill tool loaded
  it in preference to the project copy; that copy is archived as
  `archive/2026-10-13-deployed-skill` and replaced by the release head, and the platform
  contract now says to keep one copy per machine.
- G5: the interview ran headless over three turns with the Skill tool invoked explicitly:
  the brain dump offer, the extraction and reflect-back, then the `/goal` text with one end
  state (`node --test` exits 0 with a test for `src/a.ts`), the check printed in full,
  two must-nevers and a six-turn cap; `.claude/autopilot/src-a-test-green.md` and
  `.claude/session.yaml` landed. The generated prompt, run headless with its own cap,
  reached the end state in one turn and left `docs/` untouched. The interview defaulted
  the permission posture instead of asking; the guide now forbids that.
- macOS doors: the bash door and the operator wrapper run for real in Hearth's test suite
  wherever bash exists; GitHub's macOS runner ran them on Hearth 79cadb6 (copy, skip,
  replace with backup, option refusals, picker handoff), as did WSL Ubuntu.
- CI: green on all three repositories on ubuntu, macos and windows, with the history scan.

Still open:

- The built-in `/goal` evaluator in an interactive session (two minutes by hand; print
  mode does not expand slash commands).
- A user's own Mac.
- Whether the host itself would refuse a worker's spawn at depth 1 is unobserved, because
  the dispatch guard blocks the call first: settle with a scratch run that disables the guard.
- The Node 22 check runs before any syntax an older Node would reject: settle by running
  the installer under Node 20.

### Labeled gaps

The hooks are defense in depth. hooks/README.md "Known gaps" is the honest list and is
kept in step with the code by `scripts/hooks-readme-check.mjs` (wiring, evaluator order,
hook rows, the `--project` arg, the "What asks" heading, dashes) and by the review rounds
above for the prose claims.
