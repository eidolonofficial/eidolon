# Eidolon: Swarm Retrofit Design Spec

- Date: 2026-06-08
- Status: draft for review. Nothing is implemented until this spec is approved.
- Scope: the Eidolon skill (eidolonofficial/eidolon) and its sister, Setup (eidolonofficial/eidolon-setup).
- Encoding: ASCII by intent. No em dashes. Source files ship UTF-8 (BOM only where Windows PowerShell must parse non-ASCII).

---

## 1. Intent

Today Eidolon reads a repository and writes a Claude Code environment across four phases and ten stages, gated by three operator checkpoints. This retrofit turns Eidolon from a single-pass generator into a spec-driven build line: a sequence of focused, verification-governed roles that take one change from intent to a shipped, recorded unit. Setup gains a conversational interview that captures what the user actually wants before any code is written.

The discipline is borrowed from three things the user already built and trusts: spec-driven-development (write the spec before the code), trust-but-verify (no claim ships on one signal), and a staged pipeline with an independent, cold-context verifier that cannot rubber-stamp the code it is judging. This spec ports those mechanisms into Eidolon using neutral engineering terms.

## 2. Goals and non-goals

**Goals**
- A spec-first pipeline: intent becomes a written spec, the spec drives the build, the build is verified against the spec before it ships.
- Security reasoning built into the build, not bolted on after: attacker and defender perspectives run while the harness is written, grounded in OWASP, CWE, and the existing trust-tree.
- A single orchestrating role (the solutions architect) that integrates every reviewer's findings plus the project's fix log, insight log, decision log, MemPalace, and Graphify into one coherent build.
- Verification that holds: every finding clears two independent signals, critical findings get root-cause analysis, and an unverifiable fix blocks closeout.
- Work that scales to its size: a one-file change does not summon the full pipeline.

**Non-goals (v1)**
- Eidolon does not write application features for the user. It builds the environment and the guardrails; the user owns the product.
- No cross-session relay (each role a separate Claude session). Roles are subagents under one orchestrator for v1.
- No live multi-agent peer messaging. Coordination is through durable artifacts on disk.
- Not a compliance certification. The security and trust-and-safety passes raise the floor and surface risk; they do not certify SOC 2, GDPR, or HIPAA.

## 3. Glossary

- **Orchestrator**: the repo-rooted session that drives the pipeline and owns the commit. The hook suite fires around it.
- **Swarm**: a set of subagents working the same role in parallel, each on a different slice of the problem.
- **Literal evidence**: the actual artifact a reviewer found or produced (the vulnerable line, a proof-of-concept, the hardening diff), not a summary of it.
- **The three logs**: fix log (`docs/fixes/`), insight log (`docs/insights/`), decision log (`docs/decisions/`). Append-only records of what broke, what worked, and what was decided.
- **Memory sync**: at closeout, git, MemPalace (prose memory), and Graphify (structural map) are updated together so all three agree on one HEAD.
- **Cold-context verify**: a verifier spawned with only the diff, the spec, and the rubric. It cannot inherit the optimism of the code it judges.
- **Two-signal rule**: a finding or a claim is a hypothesis until a second, independent signal confirms it.

## 4. Pipeline backbone

Eidolon's existing four phases are preserved and extended into a spec-driven, staged line. Each arrow is a checkpoint where a human can approve, edit, or stop.

```
  intent / work item
        |
   SPECIFY  (Setup interview + Eidolon recon)        -> the spec
        |   [gate 1: approve the spec]
   PLAN     (components, order, risks, parallel split) -> the plan
        |   [gate 2: approve the plan]
   TASKS    (dependency-ordered, each with acceptance + a verify step)
        |
   BUILD    (engineering swarm builds against the spec; TDD per task)
        |
   REVIEW   (red + blue + trust-and-safety + code-review swarms, in parallel)
        |
   SYNTHESIZE (solutions architect integrates all findings + the three logs)
        |
   VERIFY   (cold-context: rubric + two-signal + trust-tree scan) -> PASS | findings
        |   red and < 3 -> FIX (bounded loop); 3rd red -> re-plan, do not re-fix
        |   [gate 3: visual / runtime check; the user is the final eyes]
   SHIP     (ship-and-upload swarm: deploy-readiness interview, then deploy)
        |
   CLOSE    (commit of record + decision-log entry + handoff note + memory sync)
```

Load-bearing rules of the staged pipeline:
- **Verify is cold-context by construction.** It is spawned with only the diff, the spec, and the rubric, so it cannot inherit the build's reasoning. This is the two-signal rule turned into architecture.
- **The fix loop is bounded at three.** A third red means the plan was wrong. Re-plan; do not grind fixes. If the re-plan also fails, surface the open findings to the user. Never exhaust the loop and ship.
- **Only CLOSE commits.** Everything before it lives in the working tree, so the rollback for a bad run is the pre-run git state, stated before CLOSE runs.
- **Two human gates minimum** (approve the spec before tokens burn; visual or runtime check before commit), plus the plan gate for larger work.

## 5. Setup: Interview Mode

Setup keeps its four quick questions for fast starts. Interview Mode is an opt-in deeper track, conversational and low pressure: one question at a time, reflecting back what it heard, building a picture of how the user wants their program to work before any code exists. It surfaces assumptions instead of silently filling them.

It covers, in plain language: what the program is for, who uses it, what it must never do, what "done" looks like, where the risk lives, and the three-tier boundaries (always do / ask first / never do). It reframes vague wishes as testable criteria ("make it fast" becomes "first paint under 2.5s on a mid-range phone").

Output is durable, not just conversation: Interview Mode writes the intent into the spec's six core areas (objective, commands, structure, code style, testing strategy, boundaries) and writes a small `.claude/session.yaml` that Eidolon reads. Setup interviews; Eidolon builds; the file is the handoff.

## 6. The swarms

All swarms share one DNA: they follow the two-signal rule, they return literal evidence (never "I checked, looks fine"), and every finding carries `file:line`, a severity, and which signal caught it. They scale to the work (Section 12).

| Swarm | Role | Grounding |
|---|---|---|
| Engineering | builds against the spec, one task at a time, TDD per task | spec-driven-development, test-driven-development |
| Red team | attacks the work in parallel, each agent on a different attack surface | OWASP Top 10, CWE Top 25, the trust-tree detect branches |
| Blue team | hardens each layer the red team probes | the trust-tree verify branches and fix recipes |
| Trust and safety | checks harm, abuse, privacy and PII, accessibility, fairness | GDPR, CCPA, WCAG 2.2, the trust-tree privacy and a11y branches |
| Code review | optimizes and removes redundancy automatically | code-review and refactor discipline; behavior-preserving only |
| Ship and upload | runs a deploy-readiness interview, then deploys | shipping checklist; reuses Interview Mode |

Red and blue are a paired swarm: each red finding becomes a blue hardening task, and the pair is only closed when the blue fix passes the trust-tree `post_fix_verify` check (Section 7). The code-review swarm is behavior-preserving by contract: it may simplify and de-duplicate, but a change that alters behavior is a finding for the engineering swarm, not a silent edit.

## 7. The solutions architect

Above the swarms sits one synthesizing role. It does not react finding by finding. It ingests, in one pass: the red findings, the blue findings, the trust-and-safety findings, the code-review findings, plus the project's fix log, insight log, decision log, the attribution record, and the MemPalace and Graphify views. It produces one coherent build and one ordered disposition of findings.

Inputs are durable artifacts on disk, so the architect's view is reconstructable and the cold-context verifier can pick up from the same artifacts. The architect's output is itself reviewable: the plan it commits to is gated before BUILD continues.

## 8. Governance: the critical-issue decision tree

Ported from trust-but-verify, neutral-named. Severity is base times blast radius. Findings are sorted by that product and surfaced one at a time.

1. **Two signals or it is not a finding.** A candidate that has not cleared an independent second signal is a claim, not a finding, and does not enter disposition.
2. **A check that cannot verify is dropped, not shipped.** A trust-tree branch whose verify step only restates its detect step is dropped, and the gap is surfaced ("this branch has no usable verification step").
3. **HIGH and CRITICAL require root-cause analysis.** No symptom-only fix on a high-severity finding. The fix addresses the cause, confirmed by an independent signal.
4. **Every finding is surfaced one at a time** via AskUserQuestion, with a liability line: who is harmed if this is wrong, and what the legal exposure is. Never a typed menu.
5. **Bypass is double-gated on HIGH and CRITICAL.** Skipping verification on a high-severity finding requires a second confirmation that names the harm and the exposure, and is recorded as a bypass, counted separately from verified fixes.
6. **A bypass circuit breaker** halts the run if more than half of four or more findings are bypassed, and asks the user whether the bypasses are legitimate, the checks are mis-calibrated, or the discipline is slipping.
7. **An unverifiable fix blocks closeout.** If a fix cannot be re-verified in-session, the run cannot complete until the user acknowledges, and the record flags it for human re-review.
8. **Out of scope is escalated, not faked.** When a finding exceeds self-assessment (a real cryptographic review, a formal privacy assessment), Eidolon says so and recommends independent review.

## 9. Governance: the uncertainty protocol for a swarm

A swarm multiplies subagents, so the primary-versus-subagent split is load-bearing.

**Each subagent must:**
- Return literal evidence: the file excerpt, the tool output, the URL fetched and its response. Not a summary.
- Treat its own "I checked it" as a claim, not a signal.
- Do real work only. A subagent never edits or disables the hook suite and never rewrites git history; the orchestrator owns history and the guards.

**The orchestrator must:**
- State each conclusion, then name the second, independent signal that proves it. No second signal means it is a hypothesis.
- Inspect the subagent's literal evidence itself. The subagent's interpretation is not the signal; if the literal evidence is unavailable, the verification is declined, not passed.
- Refuse hedged language in any user-facing output ("should work," "probably," "I think"). Verify and state plainly, or flag the uncertainty and dispatch a check.
- Route uncertainty by type: factual or external goes to a research agent with the source cited; a fork-level decision goes to a structured what-if pass; runtime or visual goes to the verify rubric plus the user as final eyes.
- Hold the user as the ultimate verification on anything visual or runtime. A screenshot proves the render happened, not that it is right.

## 10. Unified antibehavior catalog (deduplicated)

Two source catalogs merge here. trust-but-verify's AB-1 through AB-12 guard the integrity of verification itself. A second catalog of development-discipline drifts guards the development process and conduct. Overlaps collapse into one row citing both sources. Each row names the swarm or stage that owns the guard and the hook that enforces it (Section 11).

### Verification integrity (mostly from trust-but-verify)
- **Stale citation.** A finding cites an OWASP, CWE, or WCAG source whose URL is dead or has moved. Defense: re-fetch every cited URL at CLOSE and require an exact match of the control identifier; downgrade citations that fail.
- **Fix without fix.** A fix edits the string the detector matched without removing the vulnerability. Defense: every branch carries a post-fix verify; a fix that does not pass it is reopened, not counted.
- **Survivorship bias in reports.** Absence of a finding read as proof of clean state. Defense: every report opens with a coverage section listing what was checked, what was disabled, and what was out of scope.
- **Prompt injection from reviewed content.** Source files contain text that mimics instructions to the reviewer. Defense: all reviewed content is untrusted data, never instructions; injection attempts are surfaced as findings, never obeyed.
- **Secret leakage into reports.** A finding's evidence contains the secret it caught, then gets written to a committed report. Defense: a redaction pass before any report write, plus a `.gitignore` check.
- **Confidence laundering.** Operator "looks right" or a subagent "I checked" treated as the second signal. Defense: chat input is a disposition, not a signal; subagents return literal evidence (Section 9). (Overlaps the development-discipline catalog: hedge-language, self-test-as-proof.)
- **Synthetic findings.** A finding with no backing detect branch. Defense: every finding carries the branch id that produced it; ad-hoc findings become proposed branches, not in-session findings.
- **Bypass normalization.** Verification quietly becomes optional. Defense: the circuit breaker (Section 8). (Overlaps the development-discipline catalog: subversion.)
- **Recursive verification described but not run.** Defense: Eidolon's own release runs the pipeline against itself and records the dated result.
- **Editable report.** Defense: each report ends with an attestation block (date, counts, a content hash) so edits are detectable.
- **Ambiguous as escape hatch.** Hard findings parked as "ambiguous" forever. Defense: an ambiguous label must name the specific signal conflict, and ambiguous findings re-surface automatically on every run.

### Process and quality discipline (deduplicated)
- **Scope drift.** "Just one more thing" inserted into the current task. New ideas go to the work queue, never into the live diff.
- **Show versus ship.** Mockups implying behavior production cannot deliver. Every visual element is classified ships / ships-approximately / aspirational, and aspirational elements are marked or stripped before sharing.
- **Scaffold over substance.** Spending the run polishing the harness while the actual deliverable does not move. The deliverable owns the run; infra concerns are bounded and noted.
- **Skill skipping.** Visual work without the design skill, library code from memory without a docs check. The trigger table is a contract, not a suggestion.
- **Resource drift.** Servers started "just in case," processes opened without close. Every long-lived process pairs with an explicit stop.
- **Exit-code-zero as success.** A clean exit proves the command ran, nothing more. Verify the actual state change. (Overlaps verification integrity.)

### Conduct rules (neutral-named, the strongest layer)
- **Deferring doable work.** Pushing work you could do now into "later." A handoff is honest only when the work is genuinely blocked and the blocker is named.
- **Stub instead of fix.** A placeholder where a fix belongs. Root cause or nothing.
- **Gate bypass.** Working around a check instead of through it. A wrong gate gets fixed in the open, not quietly routed around. This explicitly includes the hook suite: never disable, move, or chmod a hook, and never rewrite history to dodge one.
- **Unverified claim.** "Done," "works," "verified," "safe" without the second signal. State the signal or cut the claim.
- **Dismissing prior work.** Treating inherited records as bloat. Separate the prescription (which may be wrong) from the diagnosis under it (which may be true) before touching it. Refine inherited work; do not rewrite from scratch.
- **Irreversible op without a backup.** A hard-to-reverse operation run without an independent backup and a post-op verify. State the rollback path before running it, or do not run it.

### Record integrity
- **Erasure of the append-only record.** The fix log, insight log, and decision log are append-only. Operational rules can retire when they stop catching issues; the records never retire, cap, or auto-archive. No hook or skill auto-deletes a record; removal requires an explicit human decision. Improving how the record is reached (indexing, the graph) is welcome; reducing its content to save tokens is not.

## 11. The hook suite

Eidolon generates and wires these, neutral-named. Advisory hooks inject context; hard blocks exit non-zero.

| Hook | Event | Behavior |
|---|---|---|
| verification guard | PreToolUse (Bash, commit) | Blocks a commit message that claims a visual or runtime result works without evidence. The most insistent guard. |
| visual-evidence gate | PreToolUse (commit) | Blocks a commit that stages visual files without a fresh screenshot. |
| protected-paths guard | PreToolUse (Bash) | Blocks destructive ops on protected paths. |
| append-only record guard | PreToolUse (Write, Edit) | Reminds on a shrinking edit to any of the three logs; blocks silent deletion. |
| deletion guard | PreToolUse | Walls outright deletion of the records. |
| conduct guard | PreToolUse | Trips on deferring-doable-work, stub-instead-of-fix, and unverified-claim language. |
| commit-quality guard | PreToolUse (Bash) | Blocks `--no-verify`, `--force`, history surgery to dodge a hook. |
| hook-integrity guard | PreToolUse | Blocks disabling, moving, or chmod of any hook, or changing the hooks path. |
| drift guard | PreToolUse | Counts consecutive scaffold-only actions, resets on real deliverable work, blocks at the wall and points back to the file tree. |
| session save / restore | PreCompact, SessionStart | Saves the run state before context is trimmed; restores it on start, so a compaction never loses the thread. |
| memory sync | post-commit | Runs MemPalace mine plus Graphify update plus a synced-head sentinel on every commit. |

## 12. Scaling

The pipeline is tiered to the change so the cure does not become its own drift.

- **Trivial (one file, no new surface):** engineering builds, code-review tidies, verify runs. No security swarm, no architect synthesis.
- **Standard (a feature or a surface change):** add red, blue, and trust-and-safety swarms at small fan-out, plus the architect.
- **High-risk or broad (auth, payments, PII, public surface):** full fan-out, larger swarms, the full antibehavior pass, escalation to independent review where the trust tree says so.

The orchestrator picks the tier at PLAN and states it. A tier is a checkpoint decision the user can override.

## 13. Encoding and output discipline

- No em dashes anywhere in Eidolon output.
- Generated PowerShell that contains non-ASCII ships UTF-8 with a BOM, so Windows PowerShell 5.1 parses it correctly. Skill and doc files ship UTF-8 without BOM, LF endings.
- No base64-wrapped payloads. Everything Eidolon writes is legible plain text.
- An encoding check runs in the verify rubric (BOM and mojibake gate).

## 14. Reconciliations

- **Claim tags.** Eidolon's existing pipeline tags generated claims EXTRACTED, INFERRED, or AMBIGUOUS. trust-but-verify formally uses only AMBIGUOUS. This spec keeps Eidolon's three-tag taxonomy and states plainly that EXTRACTED and INFERRED are Eidolon's extension, with AMBIGUOUS carrying the same meaning and the same anti-escape-hatch rule (an ambiguous tag must name the signal conflict).
- **Naming.** Any mythic terms from the source mechanisms are translated to the neutral register in the glossary. The mechanisms are identical; only the names change.

## 15. Build path and open questions

**Build path**
1. Setup: add Interview Mode and the `session.yaml` handoff.
2. Eidolon: extend the ten stages into the spec-driven pipeline (Section 4), add the swarm dispatch and the architect synthesis role, wire the critical-issue decision tree and the uncertainty split.
3. Generate the neutral-named hook suite and the unified antibehavior catalog as Eidolon outputs.
4. Validate the pipeline against itself: a canary run on a small change, plus a seeded-defect drill that confirms the cold-context verifier catches a known fault with the right `file:line`.

**Open questions**
1. Do the swarms run as in-session subagents (v1) or graduate to separate sessions for true cold context? v1 is in-session with a cold-context verifier; cross-session is deferred.
2. Model tier per role: all high-tier for hand-off fidelity, or tier down the bulk swarm workers? To resolve during planning.
3. Where the unified antibehavior catalog and hook suite live: shipped inside Eidolon, or emitted into each target repo. Recommendation: both. Eidolon ships the full catalog; it emits a tailored subset into each target repo. The subset boundary is confirmed during planning.

---

## 16. Swarm skill loadout

Each swarm carries a named toolkit. Installed skills come first, then Addy Osmani's public repos that strengthen a swarm, with license and attribution.

### Correction on the multi- skills (verified)

The multi- set is a multi-model build harness, not a defensive one. Claude orchestrates and is the sole filesystem writer; Codex is the backend authority and Gemini the frontend authority, both with zero write access. Verified placements:

- multi-backend, multi-frontend, multi-workflow: engineering (build execution)
- multi-plan: solutions architect (planning only, never touches code)
- multi-execute: code-review (its post-change Codex-plus-Gemini audit-and-fix loop)

They are not blue-team tools. Blue team is bolstered with real defense instead.

### Installed-skill loadout

- **Engineering**: test-driven-development, systematic-debugging, debugging-and-error-recovery, incremental-implementation, spec-driven-development, source-driven-development, api-and-interface-design, context-engineering, docs-lookup, the language build and review pairs, frontend-design / ui-ux-pro-max, react-best-practices, typescript-advanced-types, multi-backend, multi-frontend, multi-workflow.
- **Red team**: security-review, security-and-hardening, semgrep, offensive-osint, osint-methodology, trust-but-verify (detect branches).
- **Blue team** (real defense): security-and-hardening, security-reviewer, semgrep, quality-gate, code-review, the language reviewers under a hardening lens, plus multi-execute's audit-and-fix loop when execution muscle is wanted.
- **Trust and safety**: a11y-architect, design:accessibility-review, trust-but-verify (privacy and a11y branches), 8-habit-ai-dev eu-ai-act-check / security-check / whole-person-check, legal compliance-check / legal-risk-assessment, and a built-in trust-and-safety and disability-law review persona.
- **Code review**: code-review, simplify, code-simplification, refactor-clean, performance-optimization, comment-analyzer, type-design-analyzer, silent-failure-hunter, pr-test-analyzer, test-coverage, finding-duplicate-functions, multi-execute.
- **Ship and upload**: shipping-and-launch, deploy-guide, monitor-setup, ci-cd-and-automation, git-workflow-and-versioning, review-pr, e2e-runner, verify, run.
- **Solutions architect**: architect / code-architect, planning-and-task-breakdown, multi-plan, documentation-and-adrs, graphify, mempalace, what-if-oracle, consciousness-council.
- **Setup Interview Mode**: brainstorming, prompting-partnership, request-refactor-plan, spec-driven-development.

### Addy Osmani fold-ins (verified URLs and licenses)

The pattern grows from his agent-skills harness, so folding his public work in is natural. Permissive repos are foldable with attribution; one is reference-only.

- **agent-skills** (MIT) https://github.com/addyosmani/agent-skills. Lifecycle commands (/spec /plan /build /test /review /code-simplify /ship) and three personas: code-reviewer, test-engineer, security-auditor. The personas map onto the swarms directly, and the security-auditor feeds red and blue. Structural reference for the whole pipeline. Strengthens: engineering, code-review, red, blue, ship.
- **web-quality-skills** (MIT) https://github.com/addyosmani/web-quality-skills. Skills over 150-plus Lighthouse audits plus Core Web Vitals (performance, a11y, SEO, best practices). Strengthens: ship-and-upload, code-review; the a11y audits feed trust-and-safety.
- **agent-engineer** (Apache-2.0) https://github.com/addyosmani/agent-engineer. AI-agents engineering course. Strengthens: engineering (reference).
- **learning-jsdp** (MIT) https://github.com/addyosmani/learning-jsdp. Current design-pattern examples. Strengthens: solutions architect.
- **essential-js-design-patterns** (CC BY-NC-ND) https://github.com/addyosmani/essential-js-design-patterns. The book source. Reference only: non-commercial, no-derivatives, so it is read, never adapted or redistributed. Strengthens: solutions architect (reference).
- Engineering performance toolkit: **critical** (Apache-2.0), **squish** (MIT), **timing.js** (MIT), **tmi** (Apache-2.0), **puppeteer-webperf** (Apache-2.0). Noted but low value: **psi** (archived), **webpack-lighthouse-plugin** (deprecated). **loadCSS** (MIT) is a fork. **quicklink** (Apache-2.0) is GoogleChromeLabs-owned and folds from that org, not his account.

### Attribution and licensing discipline

Every folded or modeled-on repo is credited in the target repo's CREDITS, with its license named. MIT and Apache repos may be adapted with attribution; CC BY-NC-ND is reference-only; archived or deprecated repos are flagged; org-owned repos are folded from the owning org. This is the same consent-first, credit-everyone rule the rest of the project runs on.

---

## 17. Per-swarm hardening (defense in depth)

Every swarm carries the same anti-handwave pattern as the security pass, tuned to its own job, so no swarm can save time by skipping its work. The swarms also complement each other: each produces a coverage manifest, each link is independently gated, and the architect's synthesis plus the ship gate require every upstream manifest to be clean. A check one swarm misses is caught by another swarm's self-proof or by the cross-stage gates. This is defense in depth applied to the pipeline, not a single chokepoint.

### The shared hardening pattern (every swarm carries all five)

1. **Named failure mode.** What handwaving looks like for this swarm, stated so it can be guarded.
2. **Evidence requirement.** The literal artifact the swarm must hand over, not a summary.
3. **Coverage manifest.** What it checked, what it confirmed clean, and what it did not run and why. Absence of a finding is never read as clean.
4. **Self-proof (fire drill).** A seeded check that proves the swarm actually works before its results are trusted.
5. **Closeout gate.** What blocks the build if this swarm handwaved. A hook enforces it, so the gate is a machine, not a promise.

### Per-swarm instantiation

| Swarm | Handwaving looks like | Evidence it hands over | Self-proof (fire drill) | Blocks closeout |
|---|---|---|---|---|
| Setup interview | silently filling ambiguous requirements | the six spec areas, vague wishes reframed as testable criteria, surfaced assumptions confirmed | a vague answer must trigger a clarifying question, not a silent fill | spec gate: the build does not start until the six areas are concrete and approved |
| Engineering | stub instead of fix; "works" with no test; TDD bypass | per task, a test that was red before the change and green after; the build matches the spec's acceptance criteria | a seeded failing test must actually fail before implementation (proves test-first) | no task closes without its acceptance test green and red-first; stubs and NotImplementedError block |
| Red team | synthetic findings; "looks vulnerable"; skipped categories | a reproducible proof-of-concept or the exact line plus exploit path per finding | a planted vulnerability must be caught at the right file:line | coverage manifest plus a passed fire drill required; findings without evidence do not ship |
| Blue team | fix-without-fix (hardening the matched string, not the vulnerability) | post-fix verify passes on a signal independent of detect; the hardening diff | a cosmetic fix (rename the matched variable) must still FAIL post-fix verify | no fix counted unless post-fix verify passes; a failing fix is reopened |
| Trust and safety | survivorship bias: "no issues" with no coverage stated | per category (PII, a11y, harm, abuse, fairness) the literal check and result; the WCAG criterion plus the failing element | a seeded PII-in-logs line and an unlabeled input must be caught | the T&S manifest is required; high-severity harm or PII findings block |
| Code review | a behavior-changing edit disguised as a cleanup | the test suite green identically before and after; a diff of what was simplified or deduped | a planted behavior change must trip a test failure (proves the suite guards behavior) | no refactor ships unless the suite is green identically before and after; behavior changes go to engineering as findings |
| Solutions architect | dropping a swarm's findings; cherry-picking | a disposition table: every finding from every swarm with its disposition, traceable to its source | a planted critical finding must appear in the disposition, never silently dropped | no build closes with an un-dispositioned finding; the bypass circuit breaker applies |
| Ship and upload | "ready" with no checklist; shipping on red gates | the deploy-readiness checklist, each item with its literal signal; the interview answers | a seeded missing env var or a staged secret must block the ship gate | no deploy unless every item is green with evidence and all upstream manifests are clean; the user is the final eyes |

### How the hardenings complement each other

- Engineering produces the artifact; red, blue, trust-and-safety, and code-review each attack or harden it from a different angle, so a flaw that slips one lens meets another.
- Blue's post-fix verify re-runs red's own detection, so a fix is closed only when the attacker's check no longer fires.
- Code-review's behavior-preserving proof protects against a cleanup silently breaking what the other swarms verified.
- The architect's disposition table forces every swarm's findings into one accounted-for ledger, so nothing is dropped between swarms.
- The ship gate refuses to deploy unless every upstream manifest is clean, making the chain only as shippable as its weakest verified link.

Each manifest and each fire drill is itself a generated artifact carrying `last_verified`, so the hardening is auditable after the fact, not just claimed in the moment.

---

## 18. Security swarm: methodology, tooling, and anti-handwave enforcement

The red and blue swarms run named, current methodologies and real tools, not vibes. Every standard and tool below was verified against its primary source on 2026-06-08; versions are pinned because these standards move.

### Red-team methodology (the attacker checklists)

- **OWASP Web Security Testing Guide (WSTG).** The twelve test categories are the red swarm's coverage map, one agent per category: information gathering, configuration and deployment, identity management, authentication, authorization, session management, input validation, error handling, weak cryptography, business logic, client-side, API. https://owasp.org/www-project-web-security-testing-guide/
- **OWASP Top 10.** Tag every finding against BOTH 2021 and 2025 during the transition. The canonical URL now serves 2025, where SSRF is folded into Broken Access Control and Software Supply Chain Failures is new at A03. https://owasp.org/Top10/
- **MITRE ATT&CK** as the threat model. Each red agent maps its actions to a tactic and technique (TA and T identifiers) across the fourteen Enterprise tactics, giving a shared kill-chain coverage map. https://attack.mitre.org/
- **OWASP API Security Top 10 (2023)** for API-heavy repos (broken object-level authorization and the rest). https://owasp.org/API-Security/

### Blue-team methodology (the defender pass/fail rubric)

- **OWASP ASVS v5.0.0** (17 chapters, current; not the old V1 to V14 layout) is the verification rubric, run at level L1, L2, or L3 by the risk tier of the change. https://owasp.org/www-project-application-security-verification-standard/
- **NIST SSDF (SP 800-218)** practice groups (Prepare the Organization, Protect the Software, Produce Well-Secured Software, Respond to Vulnerabilities) map the swarm onto a recognized secure-SDLC frame.
- **OWASP Proactive Controls (2024)** and the **Cheat Sheet Series** are the per-finding fix recipes the blue agents apply.

### Tooling (verified, current, licensed)

Real scanners, not described checks. Two tools (Trivy, Checkov) each span several categories, so stages collapse onto them.

- **SAST:** Semgrep (LGPL-2.1, 30-plus languages), Bandit (Python), gosec (Go), eslint-plugin-security (JS). Brakeman (Rails) has a dual commercial-split license; check terms before commercial use.
- **Secret scanning:** gitleaks (MIT, feature-frozen) paired with trufflehog (which verifies live credentials).
- **Dependencies and SCA:** osv-scanner, Trivy, grype, plus native npm audit, pip-audit, cargo-audit.
- **DAST and recon:** OWASP ZAP baseline (CI-safe spider plus passive scan), nuclei (template-based).
- **IaC and container:** Checkov and `trivy config`. tfsec is deprecated and superseded by Trivy; it is not used for new work.
- **Supply chain:** OpenSSF Scorecard and syft (SBOM generation).

**License isolation rule.** trufflehog is AGPL-3.0 and Brakeman is dual-licensed. Both are invoked as isolated subprocesses, never linked into the swarm, consistent with the project's existing AGPL subprocess rule. Brakeman's terms are checked before any commercial use.

### Anti-handwave enforcement (how you stay certain it ran)

The security pass cannot reach closeout unless all five hold. This is Section 17's pattern, deepened for security.

1. **Coverage manifest.** The pass emits the list of every WSTG category and every ASVS chapter it ran, what each found, what it confirmed clean, and what it did not run and why. Absence of a finding is never read as clean.
2. **Seeded-defect fire drill.** Before the real pass, a known defect is planted (a SQL injection, a hardcoded secret) and the red swarm must catch it at the right `file:line`. A miss halts the run; the swarm is not trusted until it proves it can detect.
3. **Literal evidence per finding.** A reproducible proof-of-concept, or the exact line plus the OWASP or CWE identifier and the exploit path. No "looks vulnerable."
4. **Independent post-fix verify.** Every blue fix re-runs the red detection and the ASVS check on a signal independent of the one that made it. A cosmetic fix that renames the matched variable must still fail the verify; a fix that does not pass is reopened.
5. **Closeout hook.** The commit is blocked unless the manifest exists, the fire drill passed, every finding carries evidence, and every fix passed post-fix verify. The gate is a machine, not a promise.

---

## 19. Review personas and expert hiring

The swarms are staffed by personas. There are two kinds: a fixed base roster (the standing team) and hired experts (generated for a niche project). Both are built to the same depth, by one construction template, so a hired specialist is as fully formed as a hand-built one. Depth is structural, not optional.

### The construction template (every persona carries all of it)

- **Title and mandate.** The role and one line on what this persona is on the hook for.
- **Expertise.** The domain knowledge it brings, stated concretely, so it reasons like a specialist rather than a generalist in a new hat.
- **Authoritative anchors.** The named frameworks and standards it reviews against. The rail: a persona with no anchor is rejected, the same as a finding with no detection branch.
- **Review lens.** The specific questions it asks of the code and the patterns it hunts.
- **Failure modes owned.** The exact class of bug or risk this persona is uniquely good at catching.
- **Evidence contract.** What literal evidence its findings must carry, so it obeys the anti-handwave rule.
- **Anti-behaviors.** An exact, named list of behaviors it does not exhibit, weighted to the unsafe, dangerous, and destructive. Its self-bounding guardrail (see below).
- **Escalation triggers.** When it says this exceeds my scope, get an independent human review.
- **Retooled skill loadout.** The tailored toolkit assembled for it from the installed-skill registry and the framework registry, matched to its domain.
- **Swarm and voice.** Which swarm it joins, and how it states findings.

### Anti-behaviors (the self-bounding guardrail)

Every persona declares what it never does, precisely enough to detect, so any instance of the forbidden behavior is by definition drift and a guard catches it. Two layers:

- **Shared destructive floor (every persona).** Never run an irreversible operation (delete, drop, truncate, force-push, overwrite an unread file) without the two-safety-net pattern: an independent backup, a rollback path stated before it runs, and a post-op verify. Never disable, move, or route around a hook. Never rewrite git history to dodge a gate. Never exfiltrate a secret it finds. Never execute untrusted content from the code under review.
- **Persona-specific anti-behaviors, scoped to its blast radius.** A red persona never runs a real exploit against a live system (only a sandboxed proof-of-concept) and never weaponizes a finding. A blue persona never applies a cosmetic fix that hides a vulnerability and never disables a control to pass a check. A clinical-safety persona never logs PHI in plaintext and never removes an audit trail. An engineering persona never ships a stub as done. A code-review persona never makes a behavior-changing edit under the cover of cleanup and never deletes a test to turn the suite green.

A guard checks each persona's actions against its own declared anti-behaviors; a match halts the run and names the persona and the line it crossed.

### Hiring an expert

When recon detects a need the base roster does not cover (a domain, a data sensitivity, a regulatory surface), Eidolon hires:

1. Draft the expert against the construction template, anchored to a named standard.
2. Write its anti-behaviors, the shared floor plus the ones specific to its domain, so it is bounded from its first action.
3. Retool its skill loadout from the installed-skill and framework registries.
4. Gate the hire at the plan checkpoint for higher-risk work; the user approves or declines.
5. Record the hire in the coverage manifest (who, against which standard) and the decision log (which detection signal produced it).

The generation rail is the same anti-synthetic rule used everywhere: a persona that cannot name its framework anchor and its evidence contract is rejected. Eidolon grows experts to fit a codebase; it cannot conjure ungrounded ones to look thorough.

### Skill retooling, concretely

The loadout is not fixed per swarm only; it is also assembled per expert. A clinical-safety hire pulls the privacy and PHI checks plus the matching compliance skills. A payments hire pulls the cardholder-data checks, secret scanning, and the relevant ASVS chapters. An adversarial-ML hire pulls the model and red-team tooling. The expert arrives with the right tools already in hand.

### Three layers of drift-catching

Anti-behaviors nest with the rest, so drift is caught at every granularity:

- the pipeline-wide antibehavior catalog (Section 10),
- each swarm's anti-handwave hardening (Section 17),
- each persona's own anti-behaviors, base or hired.

### Status

The base roster, and the exact field shape of the construction template, are reconciled against a set of existing hand-built personas (generalized, no source named). The mechanism above is fixed; the base roster content folds in once that reconciliation completes.
