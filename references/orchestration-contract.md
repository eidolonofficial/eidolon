# Persona selection and bounded orchestration

This is the current handoff contract. It resolves older compulsory-swarm and
record-retirement wording without discarding the original workflow specifications.
Eidolon, Setup and Hearth remain separate repositories. Hearth distributes
reviewed source commits; Setup prepares the session; Eidolon coordinates work.

## Preserve the request

Keep each requested deliverable, the user's original goal, explicit exclusions,
relevant prior answers, pending questions and observable completion checks.
A caption edit cannot close a separate image-replacement request. Reviewing a
migration is not permission to run it. Saved context is not an approval receipt.

Use scripts/task-contract.mjs for versioned task and interview records. Ask only
questions that materially affect the work. Inspect available technical facts
before asking the user. Keep clarification, preference, approval and verification
as distinct question kinds. Preserve Interview Mode's purpose, audience, never-do,
done, risk and working-boundary subjects. Resume unanswered questions without
inventing answers or repeating the whole interview. Native question controls are
used only when exposed by the current client; conversation is the fallback for
clarification, not a replacement for machine-enforced permission.

## The pipeline

1. Inspect the enabled skill inventory and match the actual task, repository,
   risks and constraints. scripts/skill-router.mjs applies explicit choice first,
   eligibility, symmetric conflicts, dependency closure and required coverage.
2. Define bounded work items only where specialist knowledge, independent review,
   useful parallel work or isolated context adds value. Simple work stays direct.
3. Use scripts/orchestrate.mjs with action deploy-plan. The persona-selection
   pipeline loads reviewed entries from references/persona-registry.json, checks
   canonical paths, source hashes, project scope, specialty coverage, grounding
   and an evidence contract. An invalid explicit persona is not replaced silently.
4. Preserve all deliverables. Missing specialties remain gaps. Required independent
   verification cannot become same-controller verification merely because the
   native agent tool is unavailable. Use another real reviewer or ask the user.
5. Build the dependency waves. Serialize overlapping writes and reads of files a
   concurrent worker would change. Enforce finite planned concurrency, turns,
   retry and lease limits. Runtime supervision still needs the controller and
   actual host thread/process state; a number in a prompt is not an OS limit.
6. Inject the selected persona, relevant source excerpts, hashes, user decisions,
   exclusions, assigned paths, acceptance checks and result format into the native
   tool arguments. Do not inject secrets, unrelated personal context or the whole
   conversation. Oversized context is rejected rather than silently truncated.
7. Dispatch using a native agent tool actually observed in the running host.
   The planner itself starts no model or process. Record the returned actor ID.
   Do not claim a selected skill ran because its name appeared in a plan.
8. Refresh changed source context for later waves. Check actual diffs and results,
   reject out-of-scope changes, and advance only with controller-observed evidence.
   Do not launch a duplicate worker while an earlier actor is still running.

The JSON CLI supports inventory, route, save, question, answer, deploy-plan,
plan and brief actions. Use --project PATH and --host claude or codex. Its output
is a preview and native-tool handoff, not permission to execute. For a complete
example, see examples/persona-pipeline.json and scripts/persona-selection.test.mjs.

## Worker boundaries

A persona supplies standards and a working mandate, not extra privilege. Workers
cannot seat themselves as the controller, approve their own scope expansions,
rewrite policy, recursively dispatch, merge, release or publish. The new installed
PreToolUse dispatch path validates current task revision, persona and source hashes.
These are consistency checks; editable task records are not a trusted authority.
Host permissions and operator-controlled policy remain necessary.

Actor-specific persona seats and drift counters are namespaced by session and
actor identity. A legacy controller seat is inherited read-only. Blocking a worker
must not delete another actor's state. Preflight is pure; only a successful,
identified PostToolUse outcome advances the actor's drift counter, once per tool ID.
An infrastructure-work profile is selected in a reviewed installation plan, not
by asking an agent to write an override receipt.

## Ask and supported host behavior

The shared policy represents permissionDecision ask. Claude's documented
PreToolUse transport can emit permissionDecision: "ask". Codex PreToolUse cannot:
current documentation says that unsupported response reports an error and then
continues the operation. Eidolon therefore blocks that call instead of emitting
an unsupported response. For Codex PermissionRequest, which occurs only when the
host is already asking, an ask leaves the native prompt intact; a deny remains a
deny. Neither a saved answer nor an agent-written file manufactures allow.

This does not originate an arbitrary Codex approval dialog. SubagentStart is not
used as a blocking boundary. Capture real client events and approval/cancel traces
before changing any documented support claim or transport.

## Historical evidence and maintenance

Fixes, insights and decisions retain their original byte prefix. Add corrections
or superseding records. Retire stale guidance from an active index such as
docs/memory-index.json without silently erasing history. Privacy deletion and
redaction require separate explicit operator maintenance. Existing session paths
remain readable; no automatic migration destroys the user's prior records.

Installation applies the exact previewed source and destination state. Drift,
replay or changed plans require another review. A process lock and journal make
interrupted work visible, but automated crash recovery is not claimed. Keep
backups and concurrent human changes when recovery is uncertain.

## Evidence boundaries

Unit tests, installed-hook fixtures, native model sessions and GUI acceptance are
different evidence. A passed fixture is not proof that every model follows its
prompt or that every MCP mutation is intercepted. Shell parsing covers a bounded
set of ordinary forms, not arbitrary programs. Keep host and OS enforcement
independent; do not describe repository-writable hooks as a tamper-proof sandbox.
