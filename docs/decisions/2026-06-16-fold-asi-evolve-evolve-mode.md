# Decision log: 2026-06-16 fold ASI-Evolve into Eidolon as a runnable `evolve` mode

Append-only. Records vendoring the agent-driven ASI-Evolve toolbelt
(GAIR-NLP/ASI-Evolve, Apache-2.0, arXiv 2603.29640) into Eidolon under
`engine/asi-evolve/` and exposing it as a new top-level mode, `evolve`, beside
`setup` and `build`. This is a deliberate extension of Eidolon past "delivery
machine," and it deliberately overrides the fence the 2026-06-13 cognition-loop
uplift (commit 8caa736) drew. That override is the load-bearing decision here, so
it is recorded in full.

## Why

ASI-Evolve was already folded in once, as METHODOLOGY: the 2026-06-13 uplift
(`references/loop-suite.md`) ported its cognition-base + analyzer + closed-loop
SHAPE into Eidolon's bounded delivery wave, and fenced OUT the population-search /
numeric-fitness / island-sampling machinery with an explicit "What does NOT
transfer" section — on the correct grounds that the DELIVERY loop runs ordered
steps against a binary gate, not interchangeable variants scored by a number.

The operator's later request was to go further: vendor the real Python and make it
RUNNABLE, so Eidolon gains a genuine evaluator-driven optimization capability for
measurable AI-R&D problems. That is exactly the machinery the fence held out — but
the fence was about the delivery loop, not about Eidolon as a whole. The resolution
is not to delete the fence (it is still right for delivery) but to give the fenced
machinery its own sanctioned, clearly-bounded home: a separate mode that only
applies when a real scorer over a candidate population exists.

## What was decided (and the path NOT taken)

Upstream ships TWO ways to run the system: an autonomous multi-agent runtime
(`main.py` + `pipeline/` + a repo LLM client), and an AGENT-DRIVEN skill
(`skills/evolve/`) that collapses the three roles into one agent loop driven by a
deterministic toolbelt. Upstream's own skill is explicit: "Do not run
`python main.py`. Do not import or rely on `pipeline/` agents for orchestration."

We vendor the AGENT-DRIVEN path, not the autonomous one. It fits Eidolon natively
(Claude is the engineer; a preflight consent gate; state-on-disk as the source of
truth), needs only numpy + pyyaml (faiss / sentence-transformers optional, with
graceful fallbacks), and needs NO external LLM-API key. The autonomous runtime,
its repo LLM client, and the 3.3 MB paper PDF are NOT vendored.

## What was built

1. **The vendored engine (a clean, license-correct mirror).**
   `engine/asi-evolve/` holds upstream `skills/evolve/` verbatim (the `evolve-*`
   wrappers + the `evolve_core` package: cognition store, experiment DB, samplers,
   run-state) plus the `circle_packing_demo` smoke fixture and the upstream
   Apache-2.0 LICENSE. Pinned to upstream commit `fb8a67e`. Compliance:
   `engine/asi-evolve/LICENSE` (copied unmodified), `NOTICE` and `PROVENANCE.md`
   (Eidolon-authored, recording attribution + what was included/excluded), and a
   `CREDITS.md` entry. The vendored source is unmodified; Eidolon's integration
   lives OUTSIDE the subtree so it stays re-syncable (`engine/README.md`).

2. **Isolation — the skill stays pure.** The 7 upstream deps never enter the skill
   footprint. `engine/.venv/` is created on demand on the first evolve run and is
   gitignored along with run state (`.evolve_runs/`), the model cache, and run
   artifacts. Nothing imports Python at skill-install time, so Eidolon still
   installs into `~/.claude/skills/eidolon/` with no Python present.

3. **The `evolve` mode + its consent gate.** SKILL.md gains a third mode and an
   Evolve pipeline (FRAME → SCAFFOLD → PROVISION → CONFIRM → ROUNDS → VERIFY →
   ROUTE → CLOSE). The single human-consent moment is the preflight `--confirmed
   true` flip (upstream's own authorization act, which the toolbelt requires before
   it will mutate or evaluate). `hooks/evolve-engine-guard.mjs` ASKS the human on
   that flip — one ask per run, never per round, never a hard block (the security
   gate's posture). It rides the existing guard-bash dispatcher, so no new
   settings.json matcher is added. The contract is `references/evolve-engine.md`;
   the engine's reported best score is a CLAIM the VERIFY step re-runs the evaluator
   COLD to confirm (the trust-but-verify funnel applied to a scalar).

4. **The one sharp edge — a beneficial guard fix.** The vendored tree and its venv
   carry third-party `hooks/` paths (pip alone vendors `pyproject_hooks/` and
   `requests/hooks.py`) that would false-trip `lib.mjs` `touchesHookSuite()` and
   hard-block routine cleanup inside `engine/`. Fixed by neutralizing ONLY
   `engine/`-prefixed path tokens before the matcher runs, so a command that also
   names a real governance hook still trips. Beneficial (fewer false catches, never
   fewer true ones), proven by executing the matcher before/after, disclosed in
   `docs/fixes/FIX-2026-06-16-engine-hook-suite-exemption.md`, and pinned by a
   regression test.

5. **Wiring + records.** Modes, the consent_gates invariant, the Stage-10 manifest,
   and the Governance block in SKILL.md; the `evolve_gate` clause in
   conductor-standard.md; the antibehavior-catalog row; the hooks/README rows + the
   engine-exemption note; the loop-suite fence cross-reference; CREDITS.md.

## The deliberate override, stated plainly

The 2026-06-13 fence said the population-search / numeric-fitness machinery does NOT
transfer. This decision vendors and runs exactly that machinery. The fence was
right ABOUT THE DELIVERY LOOP and remains in force there — delivery tasks are
ordered steps, not interchangeable variants. The `evolve` mode is the carve-out
where the opposite condition holds (a real scorer over a candidate population), so
the machinery is sound there. The fence text was updated to cross-reference this
mode rather than contradict it; it was not deleted.

## The honest framing, kept

`evolve` is AI-R&D, not delivery. It applies ONLY to measurable, scored problems;
a one-off fix or a qualitative task is a build, not an evolve. The engine's score
is a claim re-verified cold before anything is trusted or shipped. The run is
human-gated at the preflight flip and bounded by the run spec's round budget. None
of this makes the deterministic delivery guardrails optional — they still do the
real work the moment an evolved candidate enters the build/verify/CLOSE path.

## Tests

`hooks/evolve-engine-guard.test.mjs` (unit + e2e: the confirmation flip asks;
drafting, per-round commands, unrelated Bash, and non-Bash tools pass). Suite cases
in `hooks/hooks.test.mjs`: the dispatcher escalates the flip; the `touchesHookSuite`
engine-exemption regression (engine/venv paths exempt, real-hook catches preserved).
Full hook and scripts suites green; `node scripts/eidolon-audit.mjs` and
`node scripts/selfcheck.mjs` pass. Engine smoke: the six wrappers load in the venv
(numpy + pyyaml only) and the graceful faiss/ST fallback imports clean.

## Scope note

The canonical home is the eidolon repo. The Hearth bundle (`skills/eidolon/`) is a
re-mirror snapshot that trails canonical; carrying the engine into the bundle is
left to the normal re-mirror. A scored run requires no LLM-API key; the optional
faiss / sentence-transformers enhance retrieval but are not required (hash-token
embedding + non-FAISS index are the fallbacks).
