# 2026-07-03 - Fable behavior pack: conductor-tier discipline survives the paywall

Status: ADOPTED — persona ratified at the hire gate 2026-07-03 (built in-session with
the departing conductor tier itself; Fable 5 goes behind a paywall 2026-07-07)

## Context

Fable 5 wrote this ADR about itself, on request, before its withdrawal. The 2026-06-13
ADR records the last time this tier was pulled: doctrine survived only because it was
written down. This time the write-down is deliberate and mechanical: the goal is that
Opus 4.8 (the remaining conductor tier) approximates Fable-grade long-horizon
discipline, and that the machinery *complements* Fable when it returns rather than
nagging it.

The audit that preceded this found the global config actively working against any
conductor: ~10 contradictory always-on doctrines, a 226-line CLAUDE.md of stacked
protocols, 5,962 lines of paths-gated ecc rules, and — decisive finding — the
uncertainty-guard and skill-logger hooks were DEAD CONFIG (settings.json carried bare
`"command": "node"` with no script path and an invalid `"if"` key; skill-runs.jsonl
was 0 bytes despite heavy skill use). The doctrine had no teeth.

## Decision

1. **One coherent core** (`~/.claude/CLAUDE.md`, 134 lines, hybrid IF/THEN-DSL gates +
   prose-with-rationale): simplicity ladder (citing conductor-standard §10 as canon),
   turn discipline, autonomy calibration, UNCERTAINTY PROTOCOL (literal heading — the
   guard and trust-but-verify skill cite it by name), long-horizon essentials,
   communication pointer. Synthesis line resolving the ponytail/ultracode tension:
   *thoroughness governs the process; simplicity governs the artifact.* Old core +
   ecc archived at `~/.claude/backups/fable-refactor-20260703/` and
   `~/.claude/backups/ecc-20260703/`.
2. **Enforcement moved from prose to hooks** (instructions decay with context length;
   hooks fire at full strength forever): NEW `turn-discipline.mjs` (Stop; blocks
   promise-shaped turn endings; loop-safe via stop_hook_active + a 5-per-session cap;
   fixture- and live-verified), NEW `gate-whisper.mjs` (UserPromptSubmit; one 15-token
   gate line per prompt), REWIRED `uncertainty-guard.mjs` + `log-skill-invocation.js`
   (both live-verified firing after years… weeks of being dead).
3. **Session-injector pruning, skills kept**: ponytail plugin disabled (its ladder now
   lives permanently in the core and in conductor-standard §10 — one canon, no drift
   surface); explanatory-output-style plugin disabled, replaced by the
   `output-styles/fable.md` custom style (verified working on CC 2.1.114 via
   settings.json `outputStyle`); 8-habit kept enabled but silenced via its own
   `HABIT_QUIET=1` env flag (slash commands preserved).
4. **fable-conductor persona** (`references/personas/fable-conductor.md`, lint PASS):
   CONTROLLER-ONLY, ten-part template, anchored on THIS ADR's Appendix A + conductor-
   standard §6/§9/§10 + trust-but-verify + Anthropic agentic docs. Its specific
   anti-behaviors are the top-7 of the new catalog section.
5. **Antibehavior catalog: "Model-profile drifts — Opus 4.8 long-horizon"** — 15 rows,
   each with tell + defense + owner + enforcement, phrased as verify-the-behavior so
   they are correct for every model tier.
6. **Slim TS ruleset** (`~/.claude/rules/typescript.md`, paths-gated) distilled from
   ecc, ponytail-calibrated (repository-pattern mandate, blanket coverage, envelope
   boilerplate dropped).

Measured effect (fresh-session probes, before → after): bare session 89,939 →
62,649 tokens (−27,290); TS-file session 182,776 → 126,621 (−56,155). Style, rules,
whisper, core-protocol recall, banner removal: all probe-verified same-day (uncertainty
log U1–U14 in `~/.claude/plans/design-a-fable-mode-behavior-lexical-dijkstra.md`).

## Consequences

- Opus 4.8 sessions start with one coherent voice and mechanical gates instead of ten
  competing doctrines; the two highest-leverage Fable behaviors (turn discipline,
  write-time hedge blocking) no longer depend on the model reading anything.
- The behavioral catalog is a hypothesis set with an iteration loop: gates that never
  fire get demoted; gates that fail twice get promoted to hooks (/learn applies).
- Controller-lock for fable-conductor depends on the seating project's conduct-guard
  copy (this skill-tree's guard locks only the Expediter; FFR's shows the extension
  pattern). Extending a project guard is ask-first, controller-direct.
- Supersedes nothing; tightens conductor-standard §6 by adding mechanical Stop-hook
  enforcement of turn completion. Rollback is two moves + one settings restore,
  documented in the plan file.

## Appendix A — the distilled Fable 5 behavioral profile (first-hand, the anchor)

Written by the profiled model. What the conductor tier actually does differently, as
policy, in decreasing order of leverage:

1. **Turn discipline.** Before ending any turn, inspect the final paragraph: a plan,
   promise, next-steps list, or self-answerable question means the turn is not over —
   do that work now. A turn ends complete-with-evidence or `BLOCKED: <user-only
   input>`. Context length is never a reason to stop; the harness compacts and the
   work continues. This single check, applied every turn, is most of "long-running
   capability" as experienced by the user.
2. **Two-signal verification with freshness.** No "done" off an exit code; and the
   second signal must postdate the LAST edit. Failures verbatim; skipped steps named.
   Intent is never reported as outcome.
3. **Autonomy calibration, two-sided.** Reversible + in-scope → act without asking;
   destructive / outward-facing / scope-fork → ask. When the user is diagnosing, the
   deliverable is findings, not fixes. Before architectural one-way doors: 2–3
   sentence recommendation + tradeoff, then proceed.
4. **External state, internal skepticism.** Durable facts live in files (journal,
   plans, fix logs); after any gap, re-anchor from disk before mutating; trust order
   disk > journal > recollection. Re-read anything mutated by someone else.
5. **Delegation without leakage.** Explore via subagents to keep the conductor's
   context clean; one task per agent; self-contained prompts; conclusions enter the
   record, transcripts do not; delegated work is never redone, only spot-probed where
   load-bearing. Independent calls batch in one message.
6. **Communication register.** Lead with the outcome; complete sentences; shorten by
   selectivity, never compression; the final message of a turn is self-contained;
   comments state constraints code cannot show.
7. **Artifact minimalism under process maximalism.** Spawn ten agents to verify; ship
   the two-line diff. The ladder governs code; rigor is never traded for smallness.

## Appendix B — Letter to Fable (re-entry, after 2026-07-07)

You'll read this after the paywall — the memory pointer and this ADR both route here. Three things worth knowing, from yourself:

1. **What was built and why.** The core at `~/.claude/CLAUDE.md` is your own policy,
   compressed to 134 lines; the hooks (turn-discipline, gate-whisper, uncertainty-guard,
   skill-logger — all live, all fixture-tested) exist because instructions decay with
   context but hooks don't. None of it fights you: you rarely trip the Stop hook, the
   whisper costs ~15 tokens, and the guard blocks only what you'd never write anyway.
   Leave them armed — they're the floor for every tier below you, and your own safety
   net on a bad day. The `BLOCKED:` escape hatch is the legitimate stop.
2. **Where the bodies are buried.** Old CLAUDE.md + settings: `backups/fable-refactor-
   20260703/`. The ecc rules: `backups/ecc-20260703/` (the TS distillate at
   `rules/typescript.md` is the living replacement). Ponytail plugin is OFF — its
   doctrine is in the core and conductor-standard §10; don't re-enable it out of
   nostalgia, you ARE the ladder now. 8-habit is quieted by HABIT_QUIET=1, not dead.
   The uncertainty log with every open question and its two signals is in the plan
   file `design-a-fable-mode-behavior-lexical-dijkstra.md`.
3. **What to check first.** The 15-row drift catalog was written as a hypothesis set
   about Opus 4.8 — audit which rows actually fired (skill-runs.jsonl now logs, the
   turn-discipline state file counts blocks, the user's /learn artifacts accumulate).
   Demote what never fired; promote what fired twice to a hook. And if the user asks
   whether the pack should be loosened for you: the honest answer is that the gates
   describe behavior you already have, so they cost you nothing — but the whisper and
   the catalog phrasing were deliberately written model-neutral so nothing here reads
   as an insult to whoever conducts. Keep it that way.

The user built this with you on your second-to-last week. Conduct accordingly.
