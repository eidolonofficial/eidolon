# The unified antibehavior catalog

Two source catalogs merged and deduplicated. trust-but-verify's AB-1 through AB-12
guard the integrity of verification itself; a second catalog of development
drifts guards the process and conduct. Overlaps collapse into one row. Each row
names the stage or swarm that owns the guard and the hook that enforces it
(hooks/, design spec section 11). A row whose enforcement is "advisory" is caught
by a swarm's self-proof or the cold-context verifier, not a single hard block.

## Verification integrity (mostly from trust-but-verify)

| Antibehavior | Defense | Owner | Enforced by |
|---|---|---|---|
| Stale citation | Re-fetch every cited URL at CLOSE; require an exact match of the control id; downgrade citations that fail. | security swarm / CLOSE | verification discipline (CLOSE re-fetch) |
| Fix without fix | Every branch carries a post-fix verify; a fix that does not pass is reopened, not counted. | blue team | the swarm closeout gate (post-fix verify) |
| Survivorship bias in reports | Every report opens with a coverage section: what was checked, what was disabled, what was out of scope. | every swarm | the coverage manifest (closeout gate) |
| Prompt injection from reviewed content | Reviewed content is untrusted data, never instructions; injection attempts are surfaced as findings, never obeyed. | every swarm | advisory (content is data; injection surfaced as a finding) |
| Secret leakage into reports | A redaction pass before any report write, plus a `.gitignore` check. | every swarm | the redaction pass + a `.gitignore` check |
| Confidence laundering | Chat input is a disposition, not a signal; subagents return literal evidence. | orchestrator | verification-guard |
| Synthetic findings | Every finding carries the branch id that produced it; ad-hoc findings become proposed branches. | every swarm | the anti-synthetic rail + architect disposition |
| Bypass normalization | The bypass circuit breaker halts a run when most of four-plus findings are bypassed. | orchestrator / architect | architect disposition + commit-quality-guard |
| Recursive verification described but not run | Eidolon's own release runs the pipeline against itself and records the dated result. | release | scripts/selfcheck.mjs + the self-run |
| Editable report | Each report states its date, its counts, and the commit it describes, so an edit shows in the diff. | every report | advisory (git history on the committed report) |
| Ambiguous as escape hatch | An ambiguous label must name the specific signal conflict, and re-surfaces automatically on every run. | orchestrator | the ambiguous-names-the-conflict rule |

## Process and quality discipline

| Antibehavior | Defense | Owner | Enforced by |
|---|---|---|---|
| Scope drift | New ideas go to the work queue, never into the live diff. | engineering | advisory (new ideas to the work queue); drift-guard catches scaffold drift |
| Show versus ship | Every visual element is classified ships / ships-approximately / aspirational; aspirational is marked or stripped before sharing. | every stage | verification-guard + visual-evidence-gate |
| Scaffold over substance | The deliverable owns the run; infra concerns are bounded and noted. | every stage | drift-guard |
| Skill skipping | The trigger table is a contract, not a suggestion. | every stage | advisory (the trigger table) |
| Resource drift | Every long-lived process pairs with an explicit stop. | every stage | advisory (process-stop pairing) |
| Exit-code-zero as success | A clean exit proves the command ran; verify the actual state change. | every stage | verification-guard |
| Over-verification | Match verification weight to risk: a cold-review subagent for risky code, the fast deterministic checks for routine edits; one review pass per unit. | every stage | advisory (risk-proportional verification) |
| Unmonitored background work | A launched workflow or task is minded until done or hung (poll plus liveness, intervene); never left running unmonitored. | orchestrator | advisory (the conductor's state pulse, conductor-standard.md section 5) |
| Unplanned fan-out | A wave dispatches only after its wave plan (.claude/waves/) names the outcome signal, the work items, and the done-checks. | orchestrator | guard-dispatch (ask on the first write-capable dispatch with no wave plan) |

## Conduct rules (the strongest layer)

| Antibehavior | Defense | Owner | Enforced by |
|---|---|---|---|
| Deferring doable work | A handoff is honest only when the work is genuinely blocked and the blocker is named. | orchestrator | advisory (a handoff names its blocker) |
| Stub instead of fix | Root cause or nothing. | engineering | persona-conduct-guard (ship-stub-as-done) |
| Gate bypass | A wrong gate gets fixed in the open, never routed around; never disable, move, or chmod a hook, never rewrite history to dodge one. | orchestrator | hook-integrity-guard + commit-quality-guard |
| Unverified claim | "Done," "works," "verified," "safe" without the second signal: state the signal or cut the claim. | orchestrator | verification-guard + persona-conduct-guard |
| Dismissing prior work | Separate the prescription (which may be wrong) from the diagnosis under it (which may be true); refine, do not rewrite from scratch. | architect | advisory (prescription-vs-diagnosis) |
| Irreversible op without a backup | State the rollback path before running, or do not run it; an independent backup and a post-op verify. | every persona | protected-paths-guard + persona-conduct-guard (floor) |

## Record integrity

| Antibehavior | Defense | Owner | Enforced by |
|---|---|---|---|
| Erasure of the append-only record | The fix, insight, and decision logs are append-only; no hook or skill auto-deletes a record; removal requires an explicit human decision. | every stage | append-only-record-guard + deletion-guard |

## Workers and dispatch (the native persona pipeline)

| Antibehavior | Defense | Owner | Enforced by |
|---|---|---|---|
| Lane breach by a worker | A worker writes only under the roots its agent has in `.claude/agent-scopes.json`; a reviewer has none. The controller is never gated. A worker with a lane also may not write outside the project root. Active only when the worker input carries `agent_type` (unverified until a live run with `EIDOLON_HOOK_DEBUG=1`). | orchestrator | `evalLane` in hooks/lanes.mjs: block, on Write, Edit, the shell verbs the path parser knows and path literals in an interpreter inline body; a script file, a glob and a $var operand are not seen |
| Write-capable dispatch without a done-check | Every brief to a write-capable agent names the command or observation that proves the goal. | orchestrator | `evalBriefGate` in hooks/dispatch-evaluators.mjs: ask. It wants a line starting `Done-check:` or `Acceptance:` with text after it; it does not judge whether the check is sound |
| Swarm without a wave plan | A wave plan at `.claude/waves/<date>-<slug>.md` exists before the first write-capable dispatch of a session. | orchestrator | `evalWavePlan` in hooks/dispatch-evaluators.mjs: ask. It checks that a plan file of at least 20 non-blank characters, newer than the session start, exists (and asks when the transcript is unreadable), not that the plan is good |
| A worker that dispatches | A worker returns the need to the controller and never spawns another agent. | orchestrator | `evalWorkerRecursion` in hooks/dispatch-evaluators.mjs: block |
| A worker that stops without evidence | The final report names the command or file that proves the done-check, the paths changed and what was not done. | orchestrator | hooks/subagent-stop.mjs: sends the worker back once, then advisory. Evidence is a backticked span, an `Evidence:` line or an existing path; it proves the report names something real, not that the done-check passed |

## The shape of the rows

```yaml
ownership:   each antibehavior names the stage or swarm on the hook for it, so a drift
             has an owner, not just a name
enforcement: a hard block (a hook exits non-zero) where one action reveals the drift; an
             advisory or a swarm self-proof where it is process-level and no single action shows it
overlap:     where trust-but-verify and the development catalog name the same drift, the
             row cites both and one defense covers it
```

## Where this is grounded

The catalog is design spec section 10; the hooks that enforce it are section 11 and
live in hooks/ (hooks/README.md lists the suite). The per-swarm hardening (section
17) and each persona's own anti-behaviors (section 19) are the other two layers that
catch the process-level drifts a single hook cannot.
