---
name: eidolon
description: Sets up a project so Claude Code understands it from the first message, and runs a spec-driven build pipeline for real work on it. In setup mode Eidolon reads your repo, works out which languages and tools you use, and writes the files Claude needs to work well: a CLAUDE.md, helper skills and slash commands, sub-agents, safety hooks, MCP setup, and the memory wiring (a written memory store plus a code map). In build mode it carries a work item from a spec through plan, build, a security review swarm, a cold-context verify, and a committed close, with human gates along the way. Use this whenever someone wants to set up, configure, or get a repo ready for Claude Code, or to build, change, or fix something in it, even if they do not say the word eidolon.
---

# /eidolon

Eidolon turns a repo into a verified Claude Code environment (setup), carries a work
item through a human-gated pipeline in that environment (build), and guides anything
that must run on its own (autopilot). Execution is autonomous and side effects are
consent-gated: nothing is written before the plan is approved, and every generated
command is checked against an independent second signal before it ships. This file
routes; the procedures live in the references named below.

## Usage

```
/eidolon                      # run on current directory
/eidolon <path>               # run on a specific repo
/eidolon <path> --dry-run     # recon + plan only, never writes
/eidolon <path> --no-capture  # skip Stage 7 (MemPalace/Graphify fan-out)
/eidolon <path> --no-mcp      # skip Stage 8 (MCP wiring)
/eidolon loop|goal|routine    # guided autopilot: something that runs on its own
```

## Modes

```yaml
# why: one entry point, three procedures; each procedure lives in exactly one file
setup:     no work item, or "set up / configure this repo"  ->  references/setup-workflow.md
build:     a work item to build, change, or fix             ->  references/build-pipeline.md
autopilot: "keep doing this", loop, goal, routine           ->  references/autopilot-guide.md
```

Pick by what was asked and state the mode at the top. Setup installs the room once;
build works in it each time; build's SPECIFY stage reuses setup's recon and
references/interview.md and does not reinstall. A fresh repo plus a first work item
runs setup, then build.

## INVARIANTS (apply to every mode)

```yaml
# why: the rules that hold in all three modes; the owning reference adds the rest
docs:
  facts:  declarative config blocks (yaml/toml/json), never prose
  rules:  one terse imperative line each
  why:    a header comment above the block, the only place rationale lives
verification:
  funnel: REFERENCE trust-but-verify SKILL.md "what verification MUST be"; do not restate
  rule:   no generated command ships unverified; tag every claim EXTRACTED|INFERRED|AMBIGUOUS
  state:  verify that a tool CHANGED STATE (files, rows, tokens), not that it reported success
  fanout: probe a swarm with ONE item and verify the mutation before scaling
  triage: root-cause a failing tool BEFORE working around it
consent_gates:
  rule:    do ALL the work without asking; pause ONLY where an action installs, is irreversible,
           deploys, or seats an identity
  moments: install a skill | seat the primary persona | deploy | run an irreversible op (the ask tier)
           | dispatch destructive or sensitive work (the ask tier, hooks/guard-dispatch.mjs,
           references/security-policy.md)
  shape:   one AskUserQuestion each, with a why/liability line; never a typed menu
dispatch_gate:                  # hooks/guard-dispatch.mjs asks the human; a worker that dispatches is blocked
  done_check: a write-capable dispatch carries a line that starts "Done-check:" (exact spelling) with the
              command or observation after it, e.g. "Done-check: <command> exits 0"
  wave_plan:  a fresh wave plan exists at .claude/waves/<date>-<slug>.md, newer than the session start and
              at least 20 non-blank characters, before the first write-capable dispatch
orchestration:
  standard:  references/conductor-standard.md governs; it supersedes any older clause that permits
             inline building, optional persona seating, or cost-timid fan-out
  preflight: Define the outcome signal, Measure by a read-only inventory, then write the wave plan;
             fan out only after (conductor-standard.md section 2)
  personas:  every dispatch seats a named persona; the Expediter seat belongs to the main session
             only (hooks/persona-conduct-guard.mjs)
  reasoning: every claim states cause, mechanism, falsifier, evidence (references/persona-template.md,
             section "Reasoning")
  brief:     every dispatch carries the Brief contract (references/persona-template.md, section
             "Brief contract"); a write-capable one adds a "Done-check:" line and needs a fresh wave plan
  cascade:   model and effort per role come from conductor-standard.md section 4, as aliases
  discipline: done means the outcome is observed, never merely a green gate; measure before build;
             scope every claim to what ran; verify by execution; answer a challenge with evidence first
  waves:     small and controlled; a failing wave halts the line and is root-caused, never pushed past
hooks_posture:
  claim: the hooks are defense in depth, lexical checks on tool calls plus the permission deny floor
  never: describe them as a sandbox or as hard enforcement; the known gaps are in hooks/README.md
```

## What you must do when invoked

1. If no path was given, use `.`; do not ask for one.
2. Pick the mode from the request and say which. Then read the owning reference in full
   before acting; do not work from memory of it.
3. Follow its stages in order and skip none. Honor its checkpoints: setup pauses after Stage 2
   (plan), Stage 6 (structure) and Stage 8 (wiring); build stops at gates 1, 2 and 3.
4. Dispatch through the conductor standard: a wave plan first, a persona and a done-check on
   every brief, state read back after every wave.
5. Run the gates before any closeout and quote their output: `node scripts/selfcheck.mjs`,
   `node scripts/eidolon-audit.mjs`, `node scripts/hooks-readme-check.mjs`, and
   `node scripts/persona-lint.mjs` on any persona or agent file written.
6. Do not declare done while any AMBIGUOUS item or unverified finding stands.

## Read next

```yaml
# why: every reference by path with the one thing it owns; open the one the task needs
procedures:
  references/setup-workflow.md: the ten setup stages, the Stage 5 agent and agent-scopes.json contract
  references/build-pipeline.md: the spec-to-close pipeline, tiers, gates, the governance pointer table
  references/autopilot-guide.md: loops, goals and routines, guided from a brain dump
  references/interview.md: the question bank, the brain dump, the reflect-back format
  references/engineering-principles.md: the principles behind workflows, loops, retrieval, DAGs, context
orchestration:
  references/conductor-standard.md: conductor lanes, swarm-first law, preflight, model cascade, gates
  references/loop-suite.md: bounded autonomous iteration and the heartbeat
  references/review-swarms.md: the engineering, code-review, trust-and-safety and ship swarms
  references/persona-template.md: persona construction, the rail, Reasoning, Brief contract, primary persona
  references/personas/: the built roster, one file per persona
  references/architect-synthesis.md: one ordered disposition of every swarm finding
  references/cross-session.md: verification from a self-contained packet in a separate session
skills:
  references/skill-authoring.md: how Eidolon authors a skill for itself from a proven gap
  references/find-skills-reach.md: reaching beyond the installed set, hiring an expert persona
  references/agents/skill-scout.md: the read-only scout agent for one named gap
  references/example-skill/: a worked, lint-clean example skill
safety:
  references/security-policy.md: what an agent reads before sensitive work
  references/security-swarm.md: red/blue method and the anti-handwave gates
  references/antibehavior-catalog.md: each drift, its owner and its enforcing hook
  hooks/README.md: the hook wiring, evaluators, tiers, lanes and known gaps
host:
  references/current-platform-contract.md: verified host behavior; wins over dated claims elsewhere
  references/git-hooks-path.md: effective Git hook paths for recon, capture and verify
  references/explain-mode.md: plain-language teaching at any stage on request
  references/partner-notes-template.md: the working-with-Claude notes emitted at Stage 3
```

## Proof of life

```bash
node --test "hooks/*.test.mjs" "scripts/*.test.mjs"   # the suites; 0 fail
node scripts/selfcheck.mjs                            # hooks parse, settings valid, no em or en dash
node scripts/eidolon-audit.mjs                        # every reference named here resolves
node scripts/hooks-readme-check.mjs                   # hooks/README.md matches the code
```
