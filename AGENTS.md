# Repository instructions

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
