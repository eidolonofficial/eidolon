# Feature triage study - eidolon, eidolon-setup, Hearth (2026-07-09)

Method: seven independent audit lenses (pipeline SKILL.md, ADR ledger, doctrine refs,
hooks+scripts with test runs, setup sister-skill, Hearth bundle, new-user front-door walk)
over the unified canonical tree (d42576e + live edits), each returning per-feature verdicts,
cross-weighed against same-day field evidence from the fraud-forensic-replay deployment.
Raw per-feature detail (162 verdict entries): `tasks/study-raw.md`. This document is the
adjudicated result and the execution plan.

## Product goal (triangulated - all seven lenses converged)

Turn any repo into a verified Claude Code working environment (setup mode), then carry real
work through a spec-driven, human-gated, swarm-reviewed build pipeline (build mode), with
every claim carrying machine-checkable evidence. Everything below is judged against that.

## What the field proved (fraud-forensic-replay deployment, audited 2026-07-09)

The generator's output drifted from its own tested canon: FFR received one-process-per-guard
wiring while `lib.mjs runSuite` (used in eidolon's OWN settings.json) sat unused; FFR's
commit-quality-guard false-blocked `--force-with-lease` while the canonical guard whitelists
it; advisor-guard shipped with a matcher matching no tool; evolve-engine-guard shipped where
no engine ever installed; security-surface burned ~175 tokens/session for a ceremony that has
never once run. Generation fidelity - ship the tested canon, conditionally - is the single
highest-value fix in this study.

## Adjudicated verdicts

KEEP (the working core - no action): setup stages 1-6 spine, Stage 2.5 persona interview,
build pipeline (SPECIFY..CLOSE, 3 gates, only-CLOSE-commits), risk tiers, consent-gate model,
two-layer deny floor, runSuite dispatchers + the guard set (verification, commit-quality,
append-only, persona-conduct, hook-integrity, protected-paths, settings-integrity, seat-time),
session-save/restore, memory-sync auto-miner, orient system (simplify later, not now),
conductor-standard.md, security-swarm.md, architect-synthesis.md, cross-session.md +
verify-packet.mjs, find-skills-reach + skill-scout, explain-mode, example-skill,
eidolon-audit/persona-lint/skill-lint/selfcheck.

CUT (evidence: never ran, dead in field, or duplicates a stronger sibling):
1. Evolve mode: `engine/` (vendored ASI-Evolve), `references/evolve-engine.md`,
   `hooks/evolve-engine-guard.mjs(+test)`, SKILL.md evolve sections. Never executed once
   anywhere; L-cost to complete; off-goal. ADRs remain (append-only record).
2. Security-attestation ceremony: `scripts/security-attestation.mjs(+test)`,
   `references/security-awareness.md`, `references/security-awareness/` dir,
   `hooks/security-surface.mjs`. Ed25519 loop never ran (no key, no attestation ever);
   observed behavior equals "always ask". dispatch-attestation-guard SIMPLIFIES to a plain
   keyword ask-gate naming `references/security-policy.md` (kept, simplified).
3. Review receipt: `scripts/review-receipt.mjs(+test)`, `references/review-receipt.md` -
   same never-run signing ceremony; verify-packet.mjs is the kept evidence artifact.
4. advisor-guard.mjs(+test) - matcher matches no tool anywhere, field-confirmed dead.
5. conduct-guard.mjs - superseded by persona-conduct-guard.
6. process-doctrine.mjs hook - static memo; doctrine lives in the docs.
7. scaling.md; the resource-steward rows in hooks/README (vaporware: zero artifacts exist);
   the `hooks/*.ps1` output_shape clause (no .ps1 ever produced; .mjs is cross-platform).

MERGE (same content, fewer surfaces): engineering-swarm + code-review-swarm +
trust-safety-swarm + ship-upload-swarm -> one `references/review-swarms.md`;
skill-authoring.md + skill-template.md -> one authoring doc folded into Stage 4;
process-doctrine.md + process-supervision.md -> fold into conductor-standard.md;
expert-hiring.md -> find-skills-reach.md; primary-persona.md -> persona-template.md;
deletion-guard -> protected-paths-guard (wave 4, optional).

COMPLETE (promised but missing - all S-cost):
1. Install path: README gains real install instructions (clone -> ~/.claude/skills or plugin),
   proof-of-life (`node --test hooks/`), and links to SKILL.md + the spec glossary.
2. README honesty: three modes (setup/build/evolve->now two), SIX consent gates not "four",
   all five flags.
3. Dependency sourcing: vendor a minimal PARTNER-NOTES template (kills the guaranteed
   AMBIGUOUS from the absent ai-pairing-playbook); name sources or mark optional for
   mempalace + codebase-memory-mcp (graphify fallback already exists); restate the
   trust-but-verify three-line core instead of referencing an uninstallable skill.
4. Generation fidelity (Stage 6): the generator MUST emit the runSuite dispatcher shape and
   copy canonical guard sources verbatim; conditional generation (advisor/evolve guards only
   when their preconditions exist in the target).
5. Project-output hygiene: generated personas of user projects move out of
   references/personas/ (fraud-forensic-replay-primary -> docs/examples/personas/).
6. `docs/spec design section 8/9` pointers become real paths; glossary pointer surfaced.
7. Hearth: a pinned-SHA re-mirror script (the staleness root cause - bundle frozen at
   81f0493, 29 commits behind), payload trim (no decision logs/tests into a novice's
   ~/.claude/skills), installer fixes (PATH refresh, python-stub detect, claude-CLI presence
   check, macos exec bit), HEARTH-SPEC updated to describe what ships.
8. eidolon-setup: dev repo synced (done); execute its per-feature verdicts (study-raw.md).

SIMPLIFY (wave 4, taste-gated): SKILL.md overall (45.9K; evolve cut + fidelity rewrite gets
most of it), loop-suite.md (26K trim), persona roster (~150K; generic roster stays, project
output leaves), orient trio (advisory-first delivery, FFR-proven), drift-guard,
visual-evidence-gate.

## Execution waves

- W1 GREEN BASELINE - DONE 2026-07-09: fable-conductor.md ported (audit PASS), dash
  discipline fixed (selfcheck PASS), suites 173/173.
- W2 cuts + simplifications (agent A), Hearth (agent D), setup (agent E) - parallel, disjoint trees.
- W3 front door + dependencies + fidelity rewrite (agent B) - after A (shared files).
- W4 merges (agent C) - after B. Then full re-verify: suites + selfcheck + audit green.
- Goal: `.claude/goals.yaml` milestone `feature-triage-refactor`; done = every W2-W4 item
  landed AND all four verification signals green on a fresh run.
