# Current platform contract

This file is the freshness boundary for host behavior. It supersedes dated model-version, skill-loading, and orchestration assumptions elsewhere in Eidolon when those notes conflict with current platform documentation or the running host.

## Claude Code

- Do not hardcode a Claude point release as the conductor or escalation target. Resolve the strongest suitable model actually available in the session. Anthropic currently maintains multiple active Opus/Sonnet/Haiku generations and deprecates them over time.
- Prefer adaptive reasoning on current Claude generations when the host exposes it. Do not carry forward obsolete sampling or fixed-thinking assumptions into generated configuration.
- Claude's latest models can orchestrate subagents proactively. Eidolon should damp unnecessary delegation: use subagents for parallel work, isolated context, specialist lenses, or independent verification; work directly for simple sequential tasks and small edits where delegation adds no evidence.
- Installed skills can be discovered and used automatically based on the task. Treat skill metadata, especially the description and narrow trigger language, as routing evidence rather than requiring the operator to remember every skill name.
- Do not require a session restart merely because a project skill changed. Verify actual discovery/loading behavior in the current Claude Code version. A restart remains valid only when the specific host feature being changed demonstrably requires one.
- Investigate referenced code before making claims about it. Repository state and executed evidence outrank remembered assumptions.

## Freshness rule

Platform-specific factual claims older than the current host documentation are hypotheses. Before changing model names, skill locations, hook schemas, restart behavior, or agent primitives, verify the running host or current first-party documentation and update this contract plus regression tests when the behavior materially changes.
