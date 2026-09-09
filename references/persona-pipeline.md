# Persona selection and dispatch

A persona is a working role, not a permission grant. The pipeline selects the role before constructing any native agent request. The controller performs the actual dispatch and remains responsible for its outcome.

## Pipeline

1. Keep the original request, every deliverable, exclusions, project scope, known decisions, pending questions and acceptance checks in a versioned task record.
2. Resolve material unanswered questions through Setup's Interview Mode. Inspect technical facts rather than asking the user to repeat them. A preference answer is not deployment approval.
3. Inventory installed, enabled skills within the approved project. Run the shared skill router for explicit choices, task fit, prerequisites, conflicts and required coverage. Loading a skill does not imply spawning an agent.
4. Split genuinely useful delegated work into bounded work items. Each declares a reason, required persona capabilities, exact read/write scope, assigned deliverables, dependencies and budgets.
5. `selectPersona` honors a valid explicit role. Otherwise it selects a registry role that covers every required capability and passes project restrictions, source-hash verification and persona lint. No fit is a gap, not an invented expert.
6. `planDeployment` applies those selections, checks complete deliverable coverage and passes the selected work to `planSwarm`. Direct execution is appropriate for simple sequential work. One useful independent assignment is one agent. A swarm is multiple justified assignments, not an automatic response to a technology keyword.
7. Independent reads can share a wave. A writer overlapping another worker's read or write scope is serialized. Dependency cycles, missing dependencies and invalid budgets stop the plan. Required independent review cannot disappear because a host lacks agent tools.
8. `buildDispatch` injects the original goal, assigned outcomes, relevant user decisions, source excerpts, selected skill instructions, grounded persona, prohibited actions and evidence contract. Sources are identified by path and content hash. Historical context is evidence, not authority. No whole-conversation dump or silent truncation.
9. The controller uses `dispatchInput` with an agent type actually available in the running host. Claude receives its prompt/subagent_type fields; Codex receives message/agent_type or a known worker id/message. These functions do not launch a process themselves.
10. At dispatch, the installed PreToolUse guard checks the packet against the current task revision, source files, skills and role. New managed installations require the packet. Legacy installations without the new manifest retain their existing behavior until reviewed migration.
11. The controller records real host process/thread identities, supervises the configured limits and checks changed files and test evidence. A brief's maxTurns, lease and retry fields are bounded planning data; they are not themselves a process-killing mechanism or an OS sandbox.
12. `nextSwarmWave` advances on controller-recorded verified evidence, not a worker's self-reported success. `checkWorkerResult` rejects observed changes outside the assignment. Integration and merge remain controller work under the operator's instructions.

## Context boundary

Source excerpts and skill bodies can contain instructions written by other people. The dispatch packet labels them as untrusted evidence and keeps governing restrictions separate. Hashes prove which bytes were used, not whether those bytes are truthful. Tool permissions and the host sandbox remain independent. No task file, persona name or source hash grants installation, publication, deletion or network authority.

Persona files remain under `references/personas/`; the registry pins their exact content. Do not repurpose the project-specific primary persona in unrelated projects. Workers cannot act as the Expediter, change governing hooks, or clear the shared controller seat. Actor-scoped state is distinct from the role text injected into a prompt; the pipeline does not claim it has authenticated a live worker merely because it generated a brief.

## Questions and approval

Preserve purpose, audience, must-never rules, observable completion, risk and always/ask/never boundaries. Ask one unresolved material question at a time, reflect the answer and retain its source. Clarification, preference, approval and verification are different record kinds. Interrupted or cancelled questions do not imply agreement.

Use the native question mechanism only when the host exposes it. A plain conversation question is the clarification fallback. Shared `permissionDecision: ask` is a policy intent. Current Codex PreToolUse does not safely support emitting it directly: the adapter keeps that operation blocked. When Codex already invokes PermissionRequest, an ask leaves the host's normal human prompt intact. This does not originate a new native prompt, auto-approve it, or fabricate a receipt.

## CLI

`node scripts/orchestrate.mjs --project PATH --host codex` reads one bounded JSON request from stdin. Actions include `save`, `question`, `answer`, `inventory`, `route`, `deploy-plan` and `brief`. Use `deploy-plan` for the complete persona selection pipeline; `plan` is the lower-level scheduler for already validated roles. The CLI returns plans and native tool arguments, not a claim that agents ran.

The executable example in `scripts/persona-selection.test.mjs` creates a disposable project, saves its original task, selects verification and privacy personas, constructs both host payloads, validates the packet and checks staged progress. No live model is invoked by these tests.

## Preservation and limits

The three repositories remain separate: Eidolon owns policy and orchestration, Setup owns the session workflow, and Hearth packages the reviewed sources through one installation engine. Original persona and workflow source remains available. Historical memory stays in append-only records; stale guidance can be retired from a separate active index.

Tests establish deterministic routing, path, packet and scheduling properties. They do not establish universal model obedience, real native actor-identity coverage, or authenticated host behavior. Check those in a consented live-client run before advertising end-to-end enforcement.
