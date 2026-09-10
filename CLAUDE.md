# Eidolon for Claude Code

Any repo → detected stack → a complete, verified Claude Code environment.
Autonomous execution, consent-gated side effects. Claude is the engineer.

## Read the room

Read the existing project before changing it. Keep its shape, its working parts,
and the person's intent. Do not reinstall the room to fix something in it.

```yaml
claude:
  workflow: SKILL.md
  invoke: /eidolon
  project_rules: CLAUDE.md
  skills: .claude/skills/
  settings: .claude/settings.json
  handoff: .claude/session.yaml
  manifest: .claude/eidolon-manifest.yaml
  policy_authority: .eidolon/policy-manifest.json
```

Use the root `SKILL.md` for the complete Claude workflow. Loading repository
instructions is not an installation request. For maintenance, change only the
requested scope; do not launch setup or seat a persona just because this file loaded.
Read `references/current-platform-contract.md` before relying on host behavior.
Read `references/orchestration-contract.md` and `references/persona-pipeline.md`
before preparing dispatch. Their current actor and approval rules take precedence
over older model names, mandatory swarm wording, or shared-seat examples.

## The spine

```yaml
# The original discipline: write the least, and verify it the most.
docs:
  facts: declarative config blocks
  rules: one terse imperative line each
  why: header comment above the block
  prose: none in generated rules; plain language with the person
verification:
  findings: EXTRACTED | INFERRED | AMBIGUOUS
  done_is_the_outcome: name the outcome signal before starting; observe it before saying done
  measure_before_build: inventory real files, data, and running state before any build wave
  scope_every_claim: say what actually ran and what was only read
  verify_by_execution: run the thing and watch what happens; reading is a hypothesis
  evidence_first: when challenged, show the file, line, command output, or failing element first
  fanout: probe one item and verify its state change before scaling
  triage: root-cause a failing tool before working around it
```

## Pick the work that was asked for

```text
setup   install the room: recon → plan → structure → wiring → verify → closeout
build   work in the room: spec → plan → build → review → cold-context verify → close
evolve  measurable search: frame → approved run → scored candidates → cold re-evaluation
```

In setup mode, follow the root skill's phases and stages in order. Keep the
Stage 2, Stage 6, and Stage 8 checkpoints, the Stage 2.5 interview, and Stage 9
verification before Stage 10 seating. In build mode, reuse recon and answered interview
questions; do not repeat the installation. Use evolve only when a real numeric
evaluator ranks candidates. A task without a scorer is build work, not evolve.

## Consent and boundaries

- Reuse the person's existing answers and explicit authorization; do not reopen settled scope.
- Preview installation paths and changes before writing; approval belongs to that exact plan.
- Require separate replacement consent and preserve the prior installation in backups.
- Keep Claude's native permission decisions intact; use `AskUserQuestion` when available for questions, not as a substitute for host permission.
- If a native question control is unavailable, ask plainly; never invent a tool call or approval.
- Never weaken a guard, erase an approval boundary, or retry a denied action through another tool.
- Keep the controller's identity separate from every worker; a worker's failure must not clear another actor's state.
- Use subagents when parallel work, isolated context, specialist work, or independent verification adds evidence; work directly otherwise.
- Give each dispatched worker bounded scope and context; verify the returned state rather than repeating its report.
- Keep the Expediter controller-only; a prepared dispatch plan is not a launched worker.

## Evolve, memory, and closeout

Read `references/evolve-engine.md` and `engine/SECURITY.md` before an engine run.
Bind consent to the current plan digest, evaluator, declared inputs, runtime, and
budget. Changes need another review. A confirmation Boolean is not consent.
Trusted-local execution is not an operating-system sandbox. Unknown candidate
code belongs in a separately configured disposable sandbox, not a sensitive host.
Re-run the best candidate cold; retain the code, result, and plan identity together.

Write what broke to `docs/fixes` and what worked to `docs/insights`. Correct history
with new superseding entries, not deletion. Retire guidance through an active index.
Use only observed, approved memory integrations. Optional models and services need
separate dependency and data-access approval; preserve the automatic-install holds.

Let the person make the final call. Report the observed result, the checks that
actually ran, and what remains unsure. A clean gate next to a broken result is not done.

## Repository maintenance

Eidolon supports Claude Code and Codex. Keep policy logic shared; host adapters
must preserve blocks and explicitly report unsupported behavior.

- Read `references/current-platform-contract.md` before relying on model names, skill-loading behavior, hook schemas, restart requirements, or subagent assumptions. It supersedes dated platform lore elsewhere in the repository when they conflict.
- For substantive work, evaluate installed skills using `references/skill-selection.md`. Prefer the smallest sufficient set based on explicit user choice, narrow task triggers, inspected repository evidence, and risk. A low-confidence result is a gap, not permission to guess.
- Run `node --test hooks/*.test.mjs scripts/*.test.mjs` before claiming tests pass.
- Run `node scripts/selfcheck.mjs` and `node scripts/eidolon-audit.mjs`.
- For Codex integration, read `codex/README.md` and `codex/SKILL.md`.
- Keep the original root `SKILL.md` as the Claude process specification, subject to the current platform contract above.
- Never weaken a guard to make a compatibility test pass.
- Do not confuse skill selection with delegation: use subagents only when parallelism, isolated context, specialist work, or independent verification adds value.
- Do not run installer writes without approval; preview first.
- Do not change visibility or rewrite history without authorization. Merge/release/publication follow the operator's current explicit instruction.
- Report what was executed separately from what was only inspected.

## Reviewed persona pipeline

Read `references/orchestration-contract.md` for the current selection, actor-state,
Interview Mode and context-injected dispatch contract. It resolves older mandatory
swarm wording while preserving required coverage and human consent. Use the
`deploy-plan` action in `scripts/orchestrate.mjs` before preparing native dispatch.
Do not treat a printed plan as an agent execution or an approval.

## Persona and dispatch pipeline
Before dispatch, read `references/persona-pipeline.md`. Use the `deploy-plan` action of `scripts/orchestrate.mjs` to select grounded roles and form bounded context packets. Preserve original task deliverables and exclusions. No persona, task file or hash grants permission. Keep the three repositories separate and retain the host-specific approval boundary.
