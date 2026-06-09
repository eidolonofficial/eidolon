---
name: eidolon
description: Sets up a project so Claude Code understands it from the first message, and runs a spec-driven build pipeline for real work on it. In setup mode Eidolon reads your repo, works out which languages and tools you use, and writes the files Claude needs to work well: a CLAUDE.md, helper skills and slash commands, sub-agents, safety hooks, MCP setup, and the memory wiring (a written memory store plus a code map). In build mode it carries a work item from a spec through plan, build, a security review swarm, a cold-context verify, and a committed close, with human gates along the way. Use this whenever someone wants to set up, configure, or get a repo ready for Claude Code, or to build, change, or fix something in it, even if they do not say the word eidolon.
trigger: /eidolon
---

# /eidolon

Any repo → detected stack → a complete, verified Claude Code environment.
Four phases, ten stages, three operator checkpoints. Nothing is written
before the plan is approved. Every generated command is verified against an
independent second signal before it ships.

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
  model:  plan all 10 → approve → execute with checkpoints
  gates:  after Stage 2, after Stage 6, after Stage 8
verification:                                           # the load-bearing discipline
  funnel: REFERENCE trust-but-verify SKILL.md § "what verification MUST be"  # do not restate
  rule:   no generated command ships unverified; tag every claim EXTRACTED|INFERRED|AMBIGUOUS
graphify:
  default: --update                                     # AST, EXTRACTED edges, cheap
  deep:    --mode deep                                  # manual only - god nodes / edge digs
pairing:                                                # ai-pairing-playbook is RUN-TIME, eidolon is BUILD-TIME
  axis:   eidolon installs the room; ai-pairing-playbook is how you move in it - do not merge
  emit:   eidolon ships the playbook's partner-notes artifact (Stage 3); it never inlines the 6 shifts
  tells:  structural-izable drift-tells → hooks (Stage 6); judgment/comms tells → partner-notes doc
  lanes:  name the playbook's lane (mechanical|judgment|closure) at each checkpoint
```

## Modes

Eidolon runs in one of two modes. Pick by what was asked; state which at the top.

```yaml
setup:  no work item, or "set up / configure this repo"  ->  run the ten stages below (install the room)
build:  a work item to build, change, or fix             ->  run the Build pipeline (work in the room)
```

Setup installs the environment once. Build runs each time there is real work.
Build's SPECIFY stage reuses Setup's recon and Interview Mode; it does not
re-install. If both apply (a fresh repo plus a first work item), run setup, then
build.

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

#### Stage 3 - CLAUDE.md

Generate declarative core. Facts as config; rules as imperative lines; no prose.
If CLAUDE.md exists, merge - never overwrite. Reference skills/graph, don't inline them.

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

#### Stage 5 - Subagents

Generate `.claude/agents/<name>.md` - scoped, each with its own context window
and trigger. Default set: a `verifier` (runs the second-signal funnel) and a
`reviewer` (security/quality pass). Add stack-specific agents as detected.

#### Stage 6 - Hooks (governance gates)

Generate `hooks/*.mjs` (Node) + `hooks/*.ps1` (PowerShell) + `hooks/README.md`
(table). Wire in `.claude/settings.json` under the matching event. Mirror the
advisory-vs-block pattern: advisory injects `additionalContext`; hard block
exits `2`.

```
events:    PreToolUse | PostToolUse | SessionStart | PreCompact
default gates:
  protected-paths-guard   PreToolUse(Bash)        exit 2 on rm/del of protected paths
  doc-integrity-guard     PreToolUse(Write/Edit)  exit 2 on shrinking an append-only log
  commit-quality-guard    PreToolUse(Bash)        exit 2 on --no-verify / --force / DROP
  verification-reminder   PreToolUse(Write/Edit)  advisory: verify before hedged language ships
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

Path 1 - plain git (`.git/hooks/post-commit`), detached + resource-guarded:

```sh
#!/bin/sh
# why: graph rebuilds are CPU-heavy and pile up; guard prevents saturation
_ok() { :; }   # replace with CPU<=50%/cores + mem>=2GB free + pgrep dedup check
if _ok; then
  ( graphify --update >/dev/null 2>&1 &            # default: NO --mode deep
    <mempalace-capture-cmd> >/dev/null 2>&1 & ) &   # filled after detection above
fi
```

Path 2 - Claude Code hook (`.claude/settings.json` → `PostToolUse` matching `Bash` `git commit`),
calling a `hooks/post-commit-capture.ps1` that fires the same two captures.
Both paths fire the SAME two captures so it works from terminal OR from Claude Code.

#### Stage 8 - MCP config

Wire Graphify's native MCP server so agents query the graph instead of re-reading.

```json
// .claude/settings.json → mcpServers
{ "graphify": { "command": "graphify", "args": ["--mcp"] } }
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
```

Any `AMBIGUOUS` result blocks closeout until resolved or explicitly waived.

#### Stage 10 - Manifest + self-auditing closeout

Emit the artifact registry and the log scaffolding.

```yaml
# .claude/eidolon-manifest.yaml
version: "0.1.0"
generated: <YYYY-MM-DD>
artifacts:
  - path: CLAUDE.md           kind: core      status: <new|merge>  last_verified: <date>
  - path: .claude/skills/...  kind: skill     status: ...          last_verified: <date>
  - path: hooks/...           kind: hook      status: ...          last_verified: <date>
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
    ->  BUILD     (build against the spec, one task at a time, test first)
    ->  REVIEW    (security swarm: red finds, blue hardens)      ->  findings
    ->  VERIFY    (cold-context: rubric + independent second signal) ->  PASS | red
        red and under three tries  ->  FIX (bounded); 3rd red  ->  re-plan, do not re-fix
        [gate 3: visual or runtime check; the user is the final eyes]
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
trivial:    one file, no new surface              ->  BUILD + VERIFY only; no security swarm
standard:   a feature or surface change           ->  add the security swarm at small fan-out
high_risk:  auth / payments / PII / public surface ->  full fan-out, full antibehavior pass,
                                                       escalate to independent review where the trust tree says so
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
explain_mode:    references/explain-mode.md - plain-language teaching, comprehension checks,
                 the favorite-teacher disposition; available at every stage on request.
```

### What you must do in build mode

1. Confirm the mode out loud and state the pre-run git SHA as the rollback path.
2. SPECIFY: reuse recon (Stage 1) and Setup Interview Mode; write the six core
   areas and `.claude/session.yaml`. Stop at gate 1 for approval.
3. PLAN: name the tier and the cost ceiling; split into dependency-ordered tasks,
   each with an acceptance check and a verify step. Stop at gate 2 on standard or
   larger work.
4. BUILD: one task at a time, test first, against the spec. No scope drift; new
   ideas go to the work queue, never the live diff.
5. REVIEW: run the security swarm when the tier calls for it. Each red finding
   becomes a blue hardening task, closed only when its post-fix verify passes.
6. VERIFY: spawn the cold-context verifier with only the diff, spec, and rubric.
   Red under three tries enters the bounded fix loop; a third red re-plans.
7. Gate 3: hand the visual or runtime result to the user as the final eyes. A
   screenshot proves the render happened, not that it is right.
8. CLOSE: only now commit. Write the decision-log entry and run the memory sync.
   Do not declare done while any finding is unverified or any AMBIGUOUS stands.
