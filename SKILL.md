---
name: eidolon
description: "Use when explicitly setting up an Eidolon-governed project environment or when a project already governed by Eidolon invokes its build workflow."
trigger: /eidolon
---

# eidolon

Choose the requested mode. **Setup** configures an environment; read [references/setup-workflow.md](references/setup-workflow.md) only for the requested setup surfaces. **Build** carries an already-authorized work item through the project's existing governance; it does not reinstall the environment. A generic build/fix request in another project does not activate Eidolon.

Preserve the project's canonical [references/conductor-standard.md](references/conductor-standard.md), existing host instructions, and scoped user choices. Read its relevant operational section before dispatch in an Eidolon-governed project. Root documents hold facts and exceptional constraints; detailed examples belong in references. Skill metadata requires `name` and `description`; additional trigger fields and strict step formats are host/project conventions rather than universal requirements.

Authorization is tied to concrete effects. Reuse approval already granted for the same plan, target, budget, and operation. Ask at a new scope fork or uncovered installation, persona/identity change, deployment, sensitive-data dispatch, or destructive operation. Spec, plan, and visual review do not each require another human gate when their scope was already accepted. Preserve real hooks; never bypass a rejection.

For a build, record the observable acceptance criteria, affected scope, existing changes, dependencies, and relevant verification. Reuse existing specs and known onboarding answers. Select review and independent verification for the actual risk and required project gates; adjudicate findings from evidence. If a bounded fix loop reaches its declared limit, revisit the plan instead of repeating the same failed repair or shipping red.

Completion requires the intended outcome observed, a fresh relevant check after the last edit, and independent evidence beyond an exit code. Label claims extracted/inferred/ambiguous, preserve exact failure output, and name skipped checks. A subagent report needs artifact/state read-back. Keep generated artifact provenance and verification in `.claude/eidolon-manifest.yaml` where the project uses it.

Controller-only personas remain controller-only. Preserve working-persona, dispatch, and data boundaries from the project conductor/security policy. Hook or loop infrastructure changes require the authorized controller scope, before/after positive and negative checks, and a fix log; no weaker enforcement or evasion.

Load only what the work needs:

- [references/security-policy.md](references/security-policy.md) for sensitive or destructive boundaries and dispatch.
- [references/persona-template.md](references/persona-template.md) for an authorized persona change; preserve its verification rail.
- [references/loop-suite.md](references/loop-suite.md) for explicitly bounded long-running work, budgets, leases, and halt codes.
- [references/cross-session.md](references/cross-session.md) for an independently verified high-risk handoff.
- [references/skill-authoring.md](references/skill-authoring.md) for a proven recurring capability gap, with metadata and representative evaluation checks.
- [references/partner-notes-template.md](references/partner-notes-template.md) for requested collaboration notes.

Honor repository Git policy and preserve user edits. Publishing, pushing, deployment, and paid or sensitive external operations require their corresponding authorization. Keep memory capture scoped and redacted; optional memory tooling is not a reason to block an otherwise complete deliverable.
