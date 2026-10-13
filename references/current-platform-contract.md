# Current platform contract

Claude Code only. Verified 2026-10-13. This file is the freshness boundary for host
behavior: it supersedes dated model, skill-loading, hook, and orchestration assumptions
elsewhere in Eidolon when they conflict with the running host or first-party docs.

## Models and subagents

```yaml
# why: model and agent shape drift faster than doctrine; the generated agent files depend on these
model_aliases:   [sonnet, opus, haiku, fable]   # resolve to the current generation, never a point release
agent_frontmatter: [name, description, tools, model, effort, maxTurns]
effort_values:   low | medium | high | xhigh | max     # per agent, via the effort key
subagent_depth:  subagents can spawn subagents up to three layers
                 # CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1 restricts spawning to one layer
```

- Do not hardcode a point release as a conductor or escalation target; use the aliases (conductor-standard.md section 4).
- Damp unnecessary delegation: use subagents for parallel work, isolated context, specialist lenses, or independent verification; work directly otherwise.

## Hooks

```yaml
# why: the guard suite and the generated settings depend on exactly these behaviors
command_entry:   command plus args; ${CLAUDE_PROJECT_DIR} is substituted inside args
fail_mode:       a hook that exits 1 or is missing is non-blocking (fails open)
on_failure:      "onFailure": "block" needs Claude Code 2.1.295 or later
dispatch_matcher: Agent
subagent_start:  SubagentStart carries agent_id and agent_type and can inject context into the worker
subagent_stop:   SubagentStop can hold a worker with a reason
```

- A guard that must block exits 2 (or sets `onFailure: "block"` where supported); never rely on exit 1.
- Do not assume a hook is present because settings name it; the missing-file case fails open.

## Settings and skills

```yaml
# why: effort and model defaults are generated into settings; skills are edited live
settings_keys:   effortLevel (low to xhigh), maxEffortLevel (low to max), modelSettings, alwaysThinkingEnabled
skills:          change without a restart; verify discovery in the running version before asking for one
```

## Native autopilot surfaces

```yaml
# why: prefer the host's own loop carriers over a hand-built daemon
carriers:        [/goal, /loop, CronCreate, /schedule routines, desktop scheduled tasks]
guide:           references/autopilot-guide.md (pick the carrier), references/loop-suite.md (grind queues)
```

## Skill copies

```yaml
# why: observed on 2026-10-13 (Claude Code 2.1.206, headless): with a user-level and a project-level
#      skill of the same name, the Skill tool loaded the user-level copy, which was the older one
rule:            keep one copy of eidolon per machine, or keep both at the same commit
novice_door:     installs user-level (~/.claude/skills), no hooks
operator_door:   installs project-level (.claude/skills) and wires the project hooks
check:           ls ~/.claude/skills and .claude/skills before trusting which SKILL.md a session reads
```

## Freshness rule

Platform-specific factual claims older than the current host documentation are hypotheses.
Before changing model names, skill locations, hook schemas, restart behavior, or agent
primitives, verify the running host or current first-party documentation, then update this
contract and its regression tests. Repository state and executed evidence outrank remembered
assumptions.
