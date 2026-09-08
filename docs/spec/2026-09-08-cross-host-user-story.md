# Cross-host user story and acceptance contract

Date: 2026-09-08
Status: release gate

## User story

As an operator using Eidolon, I can install and run the same governance system in Claude Code, Codex, or both without losing the behavior that makes Eidolon useful: evidence-first verification, bounded autonomy, explicit consent at consequential edges, persistent project context, and narrow specialist skills. The system should choose useful skills when the task and repository provide evidence for them, avoid unrelated skills, and say when no installed skill is a defensible fit.

## Acceptance criteria

1. **Cross-host install**: one reviewed source can provision Claude, Codex, or both. Existing unrelated instructions and configuration survive. Replacement is explicit, backed up, verified byte-for-byte, and rollback-capable.
2. **Shared policy**: Claude and Codex use one policy inventory. A host adapter may translate transport, but it may not weaken a block or invent an approval.
3. **Consent integrity**: unsupported host approval semantics fail closed and tell the operator what is required. No synthetic approval receipt is accepted.
4. **Patch safety**: Codex patches are treated as proposed edits, not shell commands. Removed spans, moves, deletes, protected paths, symlinks, and ambiguous/binary patches are covered.
5. **Current platform semantics**: model selection is capability- and availability-based rather than pinned to a dated model version. Current Claude guidance on adaptive reasoning, subagent restraint, skill discovery, and hot reload takes precedence over dated implementation notes.
6. **Intelligent skill selection**: the controller discovers candidate skills, evaluates task intent plus repository signals plus risk, picks the smallest sufficient non-conflicting set, respects explicit user choices, and returns a gap instead of guessing when confidence is insufficient.
7. **Narrowness**: broad common-token triggers cannot by themselves activate a skill. Explicit exclusions and scope constraints win over positive matches.
8. **Evidence**: selection decisions are inspectable: selected skill, matched evidence, score, and rejected alternatives are available to the controller. A skill is not trusted merely because it exists.
9. **No compulsory swarm theater**: current capable models may work directly for simple/sequential/single-file tasks. Subagents are used when parallelism, independent context, specialist isolation, or independent verification materially helps.
10. **Verification**: the existing core suite, compatibility suite, selfcheck, audit, skill-router tests, Setup tests, and Hearth installer tests are green on their declared platforms before merge.
11. **Claims boundary**: CI proves software behavior under its fixtures. It does not prove live model behavior or native GUI click-through unless those were actually executed.

## Skill-selection decision rule

The controller evaluates, in order:

1. an explicit user-requested skill, if installed and allowed;
2. exact or phrase-level declared triggers;
3. repository signals (language, framework, file paths, package/tool presence);
4. risk signals (auth, secrets, PII, money movement, destructive or deployment operations);
5. description-level semantic fit;
6. scope, exclusions, prerequisites, and conflicts.

Select the smallest set that covers the task's materially distinct needs. Do not select two skills merely because both share generic words. If the best candidate does not clear the confidence threshold, route to `gap` and either work directly or use the existing skill-scout flow to discover a candidate with operator review.

## Model-selection decision rule

Do not encode a specific Claude point release as policy. Resolve from models actually available in the current host/session:

- **premium judgment**: strongest available model for security/trust/safety review, hard architecture, synthesis, canonical infrastructure, and failed-leg escalation;
- **workhorse**: capable general model for implementation, focused review, research breadth, test and render work;
- **fast mechanical**: fastest suitable model only for bounded low-risk mechanical edits;
- **direct execution**: prefer the current conductor for simple sequential work where delegation would add coordination cost without independent value.

When a host exposes aliases such as `opus`, `sonnet`, or `haiku`, treat them as availability-resolved aliases, not promises about a version. If capability or model identity is uncertain, inspect the current host rather than relying on repository memory.
