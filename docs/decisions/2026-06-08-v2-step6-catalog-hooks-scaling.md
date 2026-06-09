# Decision log: 2026-06-08 v2 step 6 (antibehavior catalog + full hook suite + scaling)

Append-only. The final v2 step. Records the unified antibehavior catalog, the rest
of the hook suite, the scaling reference, and the process used.

## What was built

| Artifact | Purpose |
|---|---|
| `references/antibehavior-catalog.md` | The unified deduplicated catalog (section 10): all 24 rows across verification integrity, process and quality, conduct, and record integrity, each with its defense, its owning stage, and its enforcing hook. |
| `references/scaling.md` | The three risk tiers, the cost ceiling, and the in-session vs cross-session decision (sections 12 and 15). |
| `hooks/hook-integrity-guard.mjs` | Blocks disabling, moving, or chmod of any hook, or changing the hooks path. |
| `hooks/deletion-guard.mjs` | Walls `rm` / `del` of an append-only record. |
| `hooks/protected-paths-guard.mjs` | Blocks a destructive op on a protected path. |
| `hooks/visual-evidence-gate.mjs` | Blocks a commit that stages a visual file without naming evidence (reads the staged set via `git`, execFile not shell). |
| `hooks/conduct-guard.mjs` | Advises on conduct-drift language (deferring doable work, stub-instead-of-fix, unverified claim). |
| `hooks/drift-guard.mjs` | Counts consecutive scaffold-only edits; advises from 6, blocks at 10; resets on deliverable work. |
| `hooks/session-save.mjs`, `session-restore.mjs`, `memory-sync.post-commit.sh` | Template hooks: PreCompact snapshot, SessionStart restore, post-commit memory + graph fan-out. Wired at install. |
| `.claude/settings.json`, `hooks/README.md`, `.gitignore`, `SKILL.md` | The full suite wired (8 Bash + 4 Write/Edit PreToolUse guards); README documents all 13 hooks; runtime state files git-ignored; catalog + hook-suite + scaling referenced in Governance. |

## Fire-drilled (the six deterministic guards)

```yaml
hook-integrity-guard:   blocks hooksPath / chmod-hook / rm-hook; allows git status
deletion-guard:         blocks rm of a record; allows rm build/
protected-paths-guard:  blocks rm .git / truncate a record; allows rm node_modules
visual-evidence-gate:   blocks a staged image with a plain message; allows with evidence; no-op with no image
conduct-guard:          advises on drift language; silent on a clean message
drift-guard:            allows 1-9 scaffold edits (advises from 6), blocks the 10th, resets on a deliverable edit
```

The three template hooks (session save/restore, memory-sync) parse and are
documented for install-time wiring; they depend on the target's events and tooling.

## Verification and the findings

A cold reviewer checked the catalog against section 10 (all 24 rows present, no
dropped row), the hook suite against section 11 (all 12 named hooks exist, settings
references only real files, no event mismatch), and scaling against sections 12 and
15. Verdict FINDINGS: four, all fixed and re-verified, none BLOCK/HIGH:

```yaml
three_MEDIUM:  the catalog credited three hooks with detectors they do not have
               (persona-conduct-guard for execute-untrusted-content and scope-drift;
               commit-quality-guard for secret leakage). Verified against the hook
               source: those detectors do not exist. Fixed the enforcement column to
               name the real, advisory/process-level owner, consistent with how the
               catalog already labels Skill-skipping and Resource-drift.
one_LOW:       scaling.md said "deferred past v2" where section 21 says "v2 and beyond";
               reworded to "the later graduation" so there is no version seam.
post:          all files dash-clean; scrub clean; selfcheck PASS.
```

## Decision: v2 is complete

The pipeline now carries all six swarms' worth of structure (engineering, security,
trust-and-safety, code-review, ship, plus the architect synthesis), the full base
persona roster (12 standing personas), runtime expert hiring with find-skills, the
full antibehavior catalog, and the complete hook suite, tiered and cost-ceilinged.

v2 steps 1 through 6 are done. What remains beyond v2 is the cross-session swarm
graduation (the higher isolation tier), confirmed per run when the risk and budget
justify it; v1 and v2 run in-session with the cold-context verifier.
