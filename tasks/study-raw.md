# Study raw results (7 agents, 2026-07-09)

## agent
PRODUCT GOAL: Eidolon is a Claude Code governance skill that sets up a repo (CLAUDE.md, hooks, personas, memory wiring) and then drives real work through a spec->plan->build->review-swarm->cold-verify->close pipeline whose every claim carries machine-checkable evidence.

SUMMARY: All 18 ADRs were read and their named artifacts spot-checked: unlike most rotting projects, nearly every decided file genuinely exists and the automated suites are strong (hooks 133/133 green). The rot is operational, not artifactual: an entire attestation stratum (Ed25519 review receipts and the security-awareness ceremony) is fully built and tested yet has never issued a single real artifact anywhere (verified: no keys, no receipts, no attestations outside .example files, matching the field audit); the vendored ASI-Evolve engine has never executed once (no venv, no run state) despite requiring a documented override of a 3-day-old fence and a loosening of the hook-suite matcher; advisor-guard is tested-green but can never fire because no advisor-named tool exists in any observed environment. A second pattern is canonical-vs-field divergence: the 06-11 dispatcher consolidation fixed per-guard node spawns in canonical but was never back-propagated, so the deployed target still pays one spawn per guard while runSuite sits unused, and the Hearth bundle admittedly trails canonical. Two ADRs contradict or supersede others: 06-16 evolve deliberately overrides the 06-13 fence (recorded honestly), and the 06-13 Opus-cascade exists only because "Fable was pulled" yet in-flight uncommitted work re-adds a fable-conductor persona, leaving the cascade stale. Most damning for a repo whose product IS verification discipline: the current working tree sits on red gates - eidolon-audit FAILs (SKILL.md references a missing references/personas/fable-conductor.md), selfcheck FAILs (dashes in antibehavior-catalog.md and hooks/README.md), and the scripts suite is 39/40 - violating its own only-commit-on-green doctrine. The keep core is real and field-proven: the persona rail with its seat-time anchor gate, the two-layer settings floor, the dispatcher/ask tier, and the hardened memory-sync (though even that hook is not installed in eidolon's own .git/hooks). Cut candidates are the never-run strata (review-receipt, security-awareness training, evolve mode) and the dead advisor-guard; simplify candidates are the 5-hook orient stack, the hook-suite/catalog mass that is the measured latency and false-block source in deployment, and the stale model-cascade doctrine.

### v1 pipeline spine + selfcheck.mjs (ADR 2026-06-08-v1-canary)  [KEEP | S | pipeline-stage]
- promised: End-to-end SPECIFY->PLAN->BUILD->REVIEW->VERIFY->FIX->CLOSE spine, acceptance-proven by driving scripts/selfcheck.mjs (harness invariant checker) through it; declared shipped/accepted.
- state: complete | tests: tested-red (selfcheck itself currently FAILs: em/en dashes in references/antibehavior-catalog.md and hooks/README.md from uncommitted working-tree edits)
- defects: selfcheck FAIL (2) in current working tree; uncommitted changes sit on a red gate.
- overlaps: eidolon-audit.mjs (both are self-integrity gates; could be one script)
- why: The spine and selfcheck exist and were genuinely canary-proven. But the standing gate is red RIGHT NOW in the working tree, which violates the ADR's own only-CLOSE-commits rule - the doctrine is not being applied to its own home repo.

### Persona system + persona-lint + persona-conduct-guard (ADR v2-slice1)  [KEEP | S | hook]
- promised: Ten-part persona template, anti-synthetic rail (no anchor, no seat), runtime conduct guard that blocks a seated persona's declared anti-behaviors; shipped.
- state: complete | tests: tested-green (persona-lint tests pass; persona-conduct-guard covered in the 133/133 hook suite)
- defects: No seat file exists in the repo itself (.claude/active-persona.json absent), so the guard is a no-op at home; it only bites in deployed targets.
- why: All named artifacts exist and the rail is enforced at three layers (lint, hire, seat). This is the mechanism the rest of the product hangs on.

### Engineering persona roster, 6 base personas (ADR v2-step2a)  [KEEP | S | persona]
- promised: Five additional engineering personas from the template, each anchored to real named standards; engineering swarm fully staffed; shipped.
- state: complete | tests: tested-green (persona-lint validates all; roster has since grown to 15 base + 2 examples)
- overlaps: later ad-hoc hires (geospatial-viz-engineer, skill-author, fraud-forensic-replay-primary) that entered the base dir rather than examples/, blurring the base-vs-hired boundary the step5 ADR drew
- why: Files exist, lint passes, anchors are real. Pure doc mass with a working validator; cheap to keep.

### Review breadth: trust-safety + code-review swarms + architect synthesis (ADR v2-step3)  [KEEP | S | doctrine-doc]
- promised: T&S and code-review swarm procedures, a SYNTHESIZE stage with a no-finding-dropped disposition table; shipped.
- state: doc-only | tests: n/a (procedure docs; no runnable artifact; verified once by a cold reviewer at build time)
- why: These are prompts/doctrine by design, not code - the referenced files all exist and SKILL.md wires them by tier. Their value is only realized when the pipeline actually runs a review swarm; no defect in the artifact itself.

### SHIP stage + ship-upload swarm (ADR v2-step4)  [SIMPLIFY | M | pipeline-stage]
- promised: A deploy-readiness interview and a SHIP gate (literal signal per checklist item, no deploy on red) between gate 3 and CLOSE; shipped.
- state: doc-only | tests: n/a (procedure doc; no runnable check; no evidence any SHIP interview ever ran in the field)
- defects: Loadout names e2e-runner, acknowledged in the ADR as a spec-level mismatch and left in.
- why: Artifacts exist but there is zero field evidence the stage has ever executed, and the ADR itself recorded that the loadout names an agent (e2e-runner) that is not an installed skill, kept 'faithful to the frozen spec' - a known drift shipped knowingly.

### Expert hiring + find-skills reach (ADR v2-step5)  [KEEP | S | doctrine-doc]
- promised: Runtime hiring of grounded experts (anchor AND evidence contract enforced by persona-lint) and consent-gated skill install; shipped.
- state: complete | tests: tested-green (persona-lint enforces both rail halves; both example hires pass)
- why: The one mechanism here that is mechanical (the lint rail) is real and tested; the procedure docs exist. Later roster growth shows the hire path was actually used.

### Antibehavior catalog + full hook suite + scaling tiers (ADR v2-step6)  [SIMPLIFY | M | hook]
- promised: 24-row deduplicated antibehavior catalog, ~13-hook suite (integrity, deletion, protected-paths, visual-evidence, conduct, drift, session save/restore, memory-sync), 3 risk tiers with cost ceiling; declared v2-complete.
- state: complete | tests: tested-green (hooks 133/133) but the catalog file itself currently fails selfcheck (contains an em/en dash)
- defects: antibehavior-catalog.md currently trips selfcheck; deployed targets (fraud-forensic-replay) never received the consolidated wiring, so runSuite sits unused there while every guard spawns its own node process.
- overlaps: user-global hooks (turn-discipline, uncertainty-guard) that already enforce the same doctrine - field audit found the generated trust-but-verify hook redundant with a global blocking guard
- detracts: partially - in deployments the hook mass is the main source of session latency and false blocks (pii-guard self-block, scope-guard stale cross-session state, commit-quality --force regex false-blocking --force-with-lease are all this generation layer's output patterns)
- why: Everything exists and parses, but the field audit shows this layer is where cost concentrates when generated into targets: per-guard node spawns, a ~10-hook SessionStart stack (~9.5s), advisory hooks duplicating global guards, and the step6 wiring itself was superseded 3 days later by the dispatcher consolidation. The catalog also had to be corrected once already for crediting hooks with detectors they do not have.

### Cross-session graduation + verify-packet.mjs (ADR 2026-06-08-cross-session)  [SIMPLIFY | S | script]
- promised: High-risk runs graduate to a separate-session cold verify via a self-contained, content-hashed verify packet; declared no-longer-deferred, per-run.
- state: complete | tests: tested-green (verify-packet tests pass; a cold verifier once re-derived PASS from the packet alone)
- why: The script is real and tamper-evidence is proven, but there is no trace of any run ever graduating since the canary - verify-packet/ is gitignored-transient and nothing in decisions, fixes, or the field audit shows a second use. Keep the script; drop the pretense of a standing graduation tier until a run actually needs it.

### AI-review receipt: Ed25519-signed ReviewVerdict attestation (ADR 2026-06-09-ai-review-receipt)  [CUT | M | script]
- promised: Portable signed in-toto attestation over a verify packet so a PASS travels with the change; CLOSE emits a receipt on framework-anchored reviews; shipped as 'the most genuinely novel' capability.
- state: complete | tests: tested-green (12/12 including security negatives)
- defects: The 'CLOSE emits a receipt' wiring is aspirational - no issuance path has ever executed outside tests.
- overlaps: scripts/security-attestation.mjs (imports its signer); verify-packet manifest hashing
- detracts: yes, mildly - it is the foundation security-attestation was then built on, compounding a never-used layer with a second never-used layer
- why: Code quality is high, but no key, no receipt, and no attestation exist anywhere in the repo (only .example files), and the field audit confirms the Ed25519 ceremony was never run in the deployed project either. CLOSE has never actually emitted one. A cryptographically excellent answer to a question nobody in this one-person workflow is asking; verify-packet's content hash already gives tamper evidence without key management.

### Seat-time anchor gate (ADR 2026-06-09-seat-time-anchor)  [KEEP | S | hook]
- promised: Close the rail seam: an unanchored persona with teeth is blocked at the seat boundary, with a seat-repair carve-out; shipped.
- state: complete | tests: tested-green (covered in the 133/133 hook run, including the gap test)
- why: A real bypass found by tracing the repo's own graph, closed with TDD and a cold review that caught a genuine session-wedge bug. This is the product working as intended.

### Operating-discipline block in all personas (ADR 2026-06-10, item 1)  [KEEP | S | persona]
- promised: Five production-learned rules (done-is-the-outcome, measure-before-build, etc.) byte-identical across template and every persona; shipped.
- state: complete | tests: tested-green (persona-lint 14/14 at ship; roster still lints)
- overlaps: ~/.claude/CLAUDE.md hard gates (same rules, restated per persona)
- why: Exists, cheap, and encodes real failure lessons. Redundant with the user's global CLAUDE.md doctrine, but personas travel to targets where that file may differ.

### Expediter lock (ADR 2026-06-10, item 2)  [KEEP | S | hook]
- promised: A subagent seated as the controller persona is hard-stopped and unseated; the lock precedes the teeth gate and the repair carve-out; shipped.
- state: complete | tests: tested-green (6 lock tests at ship; uncommitted work extends the lock to a new fable-conductor persona, tests green)
- defects: Working tree: SKILL.md names references/personas/fable-conductor.md, file missing, eidolon-audit FAIL and its integration test is the 1 red of 40 script tests.
- why: Tested, grounded in a real incident, and actively maintained (the in-flight fable-conductor extension). The uncommitted extension references references/personas/fable-conductor.md which does not exist yet - that is the current eidolon-audit failure.

### Advisor ban / advisor-guard (ADR 2026-06-10, item 3)  [CUT | S | hook]
- promised: A dispatched subagent calling any advisor-shaped tool is hard-blocked; grounded in an incident where four agents each burned an advisor call and wrote nothing; shipped with its own .*advisor.* settings matcher.
- state: dead | tests: tested-green (3 tests) - but the tests exercise a matcher no real tool ever triggers
- defects: Matcher matches no existing tool in any observed environment; occupies a dedicated PreToolUse settings entry.
- detracts: yes - it adds a settings matcher and doc surface for zero runtime effect, and its presence in Stage 6 templates propagates the dead hook into every new target
- why: The matcher fires only on tools whose NAME contains 'advisor'. No such tool exists in this repo's toolset, and the field audit found the generated copy dead-on-arrival in fraud-forensic-replay for the same reason. It guards a tool from a since-removed setup. Green tests on a hook that can never fire is exactly the incomplete-feature pattern the owner is describing.

### Loop suite reference (ADR 2026-06-10, item 4)  [SIMPLIFY | S | doctrine-doc]
- promised: Generalized bounded-iteration shape (wave command, status pane, queue file, budgets, leases, halt codes), distilled from a production queue; shipped.
- state: doc-only | tests: n/a (reference doc)
- why: The doc exists and encodes paid-for lessons, but the field audit shows the goals/loops layer it feeds went dormant in 3 weeks with the queue bound to a finished milestone - the doctrine outlived its consumer. Keep the lessons, cut the standing machinery framing.

### Two-layer floor: permissions.deny + settings-integrity-guard (ADR 2026-06-11, items 1)  [KEEP | S | hook]
- promised: deny rules survive any hooks kill switch; the guard blocks disableAllHooks:true and dropped wired-hook entries; shipped.
- state: complete | tests: tested-green (settings-integrity tests in the green hook suite; deny rules present in .claude/settings.json, glob semantics verified against docs at ship)
- why: Real defense-in-depth for the one attack the hook layer cannot defend itself against, verified against official docs rather than assumed. This is security the simplicity gate says never to cut.

### Dispatcher consolidation: guard-bash/guard-write via runSuite (ADR 2026-06-11, item 2)  [COMPLETE | S | hook]
- promised: One node spawn per tool call instead of thirteen; every guard exports a pure evaluator; proven behavior-identical; shipped.
- state: complete | tests: tested-green (dispatcher tests in the 133/133 suite; settings.json wires exactly guard-bash, guard-write, advisor, Task)
- defects: No re-mirror/upgrade path ever ran against existing deployments; canonical and field diverge on exactly the change this ADR made.
- why: Done correctly in canonical, and Stage 6 of SKILL.md instructs the consolidated shape for targets. The defect is operational: the deployed target (fraud-forensic-replay) predates this and was never re-mirrored, so it still spawns one node per guard per tool call while runSuite sits unused there - the framework fixed itself but never back-propagated the fix.

### Ask/consent tier in runSuite (ADR 2026-06-11, item 3)  [KEEP | S | hook]
- promised: permissionDecision 'ask' as a first-class verdict; block outranks ask (pinned by test); visual-evidence and irreversible-op re-tiered to ask; shipped.
- state: complete | tests: tested-green (block-outranks-ask pinned in suite)
- why: A sound primitive that later features (attestation gate, evolve gate) reuse; the precedence property is test-pinned. Field evidence flags one misuse pattern (context-inject-gate's block-once delivery in the generated target) but that is the generator's output, not this primitive.

### skill-scout agent (ADR 2026-06-11, item 4)  [KEEP | S | other]
- promised: Read-only discovery agent for one named capability gap; controller holds consent and install; injection fire-drilled; shipped.
- state: doc-only | tests: n/a (agent prompt file; fire drills claimed at ship, no standing test)
- why: references/agents/skill-scout.md exists and the discovery/decision/install actor split is a genuinely correct security boundary. Low mass, no runtime cost until invoked.

### Primary persona / Stage 2.5 (ADR 2026-06-11, item 5)  [KEEP | S | persona]
- promised: The user's house persona built by the same machine and held to the same rail, seated from message 1; shipped.
- state: complete | tests: tested-green indirectly (persona-lint gates ratification; a field instance exists: references/personas/fraud-forensic-replay-primary.md)
- why: The contract doc exists, the stage is wired in SKILL.md, and a real deployed instance persona is in the tree - one of the few features with field evidence of actual use.

### Hardened memory-sync auto-miner (ADR 2026-06-11-hardened-automine)  [KEEP | S | script]
- promised: git-native post-commit as foundation, atomic mkdir lock, sentinel dedup, always-logged; folds three field-proven failures back into the template; shipped.
- state: complete | tests: untested (shell template, no automated test; field-proven in fraud-forensic-replay per its FIX logs)
- defects: No .git/hooks/post-commit in the home repo; the template's guards are unverifiable at home.
- why: One of the best-grounded decisions in the set - every guard exists because a specific corruption or silence was paid for. Ironically not installed in eidolon's own repo (.git/hooks/post-commit absent), so the framework does not eat its own dog food here.

### Uncertainty ladder + Opus model cascade + persona-per-leg (ADR 2026-06-13)  [SIMPLIFY | S | doctrine-doc]
- promised: 4-tier uncertainty resolution, conductor=Opus 4.8 cascade replacing the pulled Fable tier, a persona on every swarm leg; adopted.
- state: partial | tests: n/a (doctrine in conductor-standard.md; ladder mirrored to CLAUDE.md and confirmed live there)
- defects: Cascade section contradicted by in-flight fable-conductor work; needs a superseding note rather than silent divergence.
- overlaps: ~/.claude/CLAUDE.md resolution ladder (deliberate mirror, but two sources of truth)
- why: The ladder is real and in force globally. The model-cascade half is stale: it exists solely because 'Fable was pulled', and the current uncommitted work re-introduces a fable-conductor persona (Fable returned per user memory), directly superseding the cascade's premise. Two doctrine layers now describe the conductor differently.

### Agent security-awareness training + signed attestation + dispatch gate (ADR 2026-06-14)  [CUT | L | hook]
- promised: Policy + quiz + externally-graded Ed25519 attestation; dispatch-attestation-guard asks on destructive dispatch without a valid attestation; security-surface shows status every SessionStart; shipped.
- state: partial | tests: tested-green (14 attestation tests + 8 gate tests) - but no grader key, no issued attestation, and no quiz ceremony has ever existed outside tests, in this repo or the field deployment
- defects: Attestation never issued anywhere (verified: no key/attestation files, only .example); the SessionStart surface is constant-cost, zero-information in practice.
- overlaps: review-receipt.mjs (its signer, itself unused); the deterministic hook suite (which the ADR admits does the real work)
- detracts: yes - two hooks, a policy doc, a quiz, a schema, and catalog rows all service a gate whose precondition has never been true; it also propagated into targets via Stage 10 manifests
- why: The ADR's own honest framing concedes an attested agent is exactly as injectable as an unattested one and that the deterministic hooks do the real work. Field evidence: the ceremony never ran, and security-surface degraded to ~175 tokens of static boilerplate every session. Green tests over a ritual nobody performs is process theater; the Task-matcher gate meanwhile fires its ask on the permanent no-attestation state or fails open, adding friction or nothing.

### Evolve mode: vendored ASI-Evolve engine (ADR 2026-06-16)  [CUT | L | other]
- promised: A third top-level mode beside setup/build: evaluator-driven population search for scored problems, consent-gated at the preflight flip, deliberately overriding the 06-13 fence; shipped.
- state: partial | tests: tested-green (guard unit+e2e, touchesHookSuite exemption regression) for the WRAPPER; the vendored engine itself has never run here (no engine/.venv, no .evolve_runs, no runs/ anywhere)
- defects: Never run (verified: no venv, no run state); required weakening touchesHookSuite for the vendored tree; the Hearth bundle admittedly trails canonical so users may get an engine without its wiring.
- overlaps: references/loop-suite.md fence (explicitly overridden; fence text patched to cross-reference)
- detracts: yes - it is the largest single addition to the repo with zero executed value, and it forced a governance-guard exemption that would not otherwise exist
- why: A documented self-override of a 3-day-old architectural fence to vendor a research engine that has never executed once in its own repo, and whose generated guard was dead-on-arrival in the field (guarding an engine that never self-installed). It cost a real loosening of the hook-suite matcher (the engine/ exemption in lib.mjs, however carefully done) and adds a whole vendored Python tree to a Node/Markdown skill. If a genuinely scored problem ever appears, re-vendoring is cheap.

### codebase-memory-mcp primary orient + graphify fallback (ADR 2026-06-17)  [SIMPLIFY | M | hook]
- promised: A real structural MCP/CLI orient surface replacing the broken graphify --mcp template; sentinel-arbitrated fallback; orient-gate accepts either; accepted.
- state: partial | tests: tested-green (codebase-memory-orient and orient-gate-core tests in the green suite)
- defects: Primary surface unconfigured in its own repo; the layer it joins is the measured SessionStart latency hotspot in deployment.
- overlaps: graphify-orient, mempalace-orient, seat-surface, security-surface (five SessionStart injectors that could be one)
- detracts: partially - each added orient hook is another spawn in the startup stack whose median payoff is unproven
- why: Honestly motivated - the ADR admits Stage 8 had templated a graphify MCP server that does not exist, i.e. a prior decision shipped broken on every install. But the home repo has no .claude/codebase-memory.json, so the new PRIMARY surface fails open to graphify everywhere observed, and the field audit measured the sibling mempalace-orient injecting nothing at p50 inside a ~9.5s 10-hook SessionStart stack. The orient layer is now 5+ hooks (seat-surface, graphify-orient, mempalace-orient, codebase-memory-orient, orient-gate + sensor) to deliver one orientation read.


## agent
PRODUCT GOAL: Eidolon is a Claude Code meta-skill that sets up any repo so Claude works well in it from the first message (CLAUDE.md, skills, agents, hooks, memory wiring) and then runs a gated spec-plan-build-review-verify-commit pipeline for real work, with a doctrine library in references/ that Claude reads at run time to govern orchestration conduct.

SUMMARY: The doctrine surface is ~180KB across 24 docs plus subdirs, and its central defect is triplication-by-supersession: conductor-standard.md is declared canon that "replaces" clauses still standing in scaling.md, loop-suite.md, and SKILL.md, so the same orchestration rules exist in three dated, mutually contradicting copies (model cascade: conductor-standard drops Haiku while loop-suite still assigns it doc edits; lease: 45 vs 25 minutes inside loop-suite itself). Running the repo's own auditor (node scripts/eidolon-audit.mjs) FAILS today: SKILL.md references references/personas/fable-conductor.md, which does not exist, and antibehavior-catalog.md's newest section cites four enforcing hooks (turn-discipline, blocker-guard, gate-whisper, uncertainty-guard) present only in the owner's personal global config, not in the product. The security-attestation family (security-awareness.md, security-policy.md's plumbing, review-receipt.md, the security-awareness/ subdir, two hooks, two 12K scripts) is the largest designed-but-never-run block - field evidence confirms no key was ever generated and no attestation issued, while its SessionStart surface burned static tokens every session - and evolve mode (evolve-engine.md + vendored engine + guard) is scope creep whose generated guard shipped dead in the field. The four review-swarm docs are one five-part skeleton instantiated four times and should be one doc; skill-authoring/skill-template and process-doctrine/its hook are each one feature in two files; process-supervision retells a lesson conductor-standard already carries in full. The genuinely load-bearing, consumed, and tested core is small: persona-template + persona-lint + the persona roster + conduct guard, conductor-standard's rules, cross-session's verify packet, find-skills-reach + skill-scout, and security-swarm's pinned methodology. A leaner product ships roughly 8-10 docs (~90KB) by cutting the attestation family, evolve, and scaling.md, merging the swarm quartet and the persona/skill doc pairs, and collapsing loop-suite's three accreted layers into one current contract. The doctrine docs themselves have exactly one mechanical check (eidolon-audit's link resolution + persona rail), and it is currently red.

### conductor-standard.md (27K)  [KEEP | M | doctrine-doc]
- promised: The canonical operating standard for the orchestrating session: conductor lanes, swarm-first dispatch, personas-on-every-dispatch, model cascade, supervise-by-state, spec foundry, edge-only gates, minimum-viable-code ladder.
- state: complete | tests: n/a (prose; link-checked by scripts/eidolon-audit.mjs, green for this doc)
- defects: Model cascade (§4, Haiku DROPPED, Opus fan-out default) directly contradicts loop-suite.md's still-standing cascade (Sonnet fan-out, Haiku doc edits); reader cannot tell which wins without the date comments.
- overlaps: scaling.md (§4 replaces its cost ceiling), loop-suite.md (model cascade contradicts its 06-12 section), process-supervision.md (§6 retells the same FIX-2026-06-11 lesson), persona-template.md (operating-discipline block duplicated), SKILL.md orchestration block
- detracts: no, but the patch-by-supersession pattern it anchors is the mechanism by which the whole doctrine surface accretes contradictions
- why: This is the densest real doctrine in the repo and SKILL.md declares it canon that SUPERSEDES older clauses. The defect is the supersession model itself: it patches scaling.md, loop-suite.md, expert-hiring.md and SKILL.md by annotation instead of those files being edited, so the product carries three dated copies of the same orchestration rules. Fold the superseded clauses out of the other files and this becomes the one orchestration doc.

### loop-suite.md (26K)  [SIMPLIFY | M | doctrine-doc]
- promised: Bounded autonomous iteration: one-wave-per-invocation grind command, queue-as-memory YAML schema, heartbeat, zombie reap, plus a 2026-06-13 ASI-Evolve cognition-loop uplift.
- state: complete | tests: untested (the loop artifacts it specifies are generated per-target; no eval of the doc's procedures in this repo)
- defects: Internal lease contradiction (45 vs 25); stale model cascade; the cognition-audit wave (upgrade 4) is the mechanism skill-authoring's trigger depends on, and it is operator-triggered and field-dormant.
- overlaps: conductor-standard.md (heartbeat/supervise/model-cascade), evolve-engine.md (the fence section is restated in both)
- detracts: yes in practice: it drives generation of loop scaffolding (queue, grind command, sentinels) that field evidence shows goes dormant, adding target-repo surface with no ongoing value
- why: Three accreted layers (base + 06-12 uplift + 06-13 uplift) that contradict each other: base schema says lease_minutes 45, uplift says 25; the 06-12 model cascade contradicts conductor-standard §4. Field evidence says the generated loop layer went dormant in 3 weeks with the queue bound to a finished milestone, so 26K of loop doctrine produced scaffolding nobody drove. Collapse to one current statement of the wave contract + queue schema; delete the superseded layers and the cognition-loop upgrades that depend on a loop that does not run.

### antibehavior-catalog.md (12K)  [SIMPLIFY | S | doctrine-doc]
- promised: The unified deduplicated drift catalog: each antibehavior row names its owner and enforcing hook.
- state: partial | tests: n/a (prose)
- defects: Rows cite non-existent enforcement hooks; the fable-conductor persona named as owner does not exist in references/personas/ (confirmed by running scripts/eidolon-audit.mjs: FAIL, 1 missing file).
- overlaps: security-policy.md (maps 1:1 onto it by its own admission), process-doctrine.md (two rows restate it), persona-template.md floor
- why: The owner+enforcer index is genuinely useful and hooks reference it. But the 2026-07-03 'Model-profile drifts' section names four enforcing hooks (turn-discipline.mjs, blocker-guard.mjs, gate-whisper.mjs, uncertainty-guard.mjs) that do not exist anywhere in this repo - they are the owner's personal global hooks - so for any target install those rows promise enforcement that is not shipped. Trim to rows whose enforcement exists in hooks/, and mark the rest advisory honestly.

### persona-template.md (8.4K)  [COMPLETE | S | doctrine-doc]
- promised: The ten-part persona construction template, the anti-synthetic rail (no anchor no seat), the two anti-behavior layers, the machine-readable frontmatter the conduct guard reads.
- state: complete | tests: tested-green (scripts/persona-lint.mjs + persona-lint.test.mjs validate the structure; eidolon-audit runs the rail over references/personas/ and all pass)
- overlaps: conductor-standard.md (operating-discipline block duplicated near-verbatim)
- why: The most load-bearing doc in the library: 15 built personas conform to it, persona-lint mechanically enforces it, and persona-conduct-guard matches the floor phrases it defines. Real consumers, real teeth, field-used.

### primary-persona.md (5.5K)  [MERGE | S | doctrine-doc]
- promised: Stage 2.5: interview the user's own house agent into existence, lint it on the same rail, seat it at Stage 10.
- state: complete | tests: n/a (field-ran: fraud-forensic-replay-primary.md exists as its output)
- overlaps: persona-template.md, expert-hiring.md (rail restated), explain-mode.md (register calibration)
- why: It ran in the field and works, but it is the third full restatement of the template+rail+lint pattern (after persona-template and expert-hiring). The interview questions and seat/surface mechanics are one section of persona-template, not a standalone doc.

### expert-hiring.md (4.7K)  [MERGE | S | doctrine-doc]
- promised: Runtime generation of a domain expert persona when recon finds an uncovered need, gated and linted.
- state: complete | tests: n/a (field-proven once: geospatial-viz-engineer hired 2026-06-11 per conductor-standard)
- overlaps: persona-template.md, conductor-standard.md §3, find-skills-reach.md (retooling step)
- why: Almost every rule here (template, two layers, rail, lint gate) is a restatement of persona-template.md, and conductor-standard §3 already 'replaces' its passive trigger and its conditional gate. Fold the five-step hire flow into persona-template as a section and delete the rest.

### security-swarm.md (7.2K)  [KEEP | S | doctrine-doc]
- promised: Red/blue review methodology: WSTG/ASVS/MITRE coverage maps, verified tool list with licenses, five anti-handwave gates, seeded-defect fire drill.
- state: complete | tests: untested (methodology prose; version pins verified once 2026-06-08, now 13 months stale by its own re-fetch rule)
- overlaps: security-policy.md and security-awareness.md gesture at it but cover the agent side, not the code side
- why: The one swarm doc with real domain content a generic model benefits from having pinned (tool licenses, AGPL isolation rule, static-vs-dynamic split). Its own rule says re-fetch citations at CLOSE; the pins are from 2026-06-08 and need a refresh pass, but the doc earns its bytes.

### engineering-swarm.md (4.4K)  [MERGE | S | doctrine-doc]
- promised: The build swarm: TDD per task, seeded-failing-test fire drill, no-stub closeout.
- state: complete | tests: n/a (prose)
- overlaps: code-review-swarm.md, trust-safety-swarm.md, ship-upload-swarm.md (same skeleton), persona-template.md
- why: One of four swarm docs that are the identical five-part skeleton (named failure, evidence contract, coverage manifest, fire drill, closeout gate) instantiated with different nouns. One 'swarm pattern' doc with a per-swarm table would carry the same information in a third of the bytes.

### code-review-swarm.md (4.6K)  [MERGE | S | doctrine-doc]
- promised: Behavior-preserving review: suite green identically before/after, behavior changes are findings for engineering, suite-guards-behavior fire drill.
- state: complete | tests: n/a (prose)
- overlaps: engineering-swarm.md, trust-safety-swarm.md, ship-upload-swarm.md
- why: Same five-part skeleton as the other three swarm docs; the two genuinely distinct ideas (behavior-preserving contract, plant-a-change fire drill) fit in a table row of a merged swarm-pattern doc.

### trust-safety-swarm.md (4.8K)  [MERGE | S | doctrine-doc]
- promised: Harm/abuse/PII/a11y/fairness review anchored to GDPR, CCPA, WCAG 2.2, NIST AI RMF; seeded-PII fire drill.
- state: complete | tests: n/a (prose)
- overlaps: the other three swarm docs, architect-synthesis.md (disposition flow)
- why: Same skeleton again; the anchor list and evidence contract are the distinct content. Field evidence is relevant: the generated pii-guard in the target repo blocked its own remediation by scanning old_string - the doctrine describes drills but nothing here prevents the generator emitting a self-blocking guard.

### ship-upload-swarm.md (5.3K)  [MERGE | S | doctrine-doc]
- promised: Deploy-readiness interview + checklist with per-item signals; seeded missing-env-var fire drill; user is final eyes.
- state: complete | tests: n/a (prose)
- overlaps: the other swarm docs; security-policy.md deploy_or_ship trigger
- why: Same skeleton; also its installed-skill loadout names skills ('shipping-and-launch', 'e2e-runner') with no verification they exist in any install, the same claim-without-check pattern the product forbids elsewhere.

### architect-synthesis.md (4.8K)  [KEEP | S | doctrine-doc]
- promised: One synthesizing pass over all swarm findings: the disposition table, bypass circuit breaker, no finding dropped.
- state: complete | tests: n/a (prose)
- overlaps: the swarm docs' closeout gates all point here
- why: The disposition-table contract is the one genuinely distinct piece of the review layer - it is what makes multiple swarms composable instead of noisy. Small, specific, keep it (or make it the head of the merged swarm doc).

### cross-session.md (4.4K)  [KEEP | S | doctrine-doc]
- promised: The higher isolation tier: a separate session verifies from a self-contained verify packet (diff+spec+rubric+hash).
- state: complete | tests: tested-green (scripts/verify-packet.mjs + verify-packet.test.mjs exist and pass in the suite)
- overlaps: scaling.md §3 (restates the packet mechanism), review-receipt.md (builds on the packet)
- why: The packet contract is concrete, the assembler script exists and is tested, and the graduation logic is honest about cost. Scaling.md restates half of it; after the scaling merge this is the single home for the isolation story.

### scaling.md (3.6K)  [CUT | S | doctrine-doc]
- promised: Three risk tiers, the cost ceiling, and the in-session vs cross-session decision.
- state: complete | tests: n/a (prose)
- overlaps: SKILL.md tier block (operative copy), conductor-standard.md §4 (supersedes its ceiling), cross-session.md (restates its §3)
- detracts: yes mildly: a third divergent copy of tier/ceiling doctrine invites the next patch to land in the wrong file
- why: By its own text 'the tier block in SKILL.md is the operative copy', and conductor-standard §4 explicitly replaces its cost-ceiling framing as cost-timidity. That leaves it the stale middle copy of doctrine stated authoritatively in two other places - the exact triplication that breeds contradiction. Move the two surviving lines (no_silent_cap, tier-picks-swarms) into SKILL.md and delete.

### security-awareness.md (7.5K)  [CUT | S | doctrine-doc]
- promised: A read-hash-quiz-externally-grade-attest comprehension loop; a dispatch with no valid signed attestation asks the human.
- state: complete | tests: tested-green in unit tests (security-attestation.test.mjs, dispatch-attestation-guard.test.mjs) but never exercised end-to-end
- defects: In the field the ceremony's absence turned the gate into either dead weight or a nag; the SessionStart surface was pure static boilerplate.
- overlaps: security-policy.md (its input), review-receipt.md (shares the signing engine), antibehavior-catalog.md (one row)
- detracts: yes: it consumed a SessionStart slot in a 10-hook ~9.5s stack and added a consent prompt keyed to a ceremony no one performs
- why: Field evidence is decisive: the Ed25519 ceremony has never been run - no key generated, no attestation ever issued - while its two hooks shipped anyway (security-surface injected ~175 static tokens every session; dispatch-attestation-guard asks on a status that is permanently 'no attestation'). The doc itself concedes 'an agent with a fresh attestation is exactly as prompt-injectable as one without.' This is the largest designed-but-never-run feature in the product: doc + policy + quiz + schema + 12.7K script + 2 hooks for a soft layer with zero observed value.

### security-policy.md (6.0K)  [SIMPLIFY | S | doctrine-doc]
- promised: The example-grade agent security policy the awareness loop hashes: non-negotiables, escalation triggers, default-deny areas, each mapped to its enforcing hook.
- state: complete | tests: n/a (prose; hashed at runtime by hooks/security-surface.mjs)
- overlaps: antibehavior-catalog.md (1:1 by its own admission), persona-template.md floor, security-swarm.md
- why: The policy text itself is good and honest, and unlike the ceremony it has standalone value as the plain-language layer over the hook suite. But it says itself that it maps 1:1 onto antibehavior-catalog.md. Keep it as the single human-readable security statement, sever it from the hash-and-attest plumbing, and delete the duplicate rows from the catalog (or vice versa) - one of the two files is redundant.

### review-receipt.md (8.2K)  [CUT | S | doctrine-doc]
- promised: A signed, re-judgeable Ed25519 attestation of a review verdict over a verify packet, in-toto Statement format, honest deterministic/probabilistic split.
- state: complete | tests: tested-green (scripts/review-receipt.mjs + 6.9K test file)
- overlaps: security-awareness.md (shares the signing engine it 'reuses'), cross-session.md (built on the packet)
- detracts: no, beyond ~8K of doctrine weight and a CLOSE-stage step that will never fire
- why: Well-engineered and unusually honest about what it proves, but there is no consumer: a solo operator signing receipts for their own AI reviews with a key only they trust answers no question anyone is asking, and the sibling attestation ceremony's field record (never run) is the predictor. Park the script and doc as an optional extra outside the doctrine surface; the CLOSE step that emits it should go.

### evolve-engine.md (7.5K)  [CUT | M | doctrine-doc]
- promised: The evolve mode contract: run the vendored ASI-Evolve toolbelt on measurable numeric-optimization work, consent-gated by evolve-engine-guard, score re-verified cold.
- state: complete | tests: tested-green at hook level (evolve-engine-guard.test.mjs); no evidence an evolve run ever happened
- defects: Generated guard DOA in field deployment; the mode's precondition (a numeric scorer) essentially never occurs in the repos Eidolon sets up.
- overlaps: loop-suite.md (the fence section is maintained in both files), SKILL.md evolve pipeline section
- detracts: yes: every target install carries evolve wiring (manifest rows, guard dispatch entries) for a mode that has never run
- why: Scope creep against the product goal: a repo-setup-and-build-pipeline tool vendored an AI-R&D population-search engine and grew a third mode for it. Field evidence shows the generated evolve-engine-guard shipped dead in a target repo, guarding an engine that never self-installed there. If the evolve capability matters it should be its own skill; inside Eidolon it adds a mode, a hook, a vendored engine dir, an ADR, and cross-reference maintenance in loop-suite for a workload the target user never has.

### explain-mode.md (6.5K)  [SIMPLIFY | S | doctrine-doc]
- promised: Plain-language teaching at every gate: explain affordances, comprehension checks, register calibration, teaching memory, optional quizzing.
- state: doc-only | tests: untested (no hook, script, or stage consumes it; one SKILL.md governance-table mention)
- overlaps: primary-persona.md (register calibration duplicated), find-skills-reach.md ('show me the SKILL.md first' path)
- why: The load-bearing rule ('approval without understanding is not approval' + an explain option on every AskUserQuestion) is three lines and belongs in SKILL.md's gate shape. The other 6K - teaching-memory records in session.yaml, quiz flows, four-level register tables - is machinery nothing implements, reads, or tests. For an LLM, prompt doctrine only works if it is read, and nothing routes this doc into context.

### find-skills-reach.md (5.6K)  [KEEP | S | doctrine-doc]
- promised: Pull an installable skill for a named gap: read-only scout discovers, controller asks, controller installs/verifies/records; fire drills for injection and license.
- state: complete | tests: untested (fire drills specified, no evidence they ran)
- overlaps: skill-authoring.md (reuses its consent/record flow), expert-hiring.md step 3
- why: The three-actor split (a subagent cannot pause the human, so consent must live in the controller) is a real mechanical insight, the skill-scout agent exists as a working artifact, and the flow is wired into Stage 4. Modest size, single clear job.

### skill-authoring.md (4.2K)  [MERGE | S | doctrine-doc]
- promised: Eidolon authors skills for itself from a recurring proven gap: six gated steps, distilled-from-success only, grounded in the self-generating-skill literature.
- state: complete | tests: tested-green at lint level (skill-lint.mjs + test); one worked example exists
- overlaps: skill-template.md (same feature), find-skills-reach.md, expert-hiring.md (the explicit analog), loop-suite.md upgrade 4
- why: Real machinery (lint, example, persona) but the doc and skill-template.md are one feature told in two files, and the authoring trigger ('pattern observed >= N times via the cognition-audit wave') depends on the loop-suite cognition loop that field evidence shows dormant - so the trigger will in practice never fire on its own. Merge the two docs; keep the lint rail.

### skill-template.md (4.9K)  [MERGE | S | doctrine-doc]
- promised: The construction template for self-authored skills: frontmatter contract, no-trigger-no-eval-no-skill rail, safety constraints (no external URL, secret-free, independent test gate).
- state: complete | tests: tested-green (scripts/skill-lint.mjs enforces it; skill-lint.test.mjs passes)
- overlaps: skill-authoring.md, persona-template.md (explicitly mirrored)
- why: Sound content mechanically enforced by a tested linter, but it is the other half of skill-authoring.md - template and flow belong in one doc, matching how persona-template absorbed its flow.

### process-doctrine.md (2.5K)  [MERGE | S | doctrine-doc]
- promised: Two learned rules (calibrate verification to risk; mind background work) surfaced at session start.
- state: complete | tests: n/a (prose)
- defects: Dual-maintenance: editing this doc changes nothing at runtime; the hook text is the real doctrine.
- overlaps: antibehavior-catalog.md (two rows), hooks/process-doctrine.mjs (verbatim duplicate)
- why: The hook that 'surfaces' it (hooks/process-doctrine.mjs) inlines its own hardcoded copy of the text and never reads this file, so the doc exists only as a second copy to keep in sync. Its two rules are already rows in antibehavior-catalog.md. Fold into the catalog and let the hook be the operative copy.

### process-supervision.md (7.2K)  [MERGE | S | doctrine-doc]
- promised: Dev-process staleness doctrine: boot-id health stamps, staleness banners, restart drills with two-view proof; Stage 1 records supervision, Stage 9 flags unsupervised processes.
- state: complete | tests: n/a (prose; the lesson was field-proven once, 2026-06-11)
- overlaps: conductor-standard.md §6 (same lesson, same provenance), loop-suite.md process_staleness row
- why: A genuinely valuable field lesson told in full twice: conductor-standard §6 (restart_banner/health_stamp/two_signal) already carries the same FIX-2026-06-11 story at nearly the same length. Keep the Stage-1/Stage-9 hooks into the pipeline and the boot-id prescription; merge the rest into conductor-standard §6 and cite the fix log once.

### references/personas/ (15 personas + examples/, ~160K)  [SIMPLIFY | M | persona]
- promised: The built roster: 13 base engineering/review personas, the skill-author, one target-repo primary, plus two worked example hires (PCI, PHI).
- state: complete | tests: tested-green (persona-lint rail runs over the dir via eidolon-audit; all pass)
- defects: SKILL.md references references/personas/fable-conductor.md which does not exist - confirmed by running the repo's own scripts/eidolon-audit.mjs (FAIL: 1 missing file). The controller persona the orchestration lock names is a dangling pointer.
- overlaps: each persona repeats the shared floor and operating-discipline blocks verbatim by design
- why: The roster is the persona system's real payload and it conforms to its template. Two problems: fraud-forensic-replay-primary.md is a specific user project's house persona leaked into the distributable product (target artifact in product repo), and 10-13K per persona times 15 is a heavy context bill for dispatch prompts - the ten-part depth could compress without losing the anchors and anti-behaviors the guard actually reads.

### references/agents/skill-scout.md (2.8K)  [COMPLETE | S | persona]
- promised: A read-only discovery subagent for one named skill gap: searches, ranks, flags injection/license issues, installs nothing.
- state: complete | tests: untested (its fire drills are specified in find-skills-reach.md; no evidence they ran)
- why: Small, self-contained, least-privilege by construction (WebSearch/WebFetch/Read only), and it is the working half of the find-skills flow that Stage 5 installs into targets. Running its three specified fire drills once would close it out.

### references/security-awareness/ (quiz.md, answer-key.example.json, attestation.example.json, attestation.schema.json)  [CUT | S | doctrine-doc]
- promised: The quiz, key shape, schema, and a verified example attestation for the security-awareness ceremony.
- state: doc-only | tests: untested end-to-end (the example attestation's signing key was a throwaway and discarded; no live attestation has ever been issued)
- overlaps: security-awareness.md, security-policy.md, scripts/security-attestation.mjs
- detracts: no beyond dead weight
- why: These artifacts exist solely to serve the security-awareness ceremony, which field evidence shows has never been performed. They fall with it.

### references/example-skill/SKILL.md (3.0K)  [KEEP | S | doctrine-doc]
- promised: The worked example proving the skill-authoring machinery: a real skill distilled from a real guard-collision incident, passing the lint rail.
- state: complete | tests: tested-green (passes scripts/skill-lint.mjs by design)
- overlaps: skill-authoring.md, skill-template.md
- why: Small and does exactly one job: it is the existence proof for the authoring rail, distilled from a genuine session incident with cited evidence. Keeps whatever the merged skill-authoring doc keeps. Ironic footnote worth noting: the best worked example the machinery produced is a skill for phrasing around the product's own guards - evidence the guards over-trigger.


## agent
PRODUCT GOAL: Eidolon is a generator skill that sets up any repo as a governed Claude Code environment (CLAUDE.md, safety hooks, personas, memory/graph wiring) and runs a spec-driven build pipeline with consent gates and cold-context verification.

SUMMARY: Hooks suite: 133/133 node:test pass. Scripts suite: 39/40 pass, 1 fail - eidolon-audit's self-coherence test correctly reports that SKILL.md references a missing references/personas/fable-conductor.md; selfcheck.mjs also fails on its own repo (em/en dashes in antibehavior-catalog.md and hooks/README.md), so the generator ships red against its own recursive-verification gates. The reference implementations are broadly solid - lib.mjs, the dispatchers, the tamper floor, orient-gate's session-keyed sentinels, and the correct --force-with-lease exemption all show the FFR bugs (pii-guard self-block, scope-guard shared state, commit-quality false-block) were generated drift, not reference defects - except drift-guard, which carries the same no-session-key/no-TTL state defect in the reference itself. The FFR dead-on-arrival hooks trace to one generator failure: shipping precondition-dependent hooks (advisor-guard, evolve-engine-guard, the attestation chain, mempalace-orient) unconditionally without probing that the advisor tool, engine, key, or index exists in the target - the fix is install-time precondition probes, not fixing the hooks. FFR's one-spawn-per-guard shows the installer also ignores its own documented dispatcher wiring. The biggest never-executed surface is the Ed25519 security-attestation ceremony: three components exist to serve an attestation no deployment has ever issued, while the observable behavior (ask before sensitive dispatch) needs none of the crypto. hooks/README.md documents and gives wiring instructions for a resource-steward hook that does not exist as a file anywhere - a phantom feature the audit tooling cannot see because it only scans SKILL.md. The SessionStart stack (process-doctrine's static text, security-surface's static boilerplate, mempalace-orient's p50-empty 12s-timeout recall, the two-hook primary/fallback orient arbitration) is where the product actively detracts: FFR measured ~9.5s and recurring token cost for injections a CLAUDE.md or an on-demand command delivers free. Untested files: seat-surface, graphify-orient, mempalace-orient, orient-gate-sensor (trivial), and memory-sync.post-commit.sh, whose prose leg ships commented out behind placeholders that field evidence says never get filled.

### lib.mjs (shared hook plumbing + runSuite dispatcher)  [KEEP | S | hook]
- promised: One I/O contract (stdin parse, fail-open, block/ask/advise) and a one-spawn-per-matcher suite runner so guards never drift into divergent parsers.
- state: complete | tests: tested-green (exercised by every guard test; 133/133 hooks tests pass)
- defects: None in the file; the defect is the installer not emitting the dispatcher wiring it documents.
- why: Load-bearing and correct. But FFR proved the installer ships one node spawn per guard while runSuite sits unused, so the generator violates its own SKILL.md line 306-307 dispatcher instruction when installing into targets.

### guard-bash.mjs / guard-write.mjs (dispatchers)  [KEEP | S | hook]
- promised: Single PreToolUse entry per matcher running 9 Bash / 5 Write evaluators in wired order.
- state: complete | tests: tested-green (24 and 8 references in hooks.test.mjs)
- why: Wired in eidolon's own .claude/settings.json and the exact fix for FFR's per-guard-spawn cost pattern. The generator must make this the ONLY install shape.

### verification-guard  [KEEP | S | hook]
- promised: Blocks a commit message claiming a visual/runtime result works without naming evidence.
- state: complete | tests: tested-green (via hooks.test.mjs, 14 refs)
- overlaps: user-global uncertainty-guard (partially; commit-message scope differs)
- why: Content-level check no permission rule can do; distinct from the redundant advisory trust-but-verify hook FFR flagged (that one duplicated a global blocking guard and should not be generated for users who already have one).

### commit-quality-guard  [KEEP | S | hook]
- promised: Blocks --no-verify/-n, non-lease --force push, core.hooksPath override, filter-branch/filter-repo.
- state: complete | tests: tested-green (21 refs in hooks.test.mjs)
- defects: A command containing both a bare --force push and a --force-with-lease anywhere lets the bare force through (whole-command exemption); minor.
- overlaps: Layer A permission deny rules (deliberate defense-in-depth for exotic spellings)
- why: Reference correctly exempts --force-with-lease (line 33: !/--force-with-lease\b/); the FFR false-block was generated drift from this file. Generator should copy this file verbatim instead of regenerating the regex per repo.

### append-only-record-guard  [KEEP | S | hook]
- promised: Blocks emptying / >50% Write-shrink of fix/insight/decision logs; advises on lesser shrinks.
- state: complete | tests: tested-green (11 refs)
- overlaps: deletion-guard, protected-paths-guard (record deletion)
- why: Protects the memory records the whole doctrine depends on; asymmetric Edit-vs-Write thresholds are documented. Same guard class as FFR pii-guard which scanned old_string and blocked its own remediation - worth an explicit test that an Edit REPLACING bad content is not blocked.

### persona-conduct-guard (+persona-conduct-guard.test.mjs)  [KEEP | S | hook]
- promised: Enforces a seated persona's declared anti-behaviors per tool call; hard-stops a subagent holding a controller-only seat (Expediter / fable-conductor) and clears the seat.
- state: partial | tests: tested-green (20 dedicated tests incl. the controller lock)
- defects: references/personas/fable-conductor.md missing; SKILL.md line 75 references it; scripts test suite fails on this.
- why: The most engineered guard and well tested, but it enforces a fable-conductor persona whose definition file (references/personas/fable-conductor.md) does not exist - the exact miss eidolon-audit's failing test reports. Ship the persona file or drop the reference.

### hook-integrity-guard  [KEEP | S | hook]
- promised: Blocks rm/mv/chmod of any hook or the hooks dir, or a hooksPath change.
- state: complete | tests: tested-green (13 refs)
- overlaps: protected-paths-guard (hook paths)
- why: Half of the tamper floor; lib.mjs touchesHookSuite has the FIX-2026-06-16 engine-path exemption so it stopped false-blocking vendored hooks/ paths.

### deletion-guard  [MERGE | S | hook]
- promised: Blocks outright deletion of an append-only record.
- state: complete | tests: tested-green (7 refs)
- overlaps: protected-paths-guard (full subset)
- why: protected-paths-guard already blocks the same destructive verbs on the same record paths plus more (truncate, .git, settings, hooks). README admits the overlap as defense-in-depth, but two guards for one behavior is a maintenance tax with no distinct catch except naming.

### protected-paths-guard  [KEEP | S | hook]
- promised: Blocks a destructive op on protected paths (.git, records, hooks, settings.json, persona template).
- state: complete | tests: tested-green (11 refs)
- overlaps: deletion-guard, hook-integrity-guard
- why: The superset guard; absorb deletion-guard into it and the suite loses one file with zero coverage loss.

### visual-evidence-gate  [SIMPLIFY | S | hook]
- promised: Asks (consent tier) on a commit staging visual files without named evidence.
- state: complete | tests: tested-green (13 refs, incl. throwaway git repo)
- defects: combined -am not caught by the -a sweep (documented); phrase-list is gameable.
- overlaps: verification-guard (commit-claim checking)
- why: Niche trigger with a documented hole (-am combined flag not caught by the -a sweep) and phrase-list evidence detection that is easy to satisfy with the word 'screenshot'. Fine to keep for design-heavy repos; should be an optional install, not default.

### conduct-guard  [CUT | S | hook]
- promised: Advises on conduct-drift language (deferring work, stub-instead-of-fix, unverified claims) in writes and commit messages.
- state: complete | tests: tested-green (17 refs)
- overlaps: verification-guard, user-global doctrine
- detracts: yes - per-call cost and noise for advice that blocking guards and CLAUDE.md already deliver
- why: Advisory-only phrase matching duplicating doctrine the CLAUDE.md and the blocking guards already carry - the same no-value class as FFR's advisory trust-but-verify hook. Costs a regex pass on every Write/Edit/commit for a nudge the model already has in its system prompt.

### settings-integrity-guard  [KEEP | S | hook]
- promised: Blocks a settings edit introducing disableAllHooks:true or dropping a manifest-wired hook (Layer B of the two-layer floor).
- state: complete | tests: tested-green (11 refs)
- why: The one content check no permission rule can express; pairs with the Layer A deny rules that are actually present in .claude/settings.json. Genuinely load-bearing.

### advisor-guard (+advisor-guard.test.mjs)  [CUT | S | hook]
- promised: Hard-blocks a dispatched subagent from calling any tool named like 'advisor'.
- state: complete | tests: tested-green (3 dedicated tests + 3 refs in hooks.test.mjs)
- defects: Shipped unconditionally with an unverified precondition (an advisor tool existing).
- detracts: yes - dead wiring erodes trust in the whole suite and pads settings.json
- why: FFR proved it dead-on-arrival: the .*advisor.* matcher matches no tool that exists in a target repo without an advisor MCP, so it is a wired settings entry that never fires. The generator should probe for an advisor-named tool at install and only then ship it; as a default it is pure settings noise.

### dispatch-attestation-guard (+dispatch-attestation-guard.test.mjs)  [SIMPLIFY | M | hook]
- promised: Asks the human before a destructive/sensitive Task dispatch unless a valid Ed25519-signed security attestation is in effect.
- state: complete | tests: tested-green (8 dedicated tests)
- defects: Designed-but-never-run happy path; imports the full review-receipt crypto stack per dispatch for a branch that never takes.
- overlaps: security-surface, security-attestation.mjs
- detracts: no, but carries dead complexity
- why: The code works, but the attestation branch has never once been exercised in the field (FFR: no key, no attestation ever issued), so its only real behavior is 'always ask on sensitive dispatch' - achievable in ~15 lines with no crypto import. Keep the sensitivity classifier + ask; drop the attestation verification until the ceremony is something anyone actually runs.

### evolve-engine-guard (+evolve-engine-guard.test.mjs)  [CUT | S | hook]
- promised: Consent ask on the evolve-brief --confirmed true flip that unlocks the vendored ASI-Evolve mutate/evaluate loop.
- state: complete | tests: tested-green (2 dedicated tests)
- defects: Unconditional shipping with an unverified precondition (engine present).
- detracts: yes in targets without the engine - per-call cost for an impossible event
- why: FFR proved it guards an engine that never self-installed there. In eidolon's own repo the engine/ dir exists so it is coherent locally, but the generator ships it into targets unconditionally. Install it only when engine/asi-evolve is actually vendored into the target; otherwise it is a regex run on every Bash call for a command that cannot occur.

### drift-guard  [SIMPLIFY | S | hook]
- promised: Counts consecutive scaffold-only edits; advises at 6, blocks at 10; resets on deliverable work.
- state: complete | tests: tested-green (5 refs)
- defects: Cross-session shared state, no TTL, concurrent-session clobber.
- detracts: no if fixed; stale-count false blocks if not
- why: State file .claude/.drift-count is keyed only by cwd - no session id, no TTL - so a new session inherits a stale counter and two concurrent sessions clobber each other: the exact defect class FFR's scope-guard showed. orient-gate already solved this with per-session sentinels; drift-guard should adopt the same keying.

### session-save.mjs / session-restore.mjs  [KEEP | S | hook]
- promised: PreCompact snapshot of deterministic git facts; SessionStart restore framed as hypothesis.
- state: complete | tests: tested-green (4 and 7 refs)
- overlaps: user's save-session/resume-session skills (complementary, not duplicate)
- why: Cheap, deterministic, honest about what a no-LLM hook can capture. One of the few SessionStart hooks that earns its spawn.

### process-doctrine.mjs  [CUT | S | hook]
- promised: Injects the process doctrine (verification-follows-risk, mind background work) at every SessionStart.
- state: complete | tests: tested-green (2 refs)
- overlaps: CLAUDE.md content
- detracts: yes - session-start latency and token cost for content a static file carries free
- why: A node spawn per session to inject ~90 tokens of static text that belongs in the generated CLAUDE.md - the same static-boilerplate-every-session cost class FFR flagged for security-surface, and one of the 10 hooks in the ~9.5s SessionStart stack. Move the text into CLAUDE.md and delete the hook.

### seat-surface.mjs  [KEEP | S | hook]
- promised: Surfaces the seated persona (identity, anchors, enforced anti-behaviors) at every SessionStart so the agent operates as the persona.
- state: complete | tests: untested (0 references in any test file)
- defects: No test.
- why: Legitimately dynamic (reads .claude/active-persona.json, silent when unseated) and pairs with the guard's teeth, but it is the only enforcement-adjacent hook with zero test coverage.

### security-surface.mjs  [CUT | S | hook]
- promised: Surfaces the security-policy hash + attestation status at every SessionStart.
- state: complete | tests: tested-green (4 refs)
- overlaps: dispatch-attestation-guard
- detracts: yes - recurring token/latency cost, zero observed information value
- why: FFR measured it as ~175 tokens of static boilerplate every session with no attestation ever existing to report on. Its useful sentence ('no attestation: sensitive dispatch will ask') is exactly what the dispatch gate says at dispatch time anyway. Fold the status into the gate's ask message and delete the every-pass surface.

### codebase-memory-orient.mjs (+codebase-memory-orient.test.mjs)  [KEEP | S | hook]
- promised: PRIMARY structural surface: god nodes/layers/entry points from the codebase-memory-mcp index at SessionStart; writes a per-session sentinel silencing graphify-orient.
- state: complete | tests: tested-green (11 dedicated tests)
- overlaps: graphify-orient (deliberate primary/fallback pair)
- why: Properly conditional (silent without config/binary) and session-keyed sentinels with pruning - the generator's best-engineered orient hook. Install only where the binary exists, which its fail-open already approximates.

### graphify-orient.mjs  [SIMPLIFY | M | hook]
- promised: FALLBACK structural surface: graph god nodes + hyperedges + freshness when the primary produced nothing this session.
- state: complete | tests: untested (0 references)
- defects: No test; contributes to the 10-hook SessionStart stack FFR measured at ~9.5s.
- overlaps: codebase-memory-orient
- why: A two-hook primary/fallback arbitration via sentinel files is a lot of machinery for 'show the code map at start'; one orient hook that tries the index then the report file would halve the SessionStart stack contribution. Untested despite importing from two other modules.

### mempalace-orient.mjs  [SIMPLIFY | S | hook]
- promised: Seeded prose-memory recall (branch + last-2 commit subjects) at every SessionStart, 12s timeout.
- state: complete | tests: untested (0 references)
- defects: p50 no-op in the field; 12s worst-case start stall; untested.
- overlaps: orient-gate (which forces the better, task-seeded search)
- detracts: yes - session-start latency for a recall that usually surfaces nothing
- why: FFR measured it injecting nothing at p50 - the git-subject seed rarely matches stored memories - while risking up to 12s of start latency on a slow index. orient-gate already forces a task-relevant mempalace search; the every-pass generic recall adds latency for a worse query. Make it on-demand (the gate's block message names the command) and drop the SessionStart leg.

### orient-gate.mjs + orient-gate-core.mjs (+orient-gate-core.test.mjs) + orient-gate-sensor.mjs  [SIMPLIFY | M | hook]
- promised: Hard-blocks source edits and dispatches until BOTH the code graph and mempalace have been read this session; PostToolUse sensor records reads into per-session git-root-anchored sentinels.
- state: complete | tests: tested-green (33 dedicated tests; sensor itself untested but is a 3-line wrapper)
- defects: Forced failed call per session per leg (by design).
- overlaps: mempalace-orient/graphify-orient (surface vs teeth pairing)
- detracts: partially - the burned calls are a real per-session tax
- why: The engineering is sound (session-keyed sentinels fix the cross-session clobber class), but block-once delivery is the exact cost pattern FFR flagged in context-inject-gate: every session eats one forced failed Write/Task per unmet leg. An ask or a strong advisory achieves the orientation with no burned call; if the block stays, it should at least auto-satisfy when the orient surfaces already injected the same content.

### memory-sync.post-commit.sh  [KEEP | M | hook]
- promised: git post-commit fan-out: graphify update + codebase-memory reindex + prose capture, dedup-locked, detached.
- state: partial | tests: untested (shell; no test file)
- defects: Placeholder-gated leg that field evidence says never gets filled; only file in the suite with zero automated test.
- why: The prose-capture leg ships commented out behind <CAPTURE_CMD>/<WING> placeholders, so out of the box it is a graph-only miner; FFR's dormant goals/loops layer shows placeholder-gated legs stay unfilled. Keep the script, but the installer must either fill the placeholders at Stage 7 or strip the dead leg.

### resource-steward (hooks/README.md rows only)  [CUT | M | doctrine-doc]
- promised: SessionStart stewardship memo + model-cascade and compact nudges per tool call, state in .claude/.steward-count.
- state: doc-only | tests: n/a (no file exists to test)
- defects: Phantom feature: documented + wiring instructions, zero implementation; hooks/README.md fails selfcheck (em/en dash).
- overlaps: user's /steward skill (per the README's own note)
- detracts: yes - install instructions that wire a missing file are worse than no feature
- why: Fully specified in the README table, the wiring section, and the block/advise list - and the .mjs file does not exist anywhere in the repo. A generator whose install instructions wire a nonexistent hook would brick or silently no-op a target's settings entry. Delete the rows or write the hook; the README's own em-dashes also fail selfcheck.

### eidolon-audit.mjs (+eidolon-audit.test.mjs)  [KEEP | S | script]
- promised: Audits harness integrity: SKILL.md references resolve, personas pass the rail, wired hooks exist.
- state: complete | tests: tested-red: 1 of its tests fails because the repo itself is incoherent (SKILL.md -> missing references/personas/fable-conductor.md)
- defects: Its target repo fails it; README-documented hooks are outside its scan.
- overlaps: selfcheck.mjs
- why: The tool works exactly as designed - it is the repo that is red, and has been shipped red. The failing self-test is the audit doing its job; fix is to add the missing persona file. Note extractRefs would not have caught the resource-steward phantom (README is not scanned) - extending it to hooks/README.md is a cheap win.

### persona-lint.mjs (+persona-lint.test.mjs)  [KEEP | S | script]
- promised: Validates persona files against the anti-synthetic rail (no anchor, no seat).
- state: complete | tests: tested-green
- overlaps: persona-conduct-guard (seat-time vs file-time enforcement of the same rail)
- why: Small, pure, imported by eidolon-audit and used at hire time; 15 real persona files in references/personas/examples pass it.

### skill-lint.mjs (+skill-lint.test.mjs)  [KEEP | S | script]
- promised: Validates self-authored skills: concrete trigger, eval present, no secret.
- state: complete | tests: tested-green
- why: Mirrors persona-lint for skills; the common-token trigger check encodes the /learn Gate 3 narrowness rule mechanically.

### verify-packet.mjs (+verify-packet.test.mjs)  [KEEP | S | script]
- promised: Assembles a self-contained cold-context verify packet (diff + spec + rubric + hashed manifest).
- state: complete | tests: tested-green
- overlaps: review-receipt (consumes its packets)
- why: Directly serves the pipeline's cold-context verify stage, which is a core promise of build mode; guards --base against option injection.

### review-receipt.mjs (+review-receipt.test.mjs)  [SIMPLIFY | M | script]
- promised: Ed25519-signed, re-judgeable review-verdict attestations over a verify packet (in-toto Statement shape).
- state: complete | tests: tested-green (crypto hardened against the alg-substitution and planted-hash findings)
- defects: Designed-but-never-run signing ceremony in practice (field evidence).
- overlaps: security-attestation.mjs (which imports its crypto)
- detracts: no, but its complexity is unamortized
- why: Well-built, but the honest question is who verifies these signatures: no field deployment has run a keygen ceremony. For a single-operator workflow the packet hash alone gives the tamper evidence; the signing tier only pays off in multi-party/CI settings. Keep the packet+hash core, make the Ed25519 envelope an explicitly optional tier.

### security-attestation.mjs (+security-attestation.test.mjs)  [CUT | L | script]
- promised: Portable signed record that an agent read the security policy, took the quiz, and was graded PASS by an external Ed25519 key-holding validator.
- state: complete | tests: tested-green
- defects: An externally-graded quiz workflow with no grader, no key, and no issued attestation in any deployment.
- overlaps: review-receipt.mjs, dispatch-attestation-guard, security-surface
- detracts: yes - it is the largest never-executed surface in the product and drags two hooks along with it
- why: FFR field evidence: the ceremony has never run - no key generated, no attestation ever issued - so the entire chain (keygen -> quiz -> external grader -> signed file -> gate verify -> surface status) has produced zero real artifacts while three components (this script, the dispatch gate's verify branch, security-surface) exist to serve it. Its own docs admit awareness is a soft layer and a fresh attestation leaves the agent exactly as injectable. The observable behavior it enables (ask before sensitive dispatch) needs none of it.

### selfcheck.mjs  [KEEP | S | script]
- promised: One-command check of eidolon's own invariants: every hook parses, settings.json valid, no em/en dashes in docs; optional profile for extra paths.
- state: complete | tests: tested-red in effect: no unit test, and running it on its own repo exits FAIL (2) - em/en dash in references/antibehavior-catalog.md and hooks/README.md
- defects: Own repo currently fails it; no CI enforcement.
- overlaps: eidolon-audit.mjs (merge candidate: one self-verification entry point)
- why: Like eidolon-audit, the tool is right and the repo is red: the generator ships failing its own recursive-verification gate, which undercuts the product's central claim. Fix the two dashes; consider running selfcheck + eidolon-audit in CI so the repo cannot ship red again.


## agent
PRODUCT GOAL: Turn any repo into a verified Claude Code working environment (setup mode) and then carry real work items through a spec-driven, human-gated, swarm-reviewed build pipeline in that environment (build mode).

SUMMARY: The pipeline's skeleton is sound and unusually well specified: 27 of 28 referenced support files exist, and the hook/script test suite runs 172/173 green. The one red is damning in kind rather than size — the repo fails its own eidolon-audit because SKILL.md references references/personas/fable-conductor.md, which was never written, and hooks/README.md separately documents a resource-steward hook and reference doc that do not exist; a verification product is shipping unverified claims about itself. The deepest field problem is generation fidelity: the canonical repo uses the runSuite dispatcher and correctly whitelists --force-with-lease, yet the FFR deployment got spawn-per-guard wiring and the lease false-block, meaning the generator emits variants of its own tested canon. A whole stratum is designed-but-never-run: the Ed25519 attestation ceremony (no key or attestation has ever existed anywhere), the signed review receipts, and evolve mode with its 272KB vendored engine (no .evolve_runs here or in the field, its consent guard shipped dead to FFR) — cut or park these and the observed behavior of the product is unchanged. advisor-guard is dead-on-arrival everywhere observed and should go. The session-start surface (orient trio, security-surface, mempalace-orient) needs consolidation to one dispatcher and advisory delivery; the field measured ~9.5s and near-zero injected value at p50. The keepers that carry the product are setup Stages 1-6 and 8-10, the build pipeline with its risk tiers and cold-context VERIFY, the two-layer deny floor, the field-hardened memory-sync script, and the consent-gate model. The 46KB SKILL.md itself is a per-invocation context tax and should push its governance index and evolve section into references. Stage 3's partner-notes emit depends on an ai-pairing-playbook skill that is not installed on this machine, guaranteeing an AMBIGUOUS on every setup run. Net: complete the two dangling references, cut the ceremony layers and dead guards, fix the generator to copy its tested canon verbatim, and the product's promise and its behavior finally match.

### Setup Stage 1-2: recon + tailored plan + Checkpoint 1  [KEEP | S | pipeline-stage]
- promised: Read-only stack detection, then a per-repo 10-stage plan approved before any write.
- state: complete | tests: n/a (prompt-driven; recon commands are plain shell)
- why: The consent-before-write spine of the product; cheap, fully specified, no missing support files.

### Setup Stage 2.5: primary persona interview  [KEEP | S | pipeline-stage]
- promised: Interview the user into a house persona, lint it (no anchor, no seat), seat at Stage 10.
- state: complete | tests: tested-green (persona-lint.test.mjs passes; primary-persona.md + persona-template.md exist)
- defects: A target project's generated persona (fraud-forensic-replay-primary.md) is checked into the generator repo's references/personas/ — output leaking into product tree.
- why: Fully wired end to end (interview -> lint -> seat -> conduct-guard) and it produced a real artifact in the field (fraud-forensic-replay-primary.md).

### Setup Stage 3: CLAUDE.md generation  [KEEP | S | pipeline-stage]
- promised: Declarative CLAUDE.md, merge-never-overwrite, references not inlining.
- state: complete | tests: n/a
- why: Core deliverable of setup mode; spec is precise and self-contained.

### Stage 3 partner-notes / ai-pairing-playbook coupling  [SIMPLIFY | S | pipeline-stage]
- promised: Copy the ai-pairing-playbook PARTNER-NOTES template into docs/working-with-claude.md; never inline the 6 shifts.
- state: partial | tests: untested; the dependency is ABSENT on this machine (~/.claude/skills/ai-pairing-playbook does not exist)
- overlaps: INVARIANTS pairing axis (same dead dependency)
- detracts: yes — a guaranteed AMBIGUOUS at Stage 9 that the operator must waive every setup run
- why: Every run on this machine hits the AMBIGUOUS fallback by construction, so the feature can never succeed as shipped. Either vendor a static partner-notes template or drop the emit.

### Setup Stage 4: skills + slash commands generation  [KEEP | S | pipeline-stage]
- promised: Generate .claude/skills/<name>/SKILL.md + commands per detected capability.
- state: complete | tests: n/a
- why: Direct value to the end user; templates exist (references/skill-template.md, example-skill/).

### Stage 4 skill-scout reach (find-skills)  [KEEP | S | pipeline-stage]
- promised: Three-actor discover/decide/install flow for capability gaps; consent before install, verify before trust.
- state: complete | tests: n/a (references/find-skills-reach.md + references/agents/skill-scout.md exist)
- why: Well-bounded, consent-gated, and structurally sound (subagent cannot pause the human, so controller holds the gate).

### Stage 4 self skill-authoring (skill-authoring.md + skill-lint.mjs)  [MERGE | S | pipeline-stage]
- promised: Eidolon authors a skill for ITSELF from a recurring proven gap, gated by lint + independent eval + consent.
- state: complete | tests: tested-green (skill-lint.test.mjs passes)
- overlaps: Stage 4 skill generation, expert-hiring (declared 'skill analog of expert-hiring')
- detracts: mildly — extra doctrine surface for an unexercised path
- why: No evidence any self-authored skill was ever produced; its own doctrine says one-shot speculation is worse than nothing. Fold the lint rail into the ordinary Stage 4 flow and drop the standalone self-authoring ceremony.

### Setup Stage 5: subagents (verifier, reviewer, skill-scout)  [KEEP | S | pipeline-stage]
- promised: Scoped .claude/agents/*.md with own context windows.
- state: complete | tests: n/a
- why: Small, concrete, directly used by build mode's review stages.

### Setup Stage 6: two-layer governance (deny floor + hook suite wiring)  [KEEP | M | pipeline-stage]
- promised: Permission deny list surviving disableAllHooks, plus a consolidated guard-bash/guard-write dispatcher hook suite.
- state: complete | tests: tested-green (hooks.test.mjs; 172/173 suite-wide)
- defects: Generated output diverges from canonical hooks (spawn-per-guard, lease regression) — the generator copies stale/variant guard text instead of the tested canon.
- detracts: no, when generated faithfully
- why: The deny floor is genuinely clever and cheap. BUT field evidence shows the generator did not ship its own canonical shape: FFR got one node spawn per guard while lib.mjs runSuite (used in eidolon's own settings.json) sat unused, and FFR's commit-quality-guard false-blocked --force-with-lease while the canonical guard here explicitly whitelists it. The feature is right; generation fidelity is the defect to fix.

### advisor-guard hook  [CUT | S | hook]
- promised: Hard-stop a subagent calling any tool named like 'advisor'.
- state: complete | tests: tested-green (advisor-guard.test.mjs) but dead at runtime — the .*advisor.* matcher matches no tool that exists in eidolon's own settings.json or in the FFR deployment
- detracts: yes — dead-on-arrival in the field (confirmed), false sense of coverage
- why: Guards a tool class that does not exist in any observed environment; it is config noise plus a node spawn budget for zero catches. If advisor-shaped MCP tools return, regenerate it conditionally on detecting one.

### Security-awareness attestation ceremony (security-awareness.md, security-policy.md, quiz, scripts/security-attestation.mjs, hooks/security-surface.mjs, hooks/dispatch-attestation-guard.mjs)  [SIMPLIFY | L | hook]
- promised: Read-hash-quiz-externally-grade-attest loop; sensitive dispatches without a valid Ed25519-signed attestation ask the human; posture surfaced every session.
- state: partial | tests: tested-green (unit tests for guard + signer pass) but the ceremony has NEVER run: no grader key, no attestation.json anywhere in this repo or the field deployment
- defects: security-surface.mjs is pure boilerplate when no attestation exists (the only state that has ever existed).
- overlaps: dispatch-attestation-guard's fallback path IS the whole observed behavior
- detracts: yes — session-start token tax and three files of machinery for a behavior equal to a constant ask
- why: Designed-but-never-run cryptography. Since no attestation ever exists, the guard degenerates to 'always ask on sensitive dispatch' — which a 20-line keyword ask-gate delivers without Ed25519, a policy hash, a quiz, or a per-session posture banner. Field evidence: security-surface burned ~175 static tokens every session for this.

### evolve-engine-guard hook  [MERGE | S | hook]
- promised: Consent-ask on the --confirmed true preflight flip that unlocks the evolve engine.
- state: complete | tests: tested-green (evolve-engine-guard.test.mjs) but dead in the field — FFR received the guard while the engine never installed there
- overlaps: evolve mode
- detracts: yes in field deployments without the engine
- why: Only meaningful when evolve mode is actually provisioned; make its installation conditional on engine presence instead of shipping it into every target.

### Orient trio + orient-gate (codebase-memory-orient, graphify-orient, mempalace-orient, orient-gate + sensor)  [SIMPLIFY | M | hook]
- promised: Surface graph + prose memory every session; BLOCK edits/dispatches until both were actively read.
- state: complete | tests: tested-green (codebase-memory-orient.test.mjs, orient-gate-core.test.mjs)
- overlaps: three overlapping memory surfaces per session (codebase-memory, graphify, mempalace)
- detracts: yes as currently stacked — latency and forced-failure friction on every session
- why: Field evidence indicts the delivery mechanics, not the idea: mempalace-orient injected nothing at p50, the block-once gate forces a failed tool call per area where advisory injection works, and the SessionStart stack hit ~9.5s wall across 10 hooks. Keep one primary orient with one fallback; demote the gate to advisory; consolidate SessionStart into one dispatcher process.

### Stage 7 memory-sync post-commit script (dedup + atomic lock + logging)  [KEEP | S | script]
- promised: One portable git-native capture script, hardened against double-fire, index corruption, and silent non-firing.
- state: complete | tests: untested by unit suite, but each hardening is field-provenance-documented (docs/decisions/2026-06-11-hardened-automine.md)
- why: The best-earned artifact in the repo: every design choice traces to a real failure (HNSW desync, the 13-commit silent non-fire). Genuinely load-bearing for the memory promise.

### Stage 8 MCP wiring (codebase-memory-mcp)  [KEEP | S | pipeline-stage]
- promised: Wire the graph MCP server; explicitly refuses to template a broken graphify --mcp line.
- state: complete | tests: n/a
- why: Precise, includes the negative knowledge (graphify has no MCP entrypoint) that prevents a class of broken configs.

### Stage 9 verify (two-signal funnel, EXTRACTED/INFERRED/AMBIGUOUS)  [KEEP | S | pipeline-stage]
- promised: Every generated command verified against an independent signal; AMBIGUOUS blocks closeout.
- state: complete | tests: n/a (drives shell checks; scripts/selfcheck.mjs implements part of it and runs green)
- why: This is the product's differentiator and the discipline the whole doc leans on.

### Stage 10 manifest + seat + closeout + scripts/eidolon-audit.mjs  [COMPLETE | S | pipeline-stage]
- promised: Artifact registry with last_verified, persona seating, self-auditing closeout.
- state: complete | tests: tested-red — the repo FAILS its own audit right now: 'SKILL.md references a missing file: references/personas/fable-conductor.md' (1 of 173 tests red)
- defects: Self-audit red; fable-conductor.md referenced in SKILL.md orchestration lock and persona-conduct-guard docs but absent.
- why: The mechanism works (it caught real drift); the fix is to write or de-reference fable-conductor.md. A verification product shipping red on its own gate is the single most corrosive defect here.

### Build pipeline (SPECIFY -> PLAN -> BUILD -> REVIEW -> SYNTHESIZE -> VERIFY -> SHIP -> CLOSE, 3 human gates, only-CLOSE-commits)  [KEEP | M | pipeline-stage]
- promised: Spec-driven staged delivery with cold-context verify, bounded 3-red fix loop, rollback SHA stated before commit.
- state: complete | tests: n/a (process spec; the four load-bearing rules are crisp)
- why: The core product alongside setup mode; the cold-context VERIFY and only-CLOSE-commits rules are the two ideas a real user most benefits from.

### Risk tiers + cost ceiling (trivial/standard/high_risk)  [KEEP | S | pipeline-stage]
- promised: Scale the pipeline to the change so the cure does not become its own drift.
- state: complete | tests: n/a
- why: The one feature that defends the product against its own maximalism; without it every one-line fix summons swarms.

### Review swarm doc constellation (security-swarm, trust-safety-swarm, code-review-swarm, engineering-swarm, ship-upload-swarm, architect-synthesis)  [KEEP | S | doctrine-doc]
- promised: Red/blue security, GDPR/WCAG trust-safety, behavior-preserving code review, TDD engineering swarm, deploy-readiness, one synthesized disposition.
- state: complete | tests: n/a (all 6 reference files exist, 4-7KB each; fire drills specified)
- why: Referenced-not-restated is the right shape and each doc is compact; the tier system already gates when they fire. The seeded fire drills (seeded defect, seeded PII, seeded failing test) are genuinely good anti-handwave design.

### Persona roster + persona-template + persona-conduct-guard (15 personas, ~150KB)  [SIMPLIFY | M | persona]
- promised: Every dispatch seats a persona; conduct guard enforces declared anti-behaviors; controller-lock hard-stops subagents claiming controller seats.
- state: complete | tests: tested-green (persona-conduct-guard.test.mjs, 13.4KB guard)
- overlaps: expert-hiring (already generates personas on demand)
- detracts: mildly — install weight and doctrine to maintain
- why: The guard mechanism is solid and tested; the roster is the bloat. Fifteen ~10KB persona files ship with every install while conductor-standard mandates personas-on-every-dispatch — meaning ~150KB of prose whose behavioral delta over a 10-line role brief is unmeasured. Keep template + guard + 3-4 proven personas; generate the rest on demand via expert-hiring.

### Expediter + fable-conductor controller lock  [COMPLETE | S | persona]
- promised: CONTROLLER-ONLY seats belong to the main session; the long-horizon controller is references/personas/fable-conductor.md.
- state: partial | tests: tested-red via the self-audit — fable-conductor.md does not exist
- defects: Missing file is the sole cause of the red self-audit.
- detracts: no once the reference resolves
- why: The lock itself is implemented and tested in persona-conduct-guard; the referenced controller persona file was never written. Write it or point the reference at conductor-standard.md.

### Conductor standard (references/conductor-standard.md, 27KB)  [KEEP | S | doctrine-doc]
- promised: The field-proven orchestration canon: lanes, swarm-first dispatch, model cascade, edge-only gates, anti-patterns index.
- state: complete | tests: n/a
- why: Declared canon by the operator's own global config ('conductor-standard.md is canon'); it supersedes older clauses and carries the anti-patterns index that maps what it replaced. Heavy, but it is the constitution, and it is referenced rather than loaded inline.

### Loop suite / heartbeat loops (references/loop-suite.md, 26KB)  [SIMPLIFY | M | doctrine-doc]
- promised: Bounded single-iteration loops with budgets, leases, halt codes; a standing self-rearming heartbeat.
- state: complete | tests: n/a (doctrine only; no runnable loop runtime ships)
- detracts: mildly — 26KB of rules for a pattern currently exercised by nothing
- why: Field evidence: the goals/loops layer went dormant within 3 weeks with the queue bound to a finished milestone — the doctrine outlived its own use. Keep the bounded-wave rules (they inform orchestration); cut the standing-heartbeat section until something actually runs one.

### Evolve mode + vendored ASI-Evolve engine (engine/asi-evolve/, 272KB) + references/evolve-engine.md  [CUT | L | pipeline-stage]
- promised: A third mode: agent-driven evaluator search for measurable optimization items, consent-gated, score re-verified cold.
- state: complete | tests: untested in anger — no .evolve_runs/ exists here or in the field; the engine has never executed a run; its guard shipped dead to FFR
- overlaps: loop-suite's population-search fence (the ADR exists purely to reconcile the two)
- detracts: yes — a third top-level mode inflates every read of SKILL.md and shipped a dead guard to a real project
- why: An entire mode, a vendored 272KB engine, a hook, an ADR, manifest rows, and a pipeline diagram for a work-item shape (numeric scorer exists) that has not occurred once since the 2026-06-16 fold. Park it in a branch or a separate opt-in skill; restore when a scorer-shaped item actually arrives. The contract doc is good — cutting loses little because the vendored code is unmodified upstream.

### Review receipt (scripts/review-receipt.mjs + references/review-receipt.md, Ed25519-signed verdicts)  [SIMPLIFY | M | script]
- promised: A signed, re-judgeable attestation of a review verdict travelling with the change.
- state: complete | tests: tested-green (review-receipt.test.mjs) but never exercised — no key material exists anywhere in the repo
- overlaps: security-attestation.mjs (reuses the same signer), decision-log entries at CLOSE
- detracts: mildly
- why: Same designed-never-run pattern as the attestation ceremony (they share the signer). For a single-operator local workflow, a plain decision-log entry with the evidence hashes gives the tamper-evidence that matters; keep the script, drop it from the mandatory CLOSE step until a second party exists to verify a signature.

### Cross-session verify packet (scripts/verify-packet.mjs + references/cross-session.md)  [KEEP | S | script]
- promised: High-risk work verified in a separate session from a self-contained packet.
- state: complete | tests: tested-green (verify-packet.test.mjs)
- why: Small (3.3KB script), tested, and it is the honest implementation of cold-context isolation — unlike the crypto layers, its value does not depend on a ceremony ever being performed.

### Explain mode (references/explain-mode.md)  [KEEP | S | doctrine-doc]
- promised: Plain-language teaching with comprehension checks, available at every stage.
- state: complete | tests: n/a
- why: 6.5KB, zero runtime cost, referenced only on request; directly serves the non-expert half of the audience the Hearth bundle targets.

### Consent-gate model (4 moments: install, seat, deploy, irreversible)  [KEEP | S | other]
- promised: Autonomous execution, consent-gated side effects; one AskUserQuestion each with a liability line.
- state: complete | tests: partially enforced by tested hooks (visual-evidence-gate, persona-conduct-guard ask tiers)
- why: The product's trust proposition in one sentence; every stage hangs off it.

### resource-steward hook  [CUT | S | hook]
- promised: README table row: SessionStart stewardship memo, model-cascade nudge, compact nudge, per references/resource-stewardship.md.
- state: doc-only | tests: untested — neither hooks/resource-steward*.mjs nor references/resource-stewardship.md exists
- defects: hooks/README.md documents a hook and a reference file that do not exist; the eidolon-audit script does not scan README.md for references, so it escaped the gate.
- detracts: yes — a false claim inside the governance documentation itself
- why: A phantom: documented in the hook suite table of a repo whose whole pitch is 'no claim ships unverified'. Delete the row (and the /steward reference) or implement it; the README currently lies.

### process-doctrine + process-supervision + antibehavior-catalog docs  [MERGE | S | doctrine-doc]
- promised: Learned operating rules surfaced at session start; dev-process staleness doctrine; the unified drift catalog with per-row owning hooks.
- state: complete | tests: n/a; process-doctrine.mjs hardcodes its text inline and never reads the doc at runtime (README admits this)
- overlaps: conductor-standard discipline block restates done-is-the-outcome and supervise-by-state
- why: Three small docs with real content but drifting delivery: the hook and its doc can diverge silently. Fold process-doctrine.md's two rules into conductor-standard, keep the antibehavior catalog (it is the index the hooks are built against), and keep process-supervision (field-proven 2026-06-11).

### session-save / session-restore hooks  [KEEP | S | hook]
- promised: Save a run-state note at PreCompact, restore at SessionStart.
- state: complete | tests: untested (no dedicated test file; marked 'template' in README)
- why: Small, addresses a real failure mode (context trim losing run state), complements the journal discipline.

### SKILL.md itself (45.9KB, 719 lines)  [SIMPLIFY | M | other]
- promised: The single entry document: invariants, 3 modes, 11 setup stages, build + evolve pipelines, 30-item governance index.
- state: complete | tests: tested-red indirectly (the self-audit red is a SKILL.md reference)
- detracts: yes — a per-invocation context tax on the product's most-read artifact
- why: At ~46KB this loads into context on every invocation — roughly 11k tokens before any work begins, and the brief's own field data shows session-start cost already hurting. The governance table (130+ lines of one-line pointers) and the evolve pipeline could move to references/, leaving a ~20KB core. Referenced-not-restated is preached; apply it to the skill body itself.

### Hearth distribution bundle (projects/eidolon-work/Hearth)  [SIMPLIFY | M | hearth]
- promised: End-user distribution snapshot (welcome.ps1, Start Here.cmd, macos/, skills/) trailing the canonical repo.
- state: partial | tests: untested; the refactor journal (2026-07-09) records it as a stale re-mirror whose identity had to be rediscovered
- overlaps: the canonical repo — it IS the overlap
- detracts: yes when stale — users install an old eidolon
- why: A hand-maintained mirror that drifts by construction (ADRs 2026-06-14/16 both had to restate 'canonical home is the eidolon repo'). Replace with a build script that regenerates the bundle from canonical HEAD, or it will always trail. (Deep audit owned by another agent; verdict from evidence visible here.)

### eidolon-setup sister-skill coupling (Interview Mode reuse in SPECIFY and Stage 2.5)  [KEEP | S | setup]
- promised: Build mode's SPECIFY and the deploy-readiness interview reuse Setup's Interview Mode rather than re-implementing it.
- state: complete | tests: n/a (dependency present: ~/.claude/skills/eidolon-setup exists; separate audit in flight)
- why: Correct reuse rather than duplication, but it is an undeclared hard dependency — SKILL.md never states that build mode degrades without eidolon-setup installed. One sentence fixes it.


## agent
PRODUCT GOAL: The front door (README.md) says Eidolon is a Claude Code skill that sets up a repository so Claude understands it from the first message: point it at a repo and it generates a verified environment (CLAUDE.md, house persona, skills, subagents, two-layer governance, memory wiring) through 11 stages with human checkpoints; only SKILL.md reveals it is also a spec-driven build pipeline and an evolve mode.

SUMMARY: After 30 minutes at the front door: (a) partially answerable - README explains setup mode well but never mentions the build or evolve pipelines that are half of SKILL.md; (b) NOT answerable - there are zero installation instructions anywhere, and the README contains zero links and names no next file to read; (c) the /eidolon invocation is clear, but a real setup run dead-ends on four external dependencies (ai-pairing-playbook, MemPalace, codebase-memory-mcp, trust-but-verify) that have no source URL anywhere in the repo or CREDITS.md, which forces AMBIGUOUS results that the skill's own rules then use to block closeout. The product's two self-verification tools are both red on the shipped repo: node scripts/eidolon-audit.mjs fails on a missing file SKILL.md references (references/personas/fable-conductor.md), and node scripts/selfcheck.mjs fails twice on the repo's own encoding discipline - a serious credibility problem for a product whose one-line pitch is 'every generated command is checked against a second, independent signal.' The hooks/README table documents a resource-steward hook whose script, reference doc, and companion skill all do not exist. The README miscounts its own consent gates ('exactly four kinds of moment' vs six in SKILL.md) and lists three of five flags. Against that, the working core is genuinely strong: the hook suite is 133/133 tests green, the deny-layer floor matches its documentation exactly, and every other promised reference file (24 references, 15 personas, 19 decision logs, the vendored ASI-Evolve engine with license and provenance) exists on disk. The gap is almost entirely at the seam between the product and the outside world: install steps, dependency sources, and the two red self-checks - all S-cost fixes. The deepest structural risk for a new user is that the doctrine is self-referentially dense (anchor, seat, rail, Expediter, wing) with the only glossary buried unnamed in a 52.5K spec file that SKILL.md cites only as 'docs/spec design'.

### Installation path for the product itself  [COMPLETE | S | other]
- promised: README 'Use' section shows /eidolon as a working slash command
- state: doc-only | tests: n/a (grep of README.md, SKILL.md, docs/ found zero install instructions; no mention of copying to ~/.claude/skills/ or plugin install)
- defects: README has zero links and zero next-step pointers; it never even tells the reader SKILL.md exists
- why: A new user who clones C:/Users/strid/projects/eidolon cannot get from the repo to a working /eidolon command from anything written down; the only working install on this machine (~/.claude/skills/eidolon, byte-identical SKILL.md) exists by owner knowledge, not documentation. Question (b) 'how to install it' is unanswerable after 30 minutes.

### references/personas/fable-conductor.md (long-horizon controller persona)  [COMPLETE | S | other]
- promised: SKILL.md line 76 and the hooks/README persona-conduct-guard row both name it as a real controller-only persona file
- state: dead | tests: tested-red (node scripts/eidolon-audit.mjs: 'SKILL.md references a missing file: references/personas/fable-conductor.md'; the scripts test suite fails on exactly this assertion)
- detracts: yes - a verification-branded product whose own audit is red on clone undercuts its core claim
- why: The product's own audit tool catches this broken promise, and the failure is shipped red at the front door. Either write the persona file or strip the reference; the controller-lock hook logic that names it (persona-conduct-guard.mjs) is otherwise tested green.

### Recursive selfcheck (scripts/selfcheck.mjs)  [KEEP | S | other]
- promised: Verifies eidolon's own invariants in one command; 'eidolon runs against itself' (design spec section 10)
- state: complete | tests: tested-red (ran it: 'selfcheck: FAIL (2)' - em/en dashes in hooks/README.md and references/antibehavior-catalog.md violate its own encoding discipline, design spec section 13)
- detracts: yes while red - same credibility hit as the audit failure
- why: The tool works and is exactly the right idea, but it fails on the shipped repo state, so the first thing a curious newcomer runs prints FAIL. Fix the two dash violations (minutes of work) so the flagship self-verification claim holds.

### resource-steward hook (hooks/README.md table row)  [CUT | S | other]
- promised: SessionStart + PreToolUse token/resource stewardship hook, backed by references/resource-stewardship.md and a /steward skill
- state: doc-only | tests: untested (hooks/resource-steward.mjs MISSING, references/resource-stewardship.md MISSING, no /steward skill anywhere)
- overlaps: drift-guard (edit-count discipline) partially covers the same 'stop burning tokens' intent
- detracts: yes - a documented hook that does not exist erodes trust in the whole hook table
- why: One table row promises three artifacts and zero exist. The 133-test hook suite covers every other row; this row is pure vaporware inside the suite's own reference doc. Delete the row or build the hook; the row as-is is a newcomer trap.

### ai-pairing-playbook dependency (Stage 3 partner notes)  [SIMPLIFY | S | other]
- promised: Stage 3 copies ~/.claude/skills/ai-pairing-playbook/references/PARTNER-NOTES-template.md into the target repo; the pairing invariant says eidolon 'ships the playbook's partner-notes artifact'
- state: partial | tests: tested-red by inspection (the skill is NOT installed at ~/.claude/skills/ai-pairing-playbook on this machine; fallback prints 'AMBIGUOUS: install it' with no source named)
- detracts: yes - an unobtainable hard dependency in the default setup path
- why: The dependency has no URL, no CREDITS.md entry, and no repo location anywhere in the project - a new user literally cannot obtain it, so Stage 3 always ends AMBIGUOUS, which then blocks Stage 9 closeout by the skill's own rule. Vendor the one template file or name the source.

### codebase-memory-mcp dependency (Stage 8 MCP wiring)  [COMPLETE | S | other]
- promised: 'a real MCP server (a local C binary; 158 languages, sub-ms Cypher/trace queries)' installed, indexed, and wired as the PRIMARY structural orient source
- state: doc-only | tests: n/a (grep across README.md and SKILL.md: zero http/github links; not named in CREDITS.md; no install source exists anywhere in the repo)
- detracts: yes - a whole stage plus the PRIMARY orient leg dead-ends for anyone but the author
- why: Stage 8 and the codebase-memory-orient hook are built around a binary the documentation never tells you how to obtain. graphify at least gets 'pip install graphifyy'; this gets nothing. Either add the source and install command or demote graphify-orient to primary and cut Stage 8 to optional.

### MemPalace dependency (Stage 7 prose-memory leg)  [COMPLETE | S | other]
- promised: Dual-capture fan-out wires MemPalace prose capture on every commit
- state: partial | tests: n/a (SKILL.md itself says 'detect the real capture command; do NOT hardcode a guess' and falls to AMBIGUOUS; MemPalace is not in CREDITS.md and has no source pointer)
- why: Same class as codebase-memory-mcp: a load-bearing Stage 7 tool that is never defined or sourced for a newcomer. The memory-sync script's placeholder design is honest, but the doc must say what MemPalace is and where it comes from, or mark the leg optional-by-default.

### trust-but-verify skill reference (verification funnel invariant)  [SIMPLIFY | S | other]
- promised: INVARIANTS: 'REFERENCE trust-but-verify SKILL.md section "what verification MUST be" - do not restate'
- state: doc-only | tests: n/a (the file is not in this repo and no source is given; it exists only as a skill on the owner's machine)
- detracts: yes - the central discipline is unreadable from the product itself
- why: The single most load-bearing doctrine in the skill - what counts as verification - is delegated to an external document a new user cannot find. 'Do not restate' plus 'not included' equals undefined. Vendor the section or restate the three-line core.

### README accuracy vs SKILL.md (consent moments, flags, modes)  [COMPLETE | S | other]
- promised: README: 'pauses at exactly four kinds of moment' and three usage forms; describes setup mode only
- state: partial | tests: n/a (SKILL.md lists SIX consent-gate moments - install, seat, deploy, irreversible, dispatch-attestation, evolve-confirm - FIVE usage flags, and THREE modes including a whole build pipeline and evolve mode the README never mentions)
- detracts: yes - 'exactly four' is a checkable claim that is checkably false
- why: The front door undersells and miscounts the product. A newcomer answering 'what does eidolon do' from the README misses build mode entirely - roughly half the SKILL.md. One honest paragraph and two extra usage lines fix it.

### 'docs/spec design section 8/9' governance pointers  [SIMPLIFY | S | other]
- promised: Governance table cites 'docs/spec design section 8' (decision tree) and 'section 9' (uncertainty) as if they were a path
- state: partial | tests: tested-green after digging (sections 8 and 9 do exist, in docs/spec/2026-06-08-eidolon-swarm-retrofit-design.md, a 52.5K file whose name appears nowhere in SKILL.md)
- why: The content is real but the pointer is not a filename; a newcomer greps for 'design' and gets nothing actionable. Replace with the actual path. The same file also holds the only Glossary (section 3) for the project's heavy jargon (anchor, seat, rail, Expediter, wing) and nothing in README or SKILL.md points there.

### PowerShell hook mirror (output_shape 'hooks/*.ps1')  [CUT | S | other]
- promised: INVARIANTS output_shape: generated hooks ship as hooks/*.mjs + hooks/*.ps1
- state: doc-only | tests: n/a (zero .ps1 files exist anywhere in the repo; there is no PowerShell template for the generator to mirror)
- why: The invariant promises an artifact class the product has never produced an example of, on the author's own Windows machine no less. Either the .mjs hooks are cross-platform (they are - Node) and the .ps1 promise is dead weight, or the promise needs a template. Cut the clause.

### Eidolon's own dogfood wiring (.claude/settings.json)  [KEEP | S | other]
- promised: hooks/README describes a 'full suite' including SessionStart (seat-surface, security-surface, process-doctrine, orient trio, session-restore) and PreCompact (session-save) hooks
- state: partial | tests: tested-green at unit level (hooks: 133/133 pass) but the repo's own settings.json wires only four PreToolUse entries - no SessionStart, PostToolUse, or PreCompact wiring exists in the product's own repo
- why: Defensible as 'these are templates for targets', but the docs never say which hooks are live here versus template-only except in scattered row notes, and a newcomer cannot tell installed governance from aspiration. One 'wired here vs shipped as template' column in the hooks README resolves it.

### Governance hook suite (the working core)  [KEEP | S | other]
- promised: Two-layer floor: permission deny rules plus ~25 tested guard/surface hooks
- state: complete | tests: tested-green (ran node --test hooks/*.test.mjs: 133 pass, 0 fail; settings.json deny layer matches the documented floor verbatim)
- why: This is the strongest part of the product a newcomer can actually verify: every documented hook except resource-steward exists, parses, and passes real tests. The front door should lead with 'run node --test hooks/' as its proof-of-life - today it never mentions the tests exist.

### fraud-forensic-replay-primary.md in references/personas/  [CUT | S | other]
- promised: references/personas/ holds the product's built personas ('slice 1 ships the full-stack engineer')
- state: partial | tests: n/a
- why: A generated house persona for a specific user project (fraud-forensic-replay) is committed into the product repo alongside the 14 generic personas. It is target output, not product source, and confuses a newcomer about what ships versus what gets generated.


## agent
PRODUCT GOAL: A session-bootstrap skill ("Setup", sister to Eidolon): ask a few opening questions at the start of real work, calibrate register to the user's stated familiarity, optionally run a deeper Interview Mode, hand the answers to eidolon via .claude/session.yaml, and carry three plain-language operating disciplines (remember what worked/broke, verify claims before done, match the user's work style).

SUMMARY: The shipped product (6 prose files at ~/.claude/skills/eidolon-setup, HEAD 72672c8) is internally sound: it passes its own skill-audit gates (budgets 186/42/112/59/72 lines, hedge scan clean, zero machine paths, cross-pointers resolve), and its differentiators demonstrably worked once in the field — fraud-forensic-replay holds a richly populated .claude/session.yaml with a real two-wave interview whose ask-first gates a live hook now reads. The brief's premise needs one correction: the dev repo's HEAD is also 72672c8; what trails is the public remote (origin/main at 2b90903, 2 commits behind) plus an entire uncommitted layer — 4 governance hooks with .ps1 mirrors, a 14-case test suite, settings.json wiring, a skill-audit gate, two subagents, and CLAUDE.md exist only as untracked files. Those hooks pass 14/14 when run directly, but their settings.json wiring uses an "args" array no working hook on this machine uses; the bare-node fallback exits 1 non-blocking (verified), so the gates plausibly never block — the same DOA-wiring pattern as the field's advisor-guard, in a public repo whose own doctrine claims the commit gate "enforces for everyone." The SKILL.md also promises session-save/session-restore hooks it does not ship (they live, tested, in eidolon), the README trails two feature-commits, and the deployed canonical copy runs a dirty uncommitted description edit. The published text addresses its author in second person ("your dual-log-memory skill") and cites source-of-record names (dual-log-memory, ai-pairing-playbook) that resolve to nothing installed (the real skills are dual-log-doctrine and prompting-partnership). The three reference mirrors are the owner's third copy of doctrine already enforced by global CLAUDE.md and hooks, with a fourth copy of the pairing content sitting uncommitted in docs/working-with-claude.md. On the merge question: eidolon already consumes Setup by name in three places (SPECIFY reuses Interview Mode, Stage 2.5 reuses the familiarity calibration, explain-mode reads session.yaml), so Setup's unique ~120 lines are in practice a stage of eidolon. Recommend merging the questions/familiarity/interview/session.yaml layer into eidolon, keeping the three upstream skills as sources of record, and retiring the standalone sister repo whose maintenance cost (stale remote, dirty clones, ghost governance) is the clearest detraction found.

### Opening questions (4-question session bootstrap)  [KEEP | S | setup]
- promised: Four tap-to-answer questions at session start set which parts load and how careful to run (parts / go-ahead meaning / run-until / work type).
- state: complete | tests: n/a (prose skill) — field-validated: fraud-forensic-replay/.claude/session.yaml holds all four answers captured via AskUserQuestion
- defects: none found
- overlaps: README.md restates them (audited for agreement, by design)
- why: The core UX of the product, cheap, and it demonstrably ran in the one real deployment. It is the front door everything else hangs off.

### Familiarity calibration  [MERGE | S | persona]
- promised: One question (new / some / comfortable / expert) sets register and check-in frequency for the whole session; overridable any time.
- state: complete | tests: n/a (prose) — field session.yaml records familiarity: expert; eidolon's explain-mode.md and primary-persona.md read it
- overlaps: eidolon references/explain-mode.md §register and references/primary-persona.md Q1 (which says 'reuse Setup's familiarity calibration')
- why: It works and is genuinely consumed — but the consumer is eidolon (explain-mode register, Stage 2.5 persona interview both read it by name). The feature already lives in eidolon's docs in three places; it belongs there once.

### Interview Mode (6-question deeper track)  [MERGE | M | setup]
- promised: Opt-in one-question-at-a-time interview (what for / who / never / done / risk / boundaries), vague answers made checkable, written to the spec's six core areas + session.yaml.
- state: complete | tests: n/a (prose) — field-proven: fraud project ran a real two-wave interview 2026-06-10, folded into session.yaml intent block with per-wave tags
- defects: README.md never mentions it; the field session.yaml grew four intent keys (ready_signals, viewer, worst_failure, ask_first) the SKILL.md schema does not define — schema drifted silently in first contact
- overlaps: eidolon SKILL.md SPECIFY stage; eidolon docs/spec/2026-06-08-eidolon-swarm-retrofit-design.md specifies the identical feature
- why: This is the best feature in the product and the field artifact shows it produced genuinely load-bearing intent (never-do list, ask-first gates the startup-pulse hook now enforces). But eidolon's build pipeline already claims it verbatim ('SPECIFY: reuse recon and Setup Interview Mode', SKILL.md:635) — it is a stage of eidolon in practice and should be a stage of eidolon in fact.

### .claude/session.yaml handoff to eidolon  [KEEP | S | setup]
- promised: A small YAML file eidolon reads so the two skills cooperate without repeating themselves.
- state: complete | tests: n/a — second signal exists: fraud project's session.yaml is populated and its startup-pulse.mjs hook reads it at SessionStart
- overlaps: consumed by eidolon SKILL.md, explain-mode.md, and fraud project's startup-pulse hook
- why: The one integration contract between the two products, and the only Setup artifact a machine (not just a prompt) actually consumes. Whatever merges, this file format survives.

### Shared base (13 operating rules incl. the 5 'production-learned' from 72672c8)  [KEEP | S | doctrine-doc]
- promised: The rules stated once (double_check, before_done, before_reuse, done_means, look_first, say_what_ran, run_it, show_evidence...); references point home, never restate.
- state: complete | tests: n/a — the no-restatement rule is checkable and holds (references name rules and point home; verified by grep)
- defects: Written in second person to one specific human ('Your names for these', 'your dual-log-memory skill', 'your synthesis protocol') — a public repo (github.com/eidolonofficial/eidolon-setup) whose published text addresses its author
- overlaps: owner's global CLAUDE.md UNCERTAINTY PROTOCOL and hard gates (before_done = 'uncertainty protocol' by the skill's own admission); eidolon's conductor-standard done-is-the-outcome
- why: This is the product's actual payload and it is well built: single-sourced, under budget, honest. For the owner personally it is a third copy of global CLAUDE.md's hard gates, but as the public product's core it earns its place.

### remember part (references/remember.md, dual-log)  [MERGE | S | doctrine-doc]
- promised: docs/fixes + docs/insights dual log with before_reuse gating and retirement rules; plain-English face of dual-log-memory.
- state: complete | tests: n/a (prose) — field usage heavy: 42 files in fraud project docs/fixes, 20 in docs/notes following this convention
- defects: Cites source of record as 'dual-log-memory' but the installed skill is named dual-log-doctrine — the pointer does not resolve to anything on this machine by that name
- overlaps: installed dual-log-doctrine skill; global CLAUDE.md fix-log RULE; eidolon CLAUDE.md-template Memory block
- why: The convention is real and used hard in the field. But the owner now maintains this doctrine in four places: this file, the installed dual-log-doctrine skill (the stated source of record), global CLAUDE.md's fix-log rule, and eidolon's Memory section — one canonical home plus a pointer would do.

### check part (references/verify.md, trust-but-verify)  [MERGE | S | doctrine-doc]
- promised: Second-independent-signal verification, found/guessed/unsure labels, no-exemptions rule, code checklist; plain-English face of trust-but-verify.
- state: complete | tests: n/a (prose)
- overlaps: installed trust-but-verify skill (stated record); global CLAUDE.md UNCERTAINTY PROTOCOL + uncertainty-guard hook; field's redundant trust-but-verify hook
- why: Sound content, but on this machine the same policy is already mechanically enforced by global hooks (uncertainty-guard, blocker-guard) and stated in global CLAUDE.md; and the field evidence shows what happens when it gets re-instantiated downstream — the generated trust-but-verify hook in fraud-forensic-replay was advisory-only and duplicated the global blocking guard (confirmed redundant). One source of record (the trust-but-verify skill) plus pointers beats parallel restatements that spawn parallel enforcement.

### work-style part (references/collaborate.md: 6 habits, 3 lanes, watch words)  [MERGE | S | doctrine-doc]
- promised: Two-way pairing habits, work-lane calibration (routine/judgment/wrap-up), drift-tell watch-word catalog; plain-English face of ai-pairing-playbook.
- state: complete | tests: n/a (prose)
- defects: Cites 'ai-pairing-playbook' as source of record; the installed skill is prompting-partnership — another non-resolving pointer
- overlaps: installed prompting-partnership skill; C:/Users/strid/projects/eidolon-setup/docs/working-with-claude.md (near-duplicate, uncommitted); eidolon CLAUDE.md-template Pairing section
- why: Good content that exists in at least three copies: this file, the installed prompting-partnership skill (the real source of record, under a different name than cited), and the dev repo's uncommitted docs/working-with-claude.md which restates the same 6 shifts a third time for this very repo. The catalog belongs in one place.

### session-save / session-restore hooks section  [SIMPLIFY | S | hook]
- promised: SKILL.md: 'Two small hooks prevent losing your place' — save a note before context trim, restore at session start.
- state: doc-only | tests: untested here — the actual implementations live in the sister repo (eidolon hooks/session-save.mjs + session-restore.mjs, which ARE tested green there)
- overlaps: eidolon hooks/session-save.mjs, session-restore.mjs (implemented + tested there)
- detracts: how: it promises machinery the skill does not contain, which is exactly the 'promised vs implemented' gap the owner is auditing for
- why: eidolon-setup ships zero hooks; this section describes eidolon's hooks without saying so, so a reader of this skill alone expects a capability that does not exist in the package. One sentence pointing at eidolon, or deletion, fixes it.

### README.md (public face)  [COMPLETE | S | other]
- promised: Public description matching SKILL.md; CLAUDE.md rule: 'README and SKILL.md must agree'.
- state: partial | tests: n/a — passes the letter of skill-audit step 5 (the four questions and parts list match) but not its spirit
- why: It predates both headline features: no Interview Mode, no familiarity calibration, 'Status: early days' — the public face is two feature-commits stale on a product whose own doctrine forbids README drift.

### Governance hook suite (dev repo, UNTRACKED): protected-paths-guard, commit-quality-guard, doc-integrity-guard, hedge-guard + .ps1 mirrors + hooks.test.mjs  [COMPLETE | S | hook]
- promised: hooks/README.md: four gates protecting the published prose — block deletion of LICENSE/SKILL.md/references, block --no-verify and any force-push, keep fixes/insights append-only, advise on hedges.
- state: partial | tests: tested-green when run directly (I ran hooks.test.mjs: 14/14 pass) — but the wiring is untested and defective
- defects: settings.json 'args' key not in the working hook schema (guessed: entry rejected or bare-node exit 1 — DOA either way, verified for the bare-node branch); never committed; 4 .ps1 mirrors are speculative dual-platform support with zero consumers on a Node-equipped machine
- overlaps: commit-quality-guard duplicates the field's commit-quality-guard (which false-blocked --force-with-lease; here the block of --force-with-lease is at least intentional and tested); hedge-guard duplicates global uncertainty-guard
- detracts: how: the entire governance layer is uncommitted local-only files in a PUBLIC repo whose own CLAUDE.md claims 'the commit-quality-guard enforces this for everyone, including the gates' author' — the enforcement provably ran for no one
- why: The scripts are the best-engineered thing in either repo (BOM handling, META-exclusion for the watch-word catalog, honest advisory-vs-block design). But .claude/settings.json wires them as {"command": "node", "args": [...]}, a schema no working hook on this machine uses (the owner's firing global hooks all use a single command string); if args is ignored, bare node receives the payload and exits 1 with a SyntaxError (verified) — a non-blocking error, so no gate ever blocks. Same DOA-wiring pattern as the field's advisor-guard.

### skill-audit skill + /skill-audit command (dev repo, UNTRACKED)  [KEEP | S | script]
- promised: The repo's only quality gate: 9 steps — frontmatter, cross-pointers both ways, no-restatement, hedge scan, README agreement, line budgets, public hygiene, register spot-check, labeled report.
- state: complete | tests: n/a (prompt-skill) — I re-ran its mechanical steps against the deployed copy: budgets pass (186/42/112/59/72 vs 200/60/130), hedge scan clean except the exempted catalog line, zero machine paths, cross-pointers resolve
- why: Well-scoped, mechanically checkable, and it is the only thing standing in for a test suite; the deployed product actually passes it. Its only defect is that it exists nowhere but an untracked directory — commit it.

### verifier + prose-reviewer subagents (dev repo, UNTRACKED)  [CUT | S | persona]
- promised: Two ~33-line house subagents for verification and prose review of this repo.
- state: partial | tests: untested — no evidence either was ever dispatched
- overlaps: skill-audit steps 4+8; global trust-but-verify and humanizer skills
- detracts: how: adds roster surface to maintain with no recorded use — the same pattern as the field's never-run swarm machinery
- why: One-consumer abstractions duplicating capabilities the owner already invokes globally (/trust-but-verify, humanizer) and duplicating skill-audit's steps 4 and 8. Classic bolted-on roster inflation for a repo of six prose files.

### CLAUDE.md engineering doctrine + docs/working-with-claude.md (dev repo, UNTRACKED)  [SIMPLIFY | S | doctrine-doc]
- promised: Repo doctrine (budgets, register, no-restatement, append-only logs, /skill-audit as gate) plus partner notes on prompting.
- state: complete | tests: n/a (prose)
- overlaps: references/collaborate.md (same 6 habits, same three-proceeds, near-verbatim)
- why: CLAUDE.md is tight (57 lines) and correct — commit it. working-with-claude.md is a 134-line third restatement of the 6 shifts already published in references/collaborate.md and installed as prompting-partnership; keep one pointer, cut the copy.

### Standalone-product-vs-eidolon-stage (the merge question)  [MERGE | M | setup]
- promised: README: 'Eidolon sets up a repository so Claude understands it. Setup sets up a session inside it' — two sister products, coupled via session.yaml.
- state: partial | tests: n/a — coupling verified: eidolon names Setup in SKILL.md:635 (SPECIFY reuses Interview Mode), primary-persona.md:25 (reuses familiarity calibration), explain-mode.md (reads session.yaml)
- defects: Deployed copy (canonical-latest) has an uncommitted SKILL.md description edit that is live in the harness but recorded nowhere; the public remote never received commits 703ffe5 or 72672c8
- overlaps: eidolon SKILL.md setup+build modes; the three installed source-of-record skills
- detracts: how: two coupled repos, both dirty, doubling drift surface for one ~120-line feature — the maintenance cost is the detraction
- why: Eidolon cannot run its documented pipeline without Setup's content, and Setup's unique payload (4 questions + familiarity + interview + session.yaml schema) is ~120 lines; everything else in Setup mirrors three skills the owner already has installed. The standalone-repo overhead is already visibly unpaid: stale README, stale public remote (origin/main 2 commits behind both local HEADs), the deployed canonical copy running a dirty uncommitted description edit, and an entire uncommitted governance layer.


## agent
PRODUCT GOAL: Hearth is a consent-first, plain-language installer that takes a computer-nervous small-business owner from zero to a working Claude Code setup — the Setup and Eidolon skills installed instantly, with graphify and mempalace offered but never smuggled in.

SUMMARY: Hearth's shell is in better shape than its filling: the consent architecture, credits, and plain-language docs deliver exactly what the spec pledged, both installers parse clean, and the bundled hook tests pass from the vendored copy. The headline problem is the payload: skills/eidolon is a byte-faithful mirror (blob-hash verified) of canonical commit 81f0493 (2026-06-10), 29 commits and 7 days behind d42576e — it predates the dispatcher consolidation (397c0d0) and conductor-standard (0edf763) exactly as the ADRs claim, and it ships advisor-guard.mjs, the hook the same-day field audit found dead-on-arrival, plus the per-guard-process architecture the field audit costed. The re-mirror process is the root cause: no script exists, the procedure lives only in two commit messages, and the mirror source (eidolon-work/eidolon) is itself frozen at 81f0493. The installer works as specced for the instant-win skill copy, but the optional-tool flows fail on fresh machines: the Windows Store python stub passes the runtime check and then pip fails, and PATH is never refreshed in-session so even a successful uv install of mempalace reports 'did not finish' — with 'run Hearth again' as the only, identically-failing remediation. Hearth also never checks that Claude Code or the claude CLI exists, despite running `claude mcp add` and ending with 'Open Claude Code'. macos/Welcome.command is committed without the executable bit (mode 100644), so the advertised double-click first step fails guaranteed until the documented chmod fallback. HEARTH-SPEC.md is a stale 'draft for review' that still calls Eidolon 'one file' while the bundle ships 79, and its §13 build-verification ceremony left no artifact. The smallest honest Hearth: the two launchers and wizards (with the PATH/stub/exec-bit/claude-check fixes), the READ ME FIRSTs, CREDITS, the logo, skills/setup as-is, and a current-HEAD eidolon mirror produced by a small pinned-SHA script that also trims decision logs, internal specs, and test files from what lands in a novice's ~/.claude/skills — with HEARTH-SPEC either updated to describe what ships or moved to docs/history.

### Start Here.cmd (Windows launcher)  [COMPLETE | S | hearth]
- promised: Double-clickable launcher so novices never touch a .ps1; one-time single-file execution-policy bypass
- state: complete | tests: tested-green (traced: 5-line cmd correctly invokes welcome.ps1 with -NoProfile -ExecutionPolicy Bypass -File "%~dp0welcome.ps1")
- why: Does exactly what the spec promises in 5 readable lines. Nothing to add or remove.

### welcome.ps1 (Windows installer wizard)  [KEEP | M | hearth]
- promised: Calm guided flow: greeting, instant skill install, 5-W's cards for graphify/mempalace with yes/no/later, check-and-instruct runtimes, box breathing during waits, warm send-off
- state: partial | tests: untested by the repo; I parsed it clean this audit (2481 tokens, 0 parse errors). Spec §13 promises build-time syntax-parse + sandbox dry-run + diff — no such artifact or script exists anywhere in the repo
- defects: (1) Ensure-Runtime's Test-Have 'python' passes on the Windows Store app-execution-alias stub, so `pip install graphifyy` then fails with no diagnosis. (2) PATH is never refreshed in-session: after a successful `uv tool install mempalace`, the verify signal Test-Have 'mempalace' and the next step `mempalace init` both fail because ~/.local/bin isn't on the inherited PATH — on a fresh machine the mempalace flow can never succeed in one run, and the only remediation offered is 'run Hearth again', which repeats identically. (3) `claude mcp add` is run and the send-off says 'Open Claude Code' but the flow never checks the claude CLI or Claude Code exists at all. (4) Windows uses pip for graphify while macOS uses uv — the spec itself recommends the uv path.
- overlaps: macos/Welcome.command (parallel implementation, must be kept in sync by hand)
- detracts: the failure-loop defects actively detract: 'run Hearth again' as universal remediation violates pillar 4 in practice for the target user
- why: The skill-install half is solid and the consent posture is faithfully implemented. The optional-tool half has fresh-machine defects (see defects) that guarantee the exact failure mode the product exists to prevent: a novice stuck in a loop of calm errors.

### macos/Welcome.command (macOS installer)  [KEEP | S | hearth]
- promised: Same flow as Windows, double-clickable, Mac-friendly
- state: partial | tests: untested by the repo; bash -n clean this audit
- defects: Committed with git mode 100644 — no executable bit. Every clone/download yields a Welcome.command that CANNOT be double-clicked; the advertised first step fails 100% of the time until the user runs the chmod fallback the README pre-documents. Fix is one `git update-index --chmod=+x`. Same PATH-staleness issue as Windows after a fresh uv install.
- detracts: yes for the double-click promise — 'find the file and double-click it, that is the whole first step' is false on macOS as shipped
- why: Faithful port that is actually better than the Windows one (uses uv, avoiding pip/PEP-668). One committed defect defeats the headline promise.

### READ ME FIRST.txt (+ macOS variant)  [COMPLETE | S | doctrine-doc]
- promised: The calm, printable 5-W's guide for someone who reads before clicking
- state: complete | tests: n/a (prose); cross-checked against the installers — descriptions match actual behavior, including the chmod fallback
- why: Accurate, on-voice, and honest about what installs vs what is pointed to. One of the few docs in the whole eidolon ecosystem with zero drift from the code.

### README.md  [COMPLETE | S | doctrine-doc]
- promised: Repo front page: what Hearth is, how to start, what installs
- state: complete | tests: n/a; contents list verified against the actual tree — accurate, including the honest phrase 'the full Eidolon harness'
- why: Accurate and current, unlike the spec beneath it.

### HEARTH-SPEC.md  [SIMPLIFY | S | doctrine-doc]
- promised: The approved design spec Hearth was built to
- state: doc-only | tests: n/a; verified against the bundle — three contradictions found
- defects: spec-vs-bundle drift on the single most important number: what Eidolon is and how big it is
- detracts: mildly — it is the bundle's own 'no black boxes' pledge contradicted by its own spec
- why: Stale v1 draft shipped as if current: §6 says Eidolon is 'One file' (the bundle ships 79 files); §5's ship-list omits skills/ and macos/ entirely; status still reads 'draft for review. Nothing gets built until Jonah approves'; §13's build-time verification (sandbox dry-run, diff) left no artifact. A reader trusting the spec misjudges what actually installs.

### CREDITS.md (with-thanks gallery)  [COMPLETE | S | doctrine-doc]
- promised: Every contributor credited by linked handle, leads marked, bots excluded, Addy Osmani first
- state: complete | tests: n/a; structure verified — 66 graphify + 79 mempalace handles individually linked, leads marked, foundations pointed to their own thanks pages
- why: Fully delivers pillar 7 and is load-bearing for the product's identity (generosity of credit). Not bloat: it IS the differentiator.

### assets/EidolonLogo.png  [COMPLETE | S | other]
- promised: Jonah's own 1536x1024 logo staged in assets/
- state: complete | tests: verified: PNG image data, 1536 x 1024, 8-bit RGBA — exactly as specced
- why: Matches spec byte-for-byte in intent.

### skills/setup (the Setup skill)  [COMPLETE | S | persona]
- promised: Session-start questions, cross-session memory, self-verification; 4 files (SKILL.md + 3 references); renamed from basecamp per spec §14
- state: complete | tests: n/a (prompt skill, no runnable surface); frontmatter verified name:setup trigger:/setup, all 3 referenced files present
- why: Exactly the four files the spec promised, rename applied, internally consistent, and appropriately small. It points at github.com/gmrmk/* repos as 'source of record' — unverifiable from here but soft references only.

### skills/eidolon (the re-mirror snapshot)  [SIMPLIFY | M | pipeline-stage]
- promised: 'The full Eidolon harness: its skill, hooks, references, scripts, and its own spec and decision logs', current with the source repo per commit 6941a38
- state: partial | tests: tested-green for what it contains: vendored hooks/*.test.mjs pass (fail 0) run from the bundle this audit; byte-fidelity to canonical 81f0493 verified by blob hash (SKILL.md, lib.mjs, loop-suite.md identical; only .claude/settings.json and .gitignore dropped, by design per the commit message)
- defects: stale by 29 commits including the fixes for field-confirmed problems; carries a field-confirmed-dead hook; external skill dependencies unsatisfied by Hearth's own install
- overlaps: canonical ~/.claude/skills/eidolon (the live repo this mirrors)
- detracts: yes — shipping the buggy-era harness to the most vulnerable audience is the opposite of the product's safety pledge; the newer canonical also removed some of what the field flagged, but the bundle can't know that
- why: A faithful mirror of a stale commit. It snapshots 81f0493 (2026-06-10) and trails canonical HEAD d42576e (2026-06-17) by 29 commits: it predates the dispatcher consolidation (397c0d0, runSuite/guard-bash/guard-write — absent from the bundle) and conductor-standard.md (0edf763 — absent), confirming the ADR claim, plus settings-integrity, orient gates, security-awareness, the hardened memory-sync, and the 3x-larger loop-suite and antibehavior catalog. It ships advisor-guard.mjs — the exact hook the fraud-forensic-replay field audit found dead-on-arrival — and the pre-consolidation one-node-process-per-guard architecture the field audit flagged as the cost pattern. Its SKILL.md soft-depends on trust-but-verify and ai-pairing-playbook, which Hearth never installs, so the novice's first eidolon build run emits 'AMBIGUOUS: ai-pairing-playbook not installed - install it'.

### Re-mirror process  [COMPLETE | S | script]
- promised: Keeps skills/eidolon 'current with the source repo' (commit 6941a38); mirror 'verified by recursive diff'
- state: dead | tests: n/a — no script exists to test
- defects: process exists only as tribal knowledge in commit messages; mirror source repo is itself stale
- detracts: yes — it is the mechanism by which every future Hearth ships an ever-older Eidolon
- why: Entirely manual and undocumented outside two git commit messages. No mirror script exists anywhere under eidolon-work/ or the bundle; the mirror source is the sibling checkout eidolon-work/eidolon, itself frozen at 81f0493 while the live canonical sits at d42576e. This is the structural cause of the snapshot staleness: two manual syncs happened, then it silently stopped. A ~15-line script (git archive from canonical at HEAD, exclude .claude/.gitignore, record the pinned SHA in a MIRROR file) closes it.

### Optional-tool offers (5-W's cards + check-and-instruct + box breathing)  [KEEP | S | hearth]
- promised: Plain 5-W's card before every yes/no; never bundle third-party code; never silently install runtimes; calm animation during real waits only
- state: complete | tests: untested by the repo; logic traced this audit on both platforms — consent gates, later-option, runtime stop-and-instruct, and animate-only-while-job-runs all implemented as specced; winget IDs (astral-sh.uv, Python.Python.3.13) present as promised
- why: The consent architecture — the product's reason to exist after the base64 incident — is genuinely and consistently implemented on both platforms. Its failures are the PATH/stub defects charged to welcome.ps1, not to this design.

### Instant-win skill copy (Install-Skills / install_skills)  [SIMPLIFY | S | hearth]
- promised: Copy skills/ into ~/.claude/skills in the first few seconds; UTF-8 no BOM, LF endings, folder shape preserved
- state: complete | tests: untested by the repo; traced this audit — encoding/LF/no-BOM handling correct, per-file [ok] feedback, graceful degradation on every failure branch; welcome.ps1's own UTF-8 BOM (spec §13) verified by hexdump (ef bb bf)
- detracts: no, but it inflates the 'gift' with the maker's own meeting notes
- why: Mechanically correct, but it copies all 79 eidolon files — including 13 decision logs, 3 internal specs, and 6 *.test.mjs files — into a novice's ~/.claude/skills. The skill works identically without them; they are upstream repo housekeeping, not skill payload. The trimmed install (SKILL.md + references + hooks + scripts) is the smaller honest gift.

