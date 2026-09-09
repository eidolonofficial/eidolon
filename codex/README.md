# Codex adapter contract

Verified against the official documentation on 2026-09-08:
- https://learn.chatgpt.com/docs/hooks
- https://learn.chatgpt.com/docs/build-skills
- https://learn.chatgpt.com/docs/agent-configuration/agents-md
- https://learn.chatgpt.com/docs/extend/mcp
- https://code.claude.com/docs/en/hooks

## What is shared

The ordered Bash and Write/Edit policy evaluators are shared with Claude in
`hooks/suite-evaluators.mjs`. The original Claude workflow stays the source of
process rules. Installation gives Codex its own small `SKILL.md` and retains
the original at `references/claude-workflow.md`. No global find-and-replace of
tool names or rule meanings is performed.

| Concern | Claude Code | Codex |
| --- | --- | --- |
| Project instructions | CLAUDE.md, optionally importing AGENTS.md | AGENTS.md |
| Skills | .claude/skills | .agents/skills |
| Invocation | /eidolon | $eidolon |
| Hook config | .claude/settings.json | .codex/hooks.json |
| File changes | Write/Edit | apply_patch normalized into proposed writes and removed spans |
| Human hook escalation | permissionDecision: ask | explicit block; manual operator action or satisfied prerequisite |
| Sensitive delegation | Task/Agent | spawn_agent/send_input normalized into dispatch input |
| Existing project records | docs/ and .claude legacy state | same records; no destructive migration |

## Installation

Node.js 22 or newer and Git are required. From a checkout:

```sh
node scripts/install.mjs --host codex --project /path/to/project
node scripts/install.mjs --host codex --project /path/to/project --yes
```

Choose `--host both` to install both clients. Existing skill directories require
`--replace`; the previous installation is retained under `.eidolon/backups/`.
Without `--project`, only user-level skills are installed. Hook config is
project-local and is never activated merely by copying a user-level skill.
The installer preserves unrelated configuration and never changes hook trust,
approval policies, sandbox settings, or Git history. Generated absolute hook
paths are machine-local: rerun the installer on another machine.

After installation, start Codex in the target, review project trust and `/hooks`,
and verify the listed command points to the installed adapter. Hooks are not
active until the host trusts them. Do not advertise enforcement without this
check. Existing inline hooks and other plugins remain in place.

## Intentional limits

Codex currently reports unsupported `permissionDecision: "ask"` as a hook error
and continues the operation. This adapter never emits that response. It exits 2
and leaves the proposed operation blocked. There is no writable approval-file
shortcut and no claim of native approval parity. The operator reviews and runs
an approved operation outside the agent, or satisfies the documented evidence
or attestation requirement. Never treat a block as permission to disable a hook.

Patch parsing is strict and read-only. Add/update/delete/move and multiple exact
hunks are supported. Ambiguous context, symlinks, binary targets, repeated
operations on one path, oversized input and paths outside the project fail
closed. Patch bodies are never evaluated as shell commands. Codex configuration
and the installed runtime cannot be edited through this adapter; maintenance is
reviewed separately.

The host does not run hooks on every possible operation (for example interactive
stdin continuation and some hosted tools). Regex guards are defense in depth,
not a security sandbox. Existing optional orientation enforcement is retained
when declared in the project manifest or Claude configuration; optional memory
services are not silently installed or required on a fresh project.

## Verification

```sh
node --test hooks/*.test.mjs scripts/*.test.mjs
node scripts/selfcheck.mjs
node scripts/eidolon-audit.mjs
```

These are executable policy/installer tests, not proof that an authenticated
Codex or Claude model session completed a task. Before release, test a live
session in each intended client: skill discovery, hook trust, benign edit,
blocked record deletion, manual ask-tier handling and restart/compaction.
Windows and macOS native GUI behavior require on-platform checks.

## Reviewed runtime and persona pipeline

The installed policy manifest is `.eidolon/policy-manifest.json`. Its owned
handlers are checked semantically. Claude shell events cover Bash and PowerShell;
Agent and Task use the same dispatch boundary. New installs require validated
task/persona/context packets for dispatch. Use the `deploy-plan` action described
in `references/orchestration-contract.md`.

Successful outcome state and new persona seats are actor/session-scoped under
`.eidolon/sessions`. Legacy controller seats are read-only fallback, not deleted
by a rejected worker. A legacy Expediter seat may require explicit operator
migration before workers can use their own seats; no actor identity is invented.
A dispatch packet itself does not grant permissions or create a trusted seat.

The shared ask policy maps to a Codex PreToolUse block. When Codex has already
raised PermissionRequest, an ask returns no overriding decision and preserves
its native prompt. Do not interpret this as support for raw PreToolUse ask.
