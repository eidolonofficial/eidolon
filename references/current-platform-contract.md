# Current platform contract

This file is the freshness boundary for host behavior. It supersedes dated model-version, skill-loading, and orchestration assumptions elsewhere in Eidolon when those notes conflict with current platform documentation or the running host.

## Claude Code

- Do not hardcode a Claude point release as the conductor or escalation target. Resolve the strongest suitable model actually available in the session. Anthropic currently maintains multiple active Opus/Sonnet/Haiku generations and deprecates them over time.
- Prefer adaptive reasoning on current Claude generations when the host exposes it. Do not carry forward obsolete sampling or fixed-thinking assumptions into generated configuration.
- Claude's latest models can orchestrate subagents proactively. Eidolon should damp unnecessary delegation: use subagents for parallel work, isolated context, specialist lenses, or independent verification; work directly for simple sequential tasks and small edits where delegation adds no evidence.
- Installed skills can be discovered and used automatically based on the task. Treat skill metadata, especially the description and narrow trigger language, as routing evidence rather than requiring the operator to remember every skill name.
- Do not require a session restart merely because a project skill changed. Verify actual discovery/loading behavior in the current Claude Code version. A restart remains valid only when the specific host feature being changed demonstrably requires one.
- Investigate referenced code before making claims about it. Repository state and executed evidence outrank remembered assumptions.

## Codex

- `AGENTS.md` is the durable repository instruction surface. Skills may be selected explicitly or automatically from task fit.
- Treat `.agents/skills` as the project skill surface when installed there. Do not assume ChatGPT workspace skill state and Codex project skill state are identical.
- Codex hook transport is an adapter boundary. If a Claude-native approval response is unsupported, fail closed and request manual operator action instead of silently allowing the operation.
- `apply_patch` payloads are proposed file changes, not shell commands. Normalize them before policy evaluation and fail closed on ambiguous transformation.

## Cross-host skill intelligence

Before starting substantive work, the controller may run the skill-selection pass in `references/skill-selection.md` / `scripts/skill-router.mjs`. It must:

1. honor an explicit user-selected skill when installed and in scope;
2. match narrow trigger phrases before generic description overlap;
3. incorporate repository evidence and risk signals;
4. apply exclusions, scope and conflicts before selection;
5. choose the smallest sufficient set;
6. expose why each skill was chosen;
7. return a gap instead of guessing when confidence is low.

Skill selection is advisory to the controller, not a permission bypass. Governance hooks, consent gates, tool permissions, and user instructions still win.

## Freshness rule

Platform-specific factual claims older than the current host documentation are hypotheses. Before changing model names, skill locations, hook schemas, restart behavior, or agent primitives, verify the running host or current first-party documentation and update this contract plus regression tests when the behavior materially changes.

## Reviewed persona pipeline

Read `orchestration-contract.md` for the current selection, actor-state,
Interview Mode and context-injected dispatch contract. It resolves older mandatory
swarm wording while preserving required coverage and human consent. Use the
`deploy-plan` action in `scripts/orchestrate.mjs` before preparing native dispatch.
Do not treat a printed plan as an agent execution or an approval.
