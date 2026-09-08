---
name: eidolon
description: Sets up a project so Claude Code understands it from the first message, and runs a spec-driven build pipeline for real work on it. In setup mode Eidolon reads your repo, works out which languages and tools you use, and writes the files Claude needs to work well: a CLAUDE.md, helper skills and slash commands, sub-agents, safety hooks, MCP setup, and the memory wiring (a written memory store plus a code map). In build mode it carries a work item from a spec through plan, build, a security review swarm, a cold-context verify, and a committed close, with human gates along the way. Use this whenever someone wants to set up, configure, or get a repo ready for Claude Code, or to build, change, or fix something in it, even if they do not say the word eidolon.
trigger: /eidolon
---

# /eidolon

Any repo → detected stack → a complete, verified Claude Code environment.
Four phases, eleven stages (1 to 10 plus the 2.5 persona interview), three
operator checkpoints, and six consent-gate moments (install, seat, deploy,
irreversible, unattested sensitive dispatch, evolve-run confirm). Autonomous
execution, consent-gated side effects: nothing is
written before the plan is approved, and every generated command is verified
against an independent second signal before it ships.

## Usage

```
/eidolon                      # run on current directory
/eidolon <path>               # run on a specific repo
/eidolon <path> --dry-run     # stages 1-2 only: recon + plan, never writes
/eidolon <path> --no-capture  # skip Stage 7 (MemPalace/Graphify fan-out)
/eidolon <path> --no-mcp      # skip Stage 8 (MCP wiring)
```

## INVARIANTS (apply to every stage)

```yaml
docs:
  facts:  declarative config blocks (yaml/toml/json)   # never prose
  rules:  one terse imperative line each               # never paragraphs
  why:    header comment above the block               # the only place rationale lives
  prose:  none                                          # no narrative, no essays
output_shape:                                           # mirror existing skills exactly
  skill:  SKILL.md(frontmatter: name+description+trigger; body: numbered no-skip steps)
  refs:   references/*-template.md
  hooks:  hooks/*.mjs + hooks/*.ps1 + hooks/README.md(table: hook|trigger|enforcement)
manifest:
  root:   .claude/eidolon-manifest.yaml
  rule:   every generated artifact carries last_verified + a verify gate    # trust-tree.yaml model
gating:
  model:  plan all stages → approve → execute with checkpoints
  gates:  after Stage 2, after Stage 6, after Stage 8
  consent_gates:                                        # autonomous execution, consent-gated side effects
    rule:   do ALL the work without asking; pause ONLY where an action is installing,
            irreversible, deploying, or seating an identity
    moments: install a skill (Stage 4) | seat the primary persona (Stage 2.5 ratify,
             Stage 10 seat) | deploy (SHIP) | run an irreversible op (the ask tier) |
             dispatch destructive/sensitive work with no valid security attestation (the ask tier,
             hooks/dispatch-attestation-guard.mjs; references/security-awareness.md) |
             confirm an evolve run -- the preflight --confirmed true flip that unlocks the engine's
             mutate/evaluate loop on a real compute budget (the ask tier, one confirm per run,
             hooks/evolve-engine-guard.mjs; references/evolve-engine.md)
    shape:  one AskUserQuestion each, with a why/liability line; never a typed menu
verification:                                           # the load-bearing discipline
  funnel: REFERENCE trust-but-verify SKILL.md § "what verification MUST be"  # do not restate
  rule:   no generated command ships unverified; tag every claim EXTRACTED|INFERRED|AMBIGUOUS
  state:  verify a tool CHANGED STATE (files/rows/tokens>0), not that it reported success  # "returned N" != mutation
  fanout: probe a swarm/fan-out with ONE item and verify the mutation before scaling       # subagents can run read-only or get cut off mid-task
  triage: root-cause a failing tool BEFORE working around it (read its logs/transcripts)   # abandoning-without-diagnosis ships a broken feature
graphify:
  default: --update                                     # AST, EXTRACTED edges, cheap
  deep:    --mode deep                                  # manual only - god nodes / edge digs
pairing:                                                # ai-pairing-playbook is RUN-TIME, eidolon is BUILD-TIME
  axis:   eidolon installs the room; ai-pairing-playbook is how you move in it - do not merge
  emit:   eidolon ships the playbook's partner-notes artifact (Stage 3); it never inlines the 6 shifts
  tells:  structural-izable drift-tells → hooks (Stage 6); judgment/comms tells → partner-notes doc
  lanes:  name the playbook's lane (mechanical|judgment|closure) at each checkpoint
orchestration:                                          # running subagents and swarms; the dispatcher sets the tone for the operation
  persona: the Expediter - the controller's executive dispatcher; thinks like a restaurant
           expediter, executes like a business prodigy. Allocates the operation's attention,
           calls each work item by name, and lets nothing ship unverified.
  lock:    the Expediter seat belongs to the MAIN SESSION only. A dispatched subagent that
           seats or claims it is HARD STOPPED and the seat is automatically deactivated
           (hooks/persona-conduct-guard.mjs, verdict subagent-expediter). Subagents seat
           working personas from references/personas/; they never conduct the orchestra.
  method:  DMAIC - Define the task and its done-criteria. Measure the baseline with a full
           read-only inventory BEFORE any dispatch. Analyze real scope against noise.
           Improve in small controlled waves. Control by verifying every wave by STATE
           before the next one fires.
  standard: references/conductor-standard.md - the field-proven operating standard (operator-
           ordered 2026-06-12): the conductor lanes (conducts, supervises by state, runs gates
           of record, merge surgery, hook infra - NEVER builds inline what a fenced swarm can),
           the swarm-first dispatch law, personas on every dispatch with no exceptions, the
           model cascade, the spec foundry (idle capacity works ahead read-only), and edge-only
           human gates. Where an older clause here or in any reference permits inline building,
           optional persona seating, or cost-timid fan-out, the standard SUPERSEDES it; its
           anti-patterns index maps each replaced clause.
  discipline:                                           # the five operating rules every wave answers to
    done_is_the_outcome:  "done" means the outcome the work exists for is true and observed,
                          never merely that a gate ran green; name the outcome signal before
                          starting and verify that exact signal before saying done
    measure_before_build: a read-only Measure wave precedes any build wave; inventory the
                          real data, files, and running system, and bind the plan to what is
    scope_every_claim:    scope every claim to what was actually run and read back; a gate is
                          "green" only after the controller's OWN full-gate run, output read
    verify_by_execution:  verify by EXECUTING the thing and observing - run the regex against
                          the exact strings, fire the guard, render the view; reading is a
                          hypothesis, never a verification
    evidence_first:       when challenged, answer with evidence before explanation - the file
                          and line, the command output, the failing element
  waves:   small and controlled; verify each wave before the next; a failing wave HALTS the
           line and is root-caused, never pushed past (kaizen, not bulldozing)
  verify:  a subagent's "done" report is a claim to verify, not a result to repeat - confirm
           the state change landed (files changed / git status / row counts / live signal)
  supervise: watch the line by STATE, not by reports - TaskOutput may not track a background
           agent; brief agents OFF known-dead and forbidden tools so they neither wander nor hang
  advisor: subagents NEVER call an advisor tool (hooks/advisor-guard.mjs hard-stops it); the
           controller routes uncertainty by type - factual to a research agent, fork-level to
           the decision tools, behavioral to the verification gates
  authority: hook and loop infrastructure is the Expediter's alone, controller-direct, and
           only ever BENEFICIAL - a guard may be made more accurate (fewer false catches,
           never fewer true ones), proven by executing its logic before and after, disclosed
           in a fix log; disabling enforcement or dodging a live catch is forbidden
  loops:   long-running work runs as bounded single-iteration loops with budgets, leases, and
           halt codes - the shape and its safety rules live in references/loop-suite.md
  antipattern: HEADLONG ORCHESTRATION - fanning out before Define+Measure, bulk changes with
           no baseline, no per-wave verify. Headlong changes to the staff sink the service.
```

## Modes

Eidolon runs in one of three modes. Pick by what was asked; state which at the top.

```yaml
setup:  no work item, or "set up / configure this repo"  ->  run the ten stages below (install the room)
build:  a work item to build, change, or fix             ->  run the Build pipeline (work in the room)
evolve: a MEASURABLE numeric-optimization / AI-R&D item   ->  run the Evolve pipeline (the vendored
        - a scorer exists that ranks candidate solutions       ASI-Evolve toolbelt, agent-driven)
```

Setup installs the environment once. Build runs each time there is real work.
Build's SPECIFY stage reuses Setup's recon and Interview Mode; it does not
re-install. If both apply (a fresh repo plus a first work item), run setup, then
build.

Evolve is the narrow mode: it applies ONLY when the work item is an evaluator-driven
search - a measurable scorer ranks candidate solutions. Without a scorer it is a
build, not an evolve. Evolve drives the vendored ASI-Evolve toolbelt
(engine/asi-evolve/) as the agent-driven engine - Claude is the engineer - and routes
the scored result back through verification and memory; the contract is
references/evolve-engine.md.

## What You Must Do When Invoked

If no path was given, use `.` (current directory). Do not ask for a path.
Follow the phases in order. Do not skip stages. Honor the three checkpoints.

---

### PHASE A - Recon + Plan

#### Stage 1 - Recon (read-only, no writes)

Detect the repo's shape. Read silently; present a clean summary, not raw output.

```bash
# stack + entry points + commands
test -f package.json && cat package.json | python3 -c "import sys,json;d=json.load(sys.stdin);print('node',d.get('scripts',{}))" 2>/dev/null
test -f pyproject.toml && grep -E '^\[tool|^name|^requires' pyproject.toml 2>/dev/null
test -f go.mod && head -3 go.mod 2>/dev/null
test -f Cargo.toml && grep -E '^name|^edition' Cargo.toml 2>/dev/null
# existing claude-code state
ls -la .claude/ 2>/dev/null; test -f CLAUDE.md && wc -l CLAUDE.md
ls .claude/skills .claude/agents .claude/commands 2>/dev/null
git rev-parse --is-inside-work-tree 2>/dev/null && git config --get remote.origin.url
ls .git/hooks/ 2>/dev/null | grep -v sample
```

Present:

```
Repo: <name> · <N> files
  stack:     <languages + frameworks detected>
  build:     <cmd or "none found">
  test:      <cmd or "none found">
  existing:  CLAUDE.md(<lines>) · skills(<n>) · agents(<n>) · hooks(<n>)
  git:       <remote or "local only"> · existing hooks: <list or none>
```

Skip and count sensitive files (`.env`, keys, secrets) - never print their names.

#### Stage 2 - Plan

Synthesize the tailored 10-stage plan for THIS repo. Mark each artifact
`new` or `merge` (if it already exists). Present the plan.

```
🛑 CHECKPOINT 1 (judgment-lane) - approve plan before any write.
   Use AskUserQuestion: [Approve] [Edit scope] [Dry-run only]
```

---

### PHASE B - Structure

#### Stage 2.5 - Primary persona interview

The house agent for this repo, built by the same machine that builds the
swarms and held to the same anti-synthetic rail (no anchor, no seat). One
AskUserQuestion round, proposed from Stage 1 recon and ratified by the user:
register, mandate, anchors (the rail, satisfied with consent), specific
anti-behaviors, voice. Assemble against references/persona-template.md, lint
with scripts/persona-lint.mjs (a FAIL re-prompts the anchors question, never
seats), then ratify: [Seat it] [Edit] [Explain]. The full contract is
references/primary-persona.md. Seating itself happens at Stage 10, so the
guard enforces from the first message of the next session.

#### Stage 3 - CLAUDE.md

Generate declarative core. Facts as config; rules as imperative lines; no prose.
If CLAUDE.md exists, merge - never overwrite. Reference skills/graph, don't inline them.
Reference the primary persona (references/personas/<project>-primary.md), never inline it.

```markdown
## Stack
<lang/framework/version as a list>
## Commands
build: <cmd>
test:  <cmd>
lint:  <cmd>
## Rules
- Run test before declaring any task done.
- Verify each claim against an independent second signal.
- Never force-push. Never edit an append-only log to shrink it.
## Memory
- Prose memory: MemPalace (see Stage 7).
- Structural graph: graphify-out/graph.json (see Stage 7).
## Pairing
- Partner notes (how to prompt on this project): docs/working-with-claude.md
```

Then emit the partner-notes doc itself - do NOT inline its content here:

```bash
# source of truth is the installed ai-pairing-playbook skill; adapt examples to detected stack
test -f ~/.claude/skills/ai-pairing-playbook/references/PARTNER-NOTES-template.md \
  && cp ~/.claude/skills/ai-pairing-playbook/references/PARTNER-NOTES-template.md docs/working-with-claude.md \
  || echo "AMBIGUOUS: ai-pairing-playbook not installed - install it; eidolon references, never copies, the 6 shifts"
```

#### Stage 4 - Skills + slash commands

For each capability the repo needs, generate
`.claude/skills/<name>/SKILL.md` (frontmatter + numbered no-skip steps) and
`.claude/commands/<name>.md`. Add `references/*-template.md` only when the
skill emits a repeating artifact.

For a skill Eidolon authors for ITSELF from a recurring, PROVEN gap (not generated
once for the target, not discovered externally), use the gated authoring flow: build
it against `references/skill-template.md`, lint it with `scripts/skill-lint.mjs` (the
rail: no trigger, no eval, no skill), independent-test-gate its evals, then consent +
install. Doctrine: `references/skill-authoring.md`; maker:
`references/personas/skill-author.md`; worked example: `references/example-skill/SKILL.md`.

When a named gap is NOT coverable by a generated skill (a niche language, a
framework with its own idioms, a regulatory domain), reach beyond the installed
set. Three actors, never collapsed into one (references/find-skills-reach.md):

```
discover -> dispatch skill-scout (references/agents/skill-scout.md) for the ONE
            named gap; it returns ranked candidates as evidence, installs nothing
decide   -> ONE AskUserQuestion per gap: candidate name + source + license +
            verbatim frontmatter description, with a why/liability line.
            [Install it] [Skip] [Show me the SKILL.md first] [Find other options]
install  -> on the explicit yes, the controller installs (marketplace add +
            plugin install, or copy the folder into .claude/skills/<name>/),
            VERIFIES before trusting (frontmatter parses, smoke check), then
            RECORDS (CREDITS.md with license, decision-log row). Verify that the
            current host discovers the skill after install; do not require a restart unless
            that host/version or integration actually needs one.
```

#### Stage 5 - Subagents

Generate `.claude/agents/<name>.md` - scoped, each with its own context window
and trigger. Default set: a `verifier` (runs the second-signal funnel), a
`reviewer` (security/quality pass), and the standing `skill-scout` (copy
references/agents/skill-scout.md into `.claude/agents/`, so later gaps reuse
the same discover/decide/install path). Add stack-specific agents as detected.

#### Stage 6 - Hooks (governance gates, BOTH layers)

Emit two layers, because each does what the other cannot (hooks/README.md,
"The two-layer floor"):

Layer A - the permission deny floor, into the target's `.claude/settings.json`.
Evaluated by Claude Code's own parser, so it survives `disableAllHooks`:

```json
"permissions": {
  "deny": [
    "Bash(git push --force *)",  "Bash(git push * --force *)",
    "Bash(git push -f *)",       "Bash(git push * -f *)",
    "Bash(git config*core.hooksPath*)",
    "Bash(git filter-branch *)", "Bash(git filter-repo *)",
    "Write(**/.claude/settings.local.json)",
    "Edit(**/.claude/settings.local.json)"
  ]
}
```

Layer B - the hook suite: generate `hooks/*.mjs` (Node) + `hooks/*.ps1`
(PowerShell) + `hooks/README.md` (table). Wire the consolidated dispatcher
shape in `.claude/settings.json`: one `guard-bash` entry, one `guard-write`
entry, the `.*advisor.*` entry, and the standalone `Task` entry for
`dispatch-attestation-guard` (four entries; see hooks/README.md "Wiring"). Mirror the verdict tiers: advisory injects
`additionalContext`; ask emits `permissionDecision "ask"` (the consent tier);
hard block exits `2`.

```
events:    PreToolUse | PostToolUse | SessionStart | PreCompact
default gates:
  protected-paths-guard     PreToolUse(Bash)        exit 2 on rm/del of protected paths
  append-only-record-guard  PreToolUse(Write/Edit)  exit 2 on emptying (or a >50% Write
                                                    shrink of) an append-only log
  commit-quality-guard      PreToolUse(Bash)        exit 2 on --no-verify / --force / DROP
  settings-integrity-guard  PreToolUse(Write/Edit)  exit 2 on disableAllHooks:true or on
                                                    dropping a manifest-wired hook entry
  verification-guard        PreToolUse(Bash)        exit 2 on a commit claiming a visual or
                                                    runtime result without naming evidence
```

```
🛑 CHECKPOINT 2 - review CLAUDE.md / skills / agents / hooks before wiring memory.
   Use AskUserQuestion: [Continue to wiring] [Revise structure]
```

---

### PHASE C - Wiring

#### Stage 7 - Dual-capture fan-out (MemPalace prose + Graphify graph)

One trigger → two sinks → two payloads. Not a mirror: prose memory and a
structural graph are different views. Generate BOTH trigger paths.

Verify the tools FIRST (do not assume invocations):

```bash
# Graphify - package is graphifyy (two y's), CLI is graphify
python3 -c "import graphify" 2>/dev/null || echo "AMBIGUOUS: graphify not installed - pip install graphifyy --break-system-packages"
# Windows PATH caveat: if 'graphify' unresolved, add %APPDATA%\Python\Python3xx\Scripts or use pipx
# MemPalace - detect the real capture command; do NOT hardcode a guess
command -v mempalace 2>/dev/null || claude plugin list 2>/dev/null | grep -i mempalace || echo "AMBIGUOUS: confirm MemPalace capture invocation before wiring"
```

The auto-miner is ONE portable script (`hooks/memory-sync.post-commit.sh`)
wired on up to two legs. It is hardened against three failure modes that a naive
"two paths fire the same captures" wiring walks straight into (each lesson
field-proven; provenance in `docs/decisions/2026-06-11-hardened-automine.md`):

```yaml
foundation:   git-native (.git/hooks/post-commit or a tracked core.hooksPath dir)
              is the FOUNDATION, not a co-equal of the Claude Code leg. A
              PostToolUse(Bash) hook fires only when the commit ran through the
              agent's tool call, and the harness is NOT guaranteed to invoke it
              (probe-verified: a wired entry went uninvoked while the script ran
              clean when driven directly). Human / script / subagent commits never
              reach it. The git-native hook fires on EVERY commit from ANY source.
dedup:        two legs firing sub-seconds apart can BOTH start a capture, and
              concurrent captures corrupt the vector index (HNSW segment desync).
              Two guards make a double-fire a no-op: (1) already-synced - sentinel
              head == HEAD -> skip; (2) atomic lock - `mkdir` is atomic on every
              POSIX fs and Windows git-bash, so exactly one racer proceeds; a stale
              lock (>15 min) is removed and retried once.
observability: never silence the cascade into /dev/null. Log the fire, the skip,
              and each stage exit to .claude/.memory-sync.log - a silenced cascade
              once hid a non-firing trigger for 13 commits; the silence cost the
              time, not the bug.
```

```
Leg 1 (FOUNDATION) - git-native: copy hooks/memory-sync.post-commit.sh to
  .git/hooks/post-commit (chmod +x), or into the repo's core.hooksPath dir for a
  clone-portable, tracked hook. Fires on every commit from any source.
Leg 2 (OPTIONAL) - Claude Code PostToolUse(Bash, git commit): run the SAME script
  for in-agent immediacy. The dedup makes the overlap with leg 1 safe.
```

Fill `<CAPTURE_CMD>` + `<WING>` in the template with the repo's verified MemPalace
invocation (the detection above); graphify auto-detects on PATH. The template
ships the lock, the dedup, the logging, and the synced-head sentinel already
wired - the installer fills only the two capture placeholders. When the repo is
configured for codebase-memory-mcp (Stage 8), the template's reindex leg also
refreshes that index on every commit (gated on `.claude/codebase-memory.json`); a
repo without it is unaffected.

The SessionStart ORIENT leg has a PRIMARY + FALLBACK pair for the structural graph:
codebase-memory-orient (PRIMARY - sources god nodes + layers from the
codebase-memory-mcp index, when installed) and graphify-orient (the automatic
FALLBACK - surfaces graphify-out/GRAPH_REPORT.md only when the primary produced
nothing this session, detected via a per-session sentinel). Either satisfies the
orient-gate's structural half. See the hooks/README.md orient-trio note.

#### Stage 8 - MCP config

Wire the structural-graph MCP server so agents query the graph instead of re-reading.
codebase-memory-mcp ships a real MCP server (a local C binary; 158 languages, sub-ms
Cypher/trace queries); graphify is CLI-only (`graphify query/path/explain`) with NO MCP
entrypoint, so do NOT template a `graphify --mcp` line - it would create a broken server.

```json
// .claude/settings.json → mcpServers (or a project .mcp.json)
{ "codebase-memory-mcp": { "command": "<abs path to codebase-memory-mcp[.exe]>", "args": [] } }
```

Install the binary (binary-only, NO agent-config side effects - e.g. the installer's
`--skip-config`, or a package manager that does not run the bundled `install`), then index
the repo and write the orient config that codebase-memory-orient + the reindex leg read:

```bash
codebase-memory-mcp cli index_repository '{"repo_path":"<repo>","persistence":true}'
codebase-memory-mcp cli list_projects '{}'   # -> the exact project name it registered
# then write .claude/codebase-memory.json: { "project": "<name>", "exe": "<abs path>" }
# (machine-specific, gitignored; the CLI scopes by project name, and the agent-process
#  PATH may not yet include the binary, so both are carried explicitly)
```

```
🛑 CHECKPOINT 3 - review fan-out + MCP before commit-of-record.
   Use AskUserQuestion: [Finalize] [Adjust wiring]
```

---

### PHASE D - Verify + Closeout

#### Stage 9 - Verify (two-signal funnel on everything generated)

For every generated command/path/claim: state it, name an independent signal,
run the check, record the result. Tag EXTRACTED | INFERRED | AMBIGUOUS.

```bash
test -f .claude/settings.json && python3 -c "import json;json.load(open('.claude/settings.json'))" && echo "settings.json: valid JSON [EXTRACTED]"
for h in hooks/*.mjs; do node --check "$h" && echo "$h: parses [EXTRACTED]"; done
graphify --update --no-viz >/dev/null 2>&1 && echo "graphify runs [EXTRACTED]" || echo "graphify: [AMBIGUOUS] verify install/PATH"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && echo "post-commit path valid [EXTRACTED]"
# the primary persona must pass the rail before Stage 10 may seat it
node scripts/persona-lint.mjs references/personas/*-primary.md && echo "primary persona: PASS [EXTRACTED]"
# every Stage 4-installed skill: frontmatter parses + one-line smoke check before its findings are trusted
for s in .claude/skills/*/SKILL.md; do head -1 "$s" | grep -q '^---$' && echo "$s: frontmatter [EXTRACTED]"; done
```

Any `AMBIGUOUS` result blocks closeout until resolved or explicitly waived.

#### Stage 10 - Manifest + seat the persona + self-auditing closeout

Emit the artifact registry and the log scaffolding, then seat the ratified
primary persona: write `.claude/active-persona.json` (persona id, title,
anchors, both anti-behavior layers), so the conduct guard enforces it from
message 1 of the next session. Seat only a persona that passed Stage 9's lint;
the guard's own seat-time gate (no anchor, no seat) is the last line, not the
plan.

```yaml
# .claude/eidolon-manifest.yaml
version: "0.1.0"
generated: <YYYY-MM-DD>
artifacts:
  - path: CLAUDE.md           kind: core      status: <new|merge>  last_verified: <date>
  - path: .claude/skills/...  kind: skill     status: ...          last_verified: <date>
  - path: hooks/...           kind: hook      status: ...          last_verified: <date>
  - path: hooks/dispatch-attestation-guard.mjs  kind: hook  wired: PreToolUse(Task)  last_verified: <date>  # the consent gate; list it so settings-integrity-guard protects it
  - path: hooks/security-surface.mjs            kind: hook  wired: SessionStart      last_verified: <date>  # template; the security-awareness surface
  - path: hooks/evolve-engine-guard.mjs         kind: hook  wired: PreToolUse(Bash) via guard-bash  last_verified: <date>  # evolve mode: the consent gate; rides the dispatcher
  - path: engine/asi-evolve/   kind: engine    status: vendored  upstream: GAIR-NLP/ASI-Evolve@fb8a67e  license: Apache-2.0  last_verified: <date>  # only when evolve mode is used
  - path: references/evolve-engine.md  kind: reference  last_verified: <date>  # the evolve engine contract
  - path: .git/hooks/post-commit  kind: capture  last_verified: <date>
logs:
  fixes:    docs/fixes/        # FIX-YYYY-MM-DD-<slug>.md, flat markdown
  insights: docs/insights/     # INSIGHT-YYYY-MM-DD-<slug>.md, frontmatter + body
```

Print a final summary: artifacts written, anything left AMBIGUOUS, next action.
Do not declare done while any AMBIGUOUS item is unresolved.

---

## Build pipeline (spec-driven mode)

The staged line from a work item to a committed change. Each arrow is a gate
where a human can approve, edit, or stop. Only CLOSE commits; everything before
it lives in the working tree, so the rollback for a bad run is the pre-run git
state, stated before CLOSE runs.

```
  work item
    ->  SPECIFY   (reuse Stage 1 recon + Setup Interview Mode)   ->  the spec
        [gate 1: approve the spec before any tokens burn]
    ->  PLAN      (components, order, risk tier, cost ceiling)   ->  the plan
        [gate 2: approve the plan on standard or larger work]
    ->  BUILD     (engineering swarm builds against the spec, one task at a time, test first)
    ->  REVIEW    (by tier: security red/blue, trust-and-safety, code-review)  ->  findings
    ->  SYNTHESIZE (solutions architect: one ordered disposition of every finding)
    ->  VERIFY    (cold-context: rubric + independent second signal) ->  PASS | red
        red and under three tries  ->  FIX (bounded); 3rd red  ->  re-plan, do not re-fix
        [gate 3: visual or runtime check; the user is the final eyes]
    ->  SHIP      (ship-and-upload: deploy-readiness interview, then deploy)   # when the change deploys
    ->  CLOSE     (commit of record + decision-log entry + memory sync)
```

### The load-bearing rules

```yaml
# why: these four are the spine; everything else is detail layered on them
cold_context:        VERIFY is spawned with only the diff, the spec, and the rubric.
                     It cannot inherit BUILD's reasoning; it re-derives PASS or red itself.
fix_loop:            bounded at three. A third red means the plan was wrong: re-plan,
                     do not grind fixes. If the re-plan also fails, surface the open
                     findings to the user. Never exhaust the loop and ship.
only_close_commits:  nothing commits before CLOSE. State the pre-run git SHA as the
                     rollback path before CLOSE runs.
human_gates:         gate 1 (approve the spec) and gate 3 (visual/runtime) are required;
                     gate 2 (approve the plan) is required on standard or larger work.
surface_one:         findings are surfaced one at a time via AskUserQuestion, never a
                     typed menu, each with a liability line (who is harmed if wrong).
```

### Tier and cost ceiling (picked at PLAN, shown to the user)

```yaml
# why: scale the pipeline to the change so the cure does not become its own drift
trivial:    one file, no new surface              ->  BUILD, code-review tidy, VERIFY;
                                                       no security, trust-and-safety, or architect
standard:   a feature or surface change           ->  add security, trust-and-safety, and
                                                       code-review swarms at small fan-out, plus the architect
high_risk:  auth / payments / PII / public surface ->  full fan-out, full antibehavior pass,
                                                       escalate to independent review where the trust tree says so
# SHIP is a stage (see the pipeline diagram and step 9), not a risk tier: it runs whenever the change deploys
ceiling:    each tier states a max subagent count and token budget at PLAN.
            on approach, pause and ask: raise the ceiling or narrow scope. never spend without limit.
```

### Governance (referenced, not restated here)

```yaml
decision_tree:   docs/spec design § 8 - severity = base x blast radius; two signals or it is
                 not a finding; HIGH/CRITICAL need root cause; bypass double-gated; a circuit
                 breaker halts a run when most of four-plus findings are bypassed.
uncertainty:     docs/spec design § 9 - subagents return literal evidence (file excerpt, tool
                 output, URL + response), never "I checked"; the orchestrator inspects that
                 evidence itself and names the second signal; hedged language is refused.
security_swarm:  references/security-swarm.md - red/blue methodology, the coverage manifest,
                 the seeded-defect fire drill, the five anti-handwave gates.
security_awareness: references/security-awareness.md - the read-hash-quiz-externally-grade-attest
                 comprehension loop (adapted from slartz/agent-security-awareness-training, MIT);
                 the agent reads references/security-policy.md, is graded by an EXTERNAL validator,
                 and a destructive/sensitive dispatch with no valid signed attestation asks the human
                 (hooks/dispatch-attestation-guard.mjs, ask; hooks/security-surface.mjs surfaces the
                 status; scripts/security-attestation.mjs signs/verifies, reusing the review receipt).
                 A SOFT layer: it asks, it never replaces the deterministic gates.
explain_mode:    references/explain-mode.md - plain-language teaching, comprehension checks,
                 the favorite-teacher disposition; available at every stage on request.
personas:        references/persona-template.md - the ten-part construction template, the
                 two anti-behavior layers, the anti-synthetic rail. references/personas/*.md
                 are the built personas (slice 1 ships the full-stack engineer).
primary_persona: references/primary-persona.md - Stage 2.5: the user's own house agent,
                 interviewed into existence from recon + five ratified questions, assembled
                 against the template, linted by the same rail (a FAIL re-prompts, never
                 seats), and seated at Stage 10 (.claude/active-persona.json) so the conduct
                 guard enforces from message 1.
engineering_swarm: references/engineering-swarm.md - builds against the spec, TDD per task,
                 with the seeded-failing-test fire drill and the no-stub closeout gate.
conduct_guard:   hooks/persona-conduct-guard.mjs - checks a seated persona against its own
                 declared anti-behaviors (.claude/active-persona.json) and enforces the rail at
                 the seat boundary (teeth but no anchor does not get to act); halts and names the line.
trust_safety_swarm: references/trust-safety-swarm.md - harm, abuse, privacy/PII, a11y, fairness
                 (GDPR, CCPA, WCAG 2.2); the seeded-PII fire drill and the coverage manifest.
code_review_swarm: references/code-review-swarm.md - behavior-preserving only; a behavior change
                 is a finding for engineering; the suite-guards-behavior fire drill.
architect_synthesis: references/architect-synthesis.md - ingests every swarm's findings plus the
                 three logs in one pass; the disposition table; no finding silently dropped.
ship_upload_swarm: references/ship-upload-swarm.md - the deploy-readiness interview (reuses
                 Interview Mode) and the SHIP stage; the seeded missing-env-var / staged-secret
                 fire drill; no deploy on a red gate; the user is the final eyes.
expert_hiring:   references/expert-hiring.md - when recon finds a need the base roster does not
                 cover, generate a grounded expert against the template, gated at PLAN; the
                 anti-synthetic rail (scripts/persona-lint.mjs) rejects an ungrounded hire.
find_skills:     references/find-skills-reach.md - pull an installable skill for a named
                 capability gap; consent before install, verify before trust. The three-
                 actor split is structural: skill-scout (references/agents/skill-scout.md)
                 discovers read-only and returns evidence; the controller holds the
                 AskUserQuestion gate and the install (a subagent cannot pause the human).
skill_authoring: references/skill-authoring.md - Eidolon authors a skill for ITSELF from a
                 recurring PROVEN gap (the skill analog of expert-hiring): build against
                 references/skill-template.md, lint with scripts/skill-lint.mjs (the rail:
                 no trigger, no eval, no skill), independent test-gate the evals, human
                 consent + install, then govern the library. Distilled-from-success only;
                 one-shot speculation is worse than nothing (EvolveTool-Bench).
antibehavior_catalog: references/antibehavior-catalog.md - the unified deduplicated drift
                 catalog (section 10); each row names its owning stage and enforcing hook.
hook_suite:      hooks/README.md - the full governance hook suite (section 11): the
                 verification, commit-quality, append-only, persona-conduct, hook-integrity,
                 deletion, protected-paths, visual-evidence, conduct, drift, settings-
                 integrity, advisor, dispatch-attestation, and evolve-engine guards, plus
                 the orient/surface and session hooks; see the table for the full set.
scaling:         references/scaling.md - the three risk tiers, the cost ceiling, and the
                 in-session vs cross-session decision (section 12).
cross_session:   references/cross-session.md - the higher isolation tier: a separate session
                 verifies from a self-contained packet (scripts/verify-packet.mjs), graduated
                 per run on high-risk work.
review_receipt:  references/review-receipt.md - a signed, re-judgeable attestation of a review
                 verdict over a verify packet (scripts/review-receipt.mjs); the anti-synthetic
                 rail applies (no anchor, no receipt). Verify is deterministic (the evidence
                 re-hashes bit-identically, the Ed25519 signature is valid for a trusted key);
                 the verdict stays an AI judgment, re-judged within a declared agreement band.
process_doctrine: references/process-doctrine.md - the learned operating rules (calibrate
                 verification to risk; mind background work), surfaced at session start by
                 hooks/process-doctrine.mjs.
conductor_standard: references/conductor-standard.md - the 2026-06-12 uplift: conductor lanes,
                 swarm-first dispatch law, personas-every-dispatch, the model cascade,
                 supervise-by-state, done-is-the-outcome, the spec foundry, edge-only gates;
                 closes with the anti-patterns index mapping every clause it replaces.
process_supervision: references/process-supervision.md - dev-process staleness doctrine
                 (field-proven 2026-06-11): boot-id health stamps plus a git-sha code stamp as
                 next hardening, client staleness banners, restart drills with two-view proof;
                 Stage 1 recon records each dev process's reload/port/supervisor and Stage 9
                 treats an unsupervised non-reloading dev process as a finding to surface.
heartbeat_loops: references/loop-suite.md (2026-06-12 section) - the standing self-rearming
                 heartbeat at the lease-window cadence: state pulse, zombie reap with
                 state-injected respawns, one swarm-conducting wave per firing, parks only at
                 human gates; 25-minute default leases; a stale queue is a defect to re-seed.
evolve_engine:   references/evolve-engine.md - the evolve mode's engine contract: the vendored
                 agent-driven ASI-Evolve toolbelt (engine/asi-evolve/, Apache-2.0) run on a
                 MEASURABLE numeric-optimization work item, Claude the engineer, the preflight
                 --confirmed flip consent-gated (hooks/evolve-engine-guard.mjs), the engine's
                 reported best score re-verified COLD as the second signal, the distilled result
                 routed to docs/notes + mempalace + the manifest. The DELIBERATE home for the
                 population-search / numeric-fitness machinery references/loop-suite.md's fence
                 holds out of the delivery loop (ADR docs/decisions/2026-06-16-fold-asi-evolve-
                 evolve-mode.md); the fence now cross-references this mode, not contradicts it.
```

### What you must do in build mode

1. Confirm the mode out loud and state the pre-run git SHA as the rollback path.
2. SPECIFY: reuse recon (Stage 1) and Setup Interview Mode; write the six core
   areas and `.claude/session.yaml`. Stop at gate 1 for approval.
3. PLAN: name the tier and the cost ceiling; split into dependency-ordered tasks,
   each with an acceptance check and a verify step. If recon found a need the base
   roster does not cover, hire an expert here (generate it against the template,
   gated at this checkpoint; the anti-synthetic rail rejects an ungrounded hire).
   Stop at gate 2 on standard or larger work.
4. BUILD: dispatch the engineering swarm and seat its persona (write the persona's
   anchors and anti-behaviors to `.claude/active-persona.json`; the conduct guard enforces
   the anti-behaviors and refuses to act for a seat that names no anchor: no anchor, no seat).
   One task at a time, test first (the test red before the change, green after),
   against the spec. No scope drift; new ideas go to the work queue, never the live diff.
5. REVIEW: by tier, run the security swarm (red finds, blue hardens), the
   trust-and-safety swarm, and the code-review swarm, in parallel. Each red finding
   becomes a blue hardening task, closed only when its post-fix verify passes; a
   code-review behavior change is a finding for engineering, not a silent edit.
   Dispatching these sensitive swarms (and any destructive or deploy work) surfaces the
   security attestation status; with no valid signed attestation in effect, the dispatch
   asks the human (the consent tier, hooks/dispatch-attestation-guard.mjs;
   references/security-awareness.md). Awareness is a soft layer; the gate asks, it never blocks.
6. SYNTHESIZE: the solutions architect ingests every swarm's findings plus the three
   logs in one pass and produces one ordered disposition table; no finding is
   dropped. The plan it commits to is gated before continuing.
7. VERIFY: spawn the cold-context verifier with only the diff, spec, and rubric.
   On a high-risk graduated run, assemble a verify packet (scripts/verify-packet.mjs)
   and verify in a separate session (references/cross-session.md). Red under three
   tries enters the bounded fix loop; a third red re-plans.
8. Gate 3: hand the visual or runtime result to the user as the final eyes. A
   screenshot proves the render happened, not that it is right.
9. SHIP (when the change deploys): the ship-and-upload swarm runs a deploy-readiness
   interview, then deploys only when every checklist item is green with its signal and
   every upstream manifest is clean. The user approves the deploy as the final eyes.
10. CLOSE: only now commit. Write the decision-log entry and run the memory sync.
   On a review anchored to a named framework, emit a signed review receipt
   (scripts/review-receipt.mjs) over the verify packet, so the verdict travels with the
   change as a tamper-evident, attributable record (references/review-receipt.md).
   Do not declare done while any finding is unverified or any AMBIGUOUS stands.

---

## Evolve pipeline (numeric-optimization mode)

For a MEASURABLE evaluator-driven search - a scorer ranks candidate solutions - Eidolon drives the
vendored ASI-Evolve toolbelt (engine/asi-evolve/) as the agent-driven engine. Claude is the
engineer; the toolbelt is deterministic bookkeeping (cognition store, experiment DB, samplers, run
state). The full contract, the toolbelt commands, and the ASI-Evolve->Eidolon mapping live in
references/evolve-engine.md; read engine/asi-evolve/SKILL.md for the engine's own operating policy.

```
  work item (a measurable optimization problem with a scorer)
    ->  FRAME    (confirm a numeric evaluator exists; reuse Stage 1 recon + Interview Mode for the
                 objective, score, evaluator + MANDATORY timeout, writable scope, round budget)
        [gate 1: approve the evolve framing + round/compute ceiling before any tokens or compute burn]
    ->  SCAFFOLD (evolve-brief normalize -> .evolve_runs/<run>/; draft the run spec, NOT confirmed)
    ->  PROVISION (create engine/.venv on demand, pip install numpy + pyyaml; the install moment)
    ->  CONFIRM  (evolve-brief normalize ... --confirmed true: the SINGLE consent gate -- it unlocks
                 the mutate/evaluate loop; hooks/evolve-engine-guard.mjs asks the human here)
    ->  ROUNDS   (per round: evolve-db sample a parent -> design the next candidate (cognition lookup
                 or web refresh) -> evolve-files write inside the mutation scope -> evolve-eval run ->
                 analyze -> evolve-db record. Serialize evolve-db; one task of search per round.)
    ->  VERIFY   (the score IS the second signal: re-run the evaluator COLD on the best candidate and
                 confirm the engine's reported score reproduces; a non-reproducible score is a RED)
    ->  ROUTE    (distilled lessons -> docs/notes/EVOLVE-<slug>-<date>.md + mempalace; the verified
                 best program -> the working tree as a candidate; the run -> the manifest)
    ->  CLOSE    (only now commit, same CLOSE as build: decision-log entry + memory sync)
```

### The evolve load-bearing rules

```yaml
# why: an evolve run mutates files and burns compute; bound it and trust nothing unverified
scorer_required:    no evaluator, no evolve. If you cannot name the number that goes up, run build.
consent_to_run:     the preflight --confirmed true flip is the one consent moment (install + unlock
                    the mutate/evaluate loop); never self-confirm because the task seemed detailed.
score_is_second_signal: the engine's reported best score is a CLAIM; VERIFY re-runs the evaluator
                    cold and reads the number itself (trust-but-verify on a scalar).
engine_is_vendored: Eidolon never edits engine/asi-evolve/ during a run; the run lives entirely
                    under .evolve_runs/ (gitignored) and only the distilled result enters the tree.
deps_isolated:      engine deps live in the on-demand venv engine/.venv (numpy + pyyaml; faiss /
                    sentence-transformers optional, graceful fallback); no LLM-API key; the skill
                    stays pure Markdown + .mjs.
fence_superseded:   evolve is the sanctioned home for the population-search / numeric-fitness
                    machinery references/loop-suite.md's fence holds out of the DELIVERY loop
                    (ADR docs/decisions/2026-06-16-fold-asi-evolve-evolve-mode.md).
```
