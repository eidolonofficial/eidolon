# Eidolon full-feature study + refactor — journal

## Goal (frozen — edit only if the user changes scope)
User request (2026-07-09): open the local Eidolon repo and give it the FFR treatment, but deeper —
"every feature bolted on seems incomplete, redundant, unnecessary, or detracts from the goal."
Success = a comprehensive study of the features (what the user should have + what the developer
wanted), every feature brought to its most complete form OR cut with rationale, and the result
tested GREEN expressed as a /goal for this repo. "setup and hearth need the same treatment."
Scope: projects/eidolon (dev repo), eidolon-setup skill, and "hearth" (identity TBD).

## Constraints / decisions (append-only, dated)
- 2026-07-09: Ultracode on; user granted broad refactor autonomy ("use your toolcalls").
  Work as working-tree edits, never commit without asking.
- 2026-07-09: Field evidence available: same-day FFR .claude refactor (see memory
  ffr-hook-refactor-20260709) — eidolon-GENERATED apparatus showed: dead guards (advisor,
  quiet-tree, evolve-engine), redundant advisory hooks, 5-memory-system orient stack,
  block-once delivery where advisory works, spawn-per-guard cost. These are eidolon's own
  output patterns = candidate systemic defects in the generator.
- 2026-07-09: DIVERGENCE FOUND: projects/eidolon (main @ c9d6f43, June-era log) vs deployed
  clone ~/.claude/skills/eidolon (@ d42576e, July-3-era log, remote github.com/eidolonofficial/eidolon).
  Must reconcile before refactoring — else we refactor a stale line.
- 2026-07-09: "hearth" matches nothing in projects/ or projects/eidolon *.md — identity unresolved.

## Done (append-only; each entry names its verification evidence)
- Discovery probes: repo structures + git states (evidence: ls/git log output in session,
  projects/eidolon clean tree on main; skill clone remote = eidolonofficial/eidolon).
- IDs resolved: Hearth = the end-user distribution bundle at projects/eidolon-work/Hearth
  (HEARTH-SPEC.md, welcome.ps1 27K, Start Here.cmd, macos/, skills/); named in ADRs 2026-06-14
  and 2026-06-16 as "re-mirror snapshot that trails canonical". Canonical eidolon line = GitHub
  origin/main == deployed skill clone HEAD d42576e (projects HEAD c9d6f43 was its ancestor).
- projects/eidolon synced: ff-merged to d42576e (git log evidence) + the deployed clone's 8
  uncommitted live-modified files copied over (git status shows the 8 M). NOTE: rtk PreToolUse
  hook rewrites `git diff` output in Bash — use PowerShell or --name-only forms for diffs.
- eidolon-setup: same stale pattern — deployed clone at 72672c8 (ahead), projects repo at
  2b90903 with 4 dirty files. Reconcile before/with its audit (agent instructed to audit the
  DEPLOYED latest).

- eidolon-setup dev repo ff'd to deployed HEAD 72672c8 (git log evidence); its dirty items are
  untracked dogfood output (.claude/, CLAUDE.md, docs/, hooks/ — not in product tree) + a sane
  .gitignore edit (ignore machine-specific wiring) — both left as-is.
- Study workflow launched: run wf_23a5b880-ee4, 7 agents (skill-pipeline, adr-ledger,
  doctrine-refs, hooks-scripts+tests, setup, hearth, user-walk), structured verdicts per feature.

- Study collected: 162 verdicts (66 keep/34 simplify/23 cut/20 merge/19 complete) → full detail
  tasks/study-raw.md (134KB); adjudicated study shipped docs/spec/2026-07-09-feature-triage-study.md;
  goal shipped .claude/goals.yaml (milestone feature-triage-refactor, 8 conditions, 3 MET).
- W1 GREEN BASELINE done: fable-conductor.md + 2 Jul-3 ADRs ported from deployed clone
  (eidolon-audit PASS), 8 em/en dashes fixed in hooks/README + antibehavior-catalog
  (selfcheck PASS), suites 133/133 hooks + 40/40 scripts (verbatim outputs in session).
- Adjudications recorded in study doc. Evolve mode + attestation ceremony are the two L-cuts;
  user pre-authorized cuts; git restores. Bundle re-mirror must run AFTER cuts (post-A).

- W2 DONE (wf_422efd66-72a, 3 agents): A executed all cuts + dispatch-gate simplification
  (agent verbatim greens + MY fresh re-run: 118/118 hooks, 14/14 scripts, selfcheck PASS,
  audit PASS, SKILL.md 632 lines / 0 evolve / five-gate line present, engine/ gone; note:
  SKILL.md was agent-reconstructed after a truncation incident, integrity verified by audit +
  sanity probes). D fixed Hearth installers (0 parse errors, exec bit 100755) + wrote
  tools/remirror.mjs. E completed eidolon-setup product tree (budgets green, 1/1 suite).
- Re-mirror RUN post-cuts by controller: skills/eidolon + skills/setup regenerated, MIRROR
  pins d42576e (working tree; exact after user commits), cut items + tests absent (ls probes).
- goals.yaml: cuts-executed, hearth-refreshed, setup-treated flipped to MET with evidence.
- OWNER FINDINGS: (1) eidolonofficial/eidolon-setup remote 404s even authenticated (ahead-2
  unpushable); (2) macos wizard lacks PATH/claude-check parity (follow-up); (3) deployment of
  the refactor to ~/.claude/skills/eidolon = user's commit+pull step, NOT done by me.
- DEFERRED BY TASTE (recorded, not goal conditions): loop-suite 26K deep trim, persona-roster
  bulk trim, deletion-guard→protected-paths hook merge if messy.

- W3 DONE / W4 interrupted: workflow wf_d502478f-62f was KILLED mid-run (user interrupt).
  Agent B COMPLETED before the kill (journal result, 6 changes: README rewritten 81 lines,
  partner-notes-template vendored + Stage 3 rewired, Stage 6 fidelity rules, dep sourcing).
  Agent C died AFTER writing references/review-swarms.md (all 4 sections present) but BEFORE
  any deletion/redirect — tree verified healthy (selfcheck PASS, audit PASS, all 9 originals
  still present). Recovery: state-aware finisher launched (wf_f6c05743-15b, agent C2).
- User edited .claude/goals.yaml front-door check to the post-W2 five-gate count — keep.

- W4 DONE (wf_f6c05743-15b): all 5 doc merges executed, 9 originals deleted, references
  redirected to zero outside append-only dirs (agent verbatim greps); deletion-guard hook merge
  SKIPPED as permitted (documented defense-in-depth overlap). Controller fresh verify AFTER the
  last edit: hooks 118/118, scripts 14/14, selfcheck PASS, eidolon-audit PASS, spot zero-greps 0,
  README claims verified (81 lines, five-gate section, "118 tests" matches reality).
- goals.yaml: front-door-complete + generation-fidelity flipped MET. ALL 8 CONDITIONS MET.
- Headroom side-quest closed by its own session (proxy verified end-to-end; memory updated).

## Next action (exactly ONE — overwrite, never a list)
TASK COMPLETE. Remaining items are the user's: (1) review working trees + commit
(projects/eidolon, eidolon-setup, eidolon-work/Hearth), (2) deploy = pull/copy into
~/.claude/skills/* then re-run Hearth remirror for an exact-SHA MIRROR pin, (3) decide the dead
eidolonofficial/eidolon-setup remote, (4) optional follow-ups: macos wizard parity,
loop-suite/persona-roster deep trims, deletion-guard merge.

- POST-CLOSE ADDENDUM 2026-07-09: ASI-Evolve got its right home - standalone repo
  projects/asi-evolve (engine mirror resurrected from eidolon HEAD via git archive; venv
  bootstrapped; upstream Windows path-escaping bug in the demo evaluator found + patched +
  recorded in PROVENANCE; real scored run: combined_score 0.959764 on the circle-packing demo,
  no API key). Dependency-free MCP stdio server (server.mjs) exposes the six verbs with a
  server-enforced consent gate; test-server.mjs 4/4 green (protocol, consent, smuggling guard,
  live round-trip). Registration left to user: claude mcp add asi-evolve -- node
  C:/Users/strid/projects/asi-evolve/server.mjs. Eidolon reconnection = optional future wiring
  per the new Stage-6 conditional-generation rule.

- ADVERSARIAL CLOSE-OUT (wf_57fd339c-6bc, 3 skeptics): all 8 goal gates re-held on fresh runs;
  FFR 240/240 + wiring exact; doctor cleanup intact; asi-evolve 4/4 + registered. Findings FIXED
  same turn: Hearth eidolon mirror was a stale intermediate (post-cuts, pre-merges) -> remirror
  re-run, stale refs gone + new docs present (probe evidence); goals.yaml suite-green annotation
  corrected to post-cut counts; conductor-standard section 4 got the model-cascade superseding
  note the raw study asked for. Corrections: SKILL.md is 663 lines after W3/W4 (the 632 figure
  was W2-era). EXPLICIT DEFERRALS (previously unrecorded): drift-guard SIMPLIFY,
  visual-evidence-gate SIMPLIFY (both wave-4 taste-gated; hooks work, tested green, simplify is
  polish not defect); skill-scout fire drills never run (KEEP stands; run them when the scout
  next dispatches for real). Deploy-gap analysis: the full go-live sequence + the deployed-clone
  rescue list (2 orphan personas, 4 antibehavior lines incl. the blocker-guard row that must be
  UPDATED not ported verbatim - the user removed that hook today) is in the verify output file
  and MUST precede any deploy: tasks dir pointer -> wbofkvyig.output section 'deploy'.
  Both eidolonofficial remotes 404 from this environment (eidolon AND setup) - only the user's
  own auth can distinguish private-repo from gone.

## Open questions (things only the user can answer)
- Restore or re-point the dead eidolonofficial remotes (BOTH eidolon and eidolon-setup 404 here;
  eidolon dev is 19 ahead of its stale tracking ref, setup 2 ahead).

## Open questions (things only the user can answer)
- (none currently)
