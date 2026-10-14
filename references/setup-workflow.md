# Eidolon setup reference

Use for explicitly requested environment setup. Resolve paths relative to the Eidolon package root, even though this file is inside references. Preserve the current SKILL.md authorization policy and actual host capabilities. Stage examples are selected by setup scope; they do not require reinstalling existing working components.

### PHASE A - Recon + Plan

#### Stage 1 - Recon (read-only, no writes)

Detect the repo's shape. Read silently; present a clean summary, not raw output.
Resolve `EIDOLON_SKILL_ROOT` to this installed skill directory and `REPO_ROOT`
to the target project before using the commands below. Follow
`references/git-hooks-path.md` for all Git-native capture paths. The read-only
inspector reads `git config --path --null --get core.hooksPath` FIRST, then asks
Git for its effective hooks directory. Do not mistake a missing default directory
for a missing hook, or a discovery error for an unset configuration.

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
# config first, then effective-path inventory; never execute hooks during recon
node "$EIDOLON_SKILL_ROOT/scripts/inspect-git-hooks.mjs" "$REPO_ROOT"
```

Present:

```
Repo: <name> · <N> files
  stack:     <languages + frameworks detected>
  build:     <cmd or "none found">
  test:      <cmd or "none found">
  existing:  CLAUDE.md(<lines>) · skills(<n>) · agents(<n>) · hooks(<n>)
  git:       <remote or "local only"> · hook path: <effective hooksPath>
             core.hooksPath: <configured value or unset> - existing hooks: <list or none>
             capture: <postCommit.status; discovery errors are AMBIGUOUS>
```

Skip and count sensitive files (`.env`, keys, secrets) - never print their names.

When recon leaves a gap only the person can fill, ask through references/interview.md (the shared
question bank and brain dump). For anything the setup must leave running on its own, read
references/autopilot-guide.md.

#### Stage 2 - Plan

Synthesize the tailored 10-stage plan for THIS repo. Mark each artifact
`new` or `merge` (if it already exists). Present the plan.

```
Checkpoint: compare the concrete action with authorization already granted; ask only for a new material scope or consent boundary.
```

---

### PHASE B - Structure

#### Stage 2.5 - Primary persona interview

The house agent for this repo, built by the same machine that builds the
swarms and held to the same anti-synthetic rail (no anchor, no seat). One
AskUserQuestion round, proposed from Stage 1 recon and ratified by the user:
register, mandate, anchors (the rail, satisfied with consent), specific
anti-behaviors, voice, and the problem-solving method (Q6, the root-cause
frameworks in references/problem-solving-frameworks.md). Assemble against references/persona-template.md, lint
with scripts/persona-lint.mjs (a FAIL re-prompts the anchors question, never
seats), then ratify: [Seat it] [Edit] [Explain]. The full contract is the
`## The primary persona` section of references/persona-template.md. Ask through references/interview.md
(the shared question bank and brain dump); for anything that must run on its own, see
references/autopilot-guide.md. Seating itself happens at Stage 10, so the guard enforces from the
first message of the next session.

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

Then emit the partner-notes doc itself from the VENDORED template - fill its
slots from Stage 1 recon, do NOT inline its content here:

```bash
# source of truth ships with eidolon; no external install required
cp <eidolon>/references/partner-notes-template.md docs/working-with-claude.md
# then fill the <...> slots (project, focus, test command) from recon
```

Optional upgrade: ai-pairing-playbook (github.com/gmrmk/ai-pairing-playbook, MIT)
is the fuller upstream; when it is installed as a skill, prefer its
PARTNER-NOTES template over the vendored one.

#### Stage 4 - Skills + slash commands

For each capability the repo needs, generate
`.claude/skills/<name>/SKILL.md` (frontmatter + numbered no-skip steps) and
`.claude/commands/<name>.md`. Add `references/*-template.md` only when the
skill emits a repeating artifact.

```yaml
# why: a skill that triggers on everything loads on nothing useful; a map lets Claude pick without guessing
skill_map:     the generated CLAUDE.md gets a short task-to-skill table (the skill map), one row
               per generated skill: the task in the person's words, the skill that handles it
descriptions:  keep each skill description narrow: one capability, the trigger phrases, and what
               it does not cover
```

For a skill Eidolon authors for ITSELF from a recurring, PROVEN gap (not generated
once for the target, not discovered externally), use the gated authoring flow: build
it against the construction template in `references/skill-authoring.md`, lint it with `scripts/skill-lint.mjs` (the
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
            RECORDS (CREDITS.md with license, decision-log row). Note to the
            operator: the skill activates on the next session restart.
```

Then the token economy offer (references/token-economy.md): detect what is present,
offer the rest of the vetted set one AskUserQuestion at a time (ponytail, caveman with
cavecrew, rtk, headroom, repomix), with name, source, license and what it changes;
install only on a yes, verify, record. Compressed output is never evidence, and
instruction, memory and record files are never compressed; the reference states both.

#### Stage 5 - Subagents

Generate `.claude/agents/<persona>.md` for each roster persona the repo needs. Each agent file:

```yaml
# why: an agent file is a persona with a least-privilege tool list and a model tier, so a worker
#      can do the job and nothing else
frontmatter:
  name:         the persona id
  description:  when to delegate to it (the trigger, not the biography)
  tools:        least privilege. Reviewers get Read, Grep, Glob, Bash. Builders add Edit, Write.
                Nobody gets Agent.
  model:        from the tier table in references/conductor-standard.md section 4
  effort:       from the same table
  maxTurns:     a bounded turn count for the role
body:           the persona's register, mandate, anchors, anti-behaviors, `## Reasoning` and
                `## Brief contract` (references/persona-template.md)
lint:           node scripts/persona-lint.mjs --agent .claude/agents/<persona>.md   # each file, must PASS
```

Also write `.claude/agent-scopes.json`, which the write guards enforce per worker:

```json
{ "<agent-name>": { "read": ["<root>"], "write": ["<root>"] } }
```

Reviewers get an empty `write` list. Keep the standing `skill-scout` (copy
references/agents/skill-scout.md into `.claude/agents/`, so later gaps reuse the same
discover/decide/install path) and the `verifier` (runs the second-signal funnel). Add
stack-specific agents as detected.

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

Layer B - the hook suite. Generation fidelity is the law of this stage; a
restated guard is an untested guard (field-proven: a paraphrased
commit-quality-guard false-blocked `--force-with-lease`, which the canonical
guard deliberately allows).

```yaml
# why: the canon in eidolon's hooks/ is tested; a paraphrase is not
copy_verbatim: COPY canonical guard sources from eidolon's hooks/ into the target's
               hooks/ byte-for-byte, plus lib.mjs and hooks/README.md. NEVER restate
               or paraphrase guard logic. The template placeholders (<WING>,
               <CAPTURE_CMD>) are the ONLY lines an installer edits.
dispatcher:    emit the runSuite dispatcher shape - lib.mjs + guard-bash.mjs
               (PreToolUse Bash) + guard-write.mjs (PreToolUse Write|Edit) - one
               process per event, NEVER one per guard.
conditional:   generate a precondition-dependent guard ONLY when its precondition
               exists in the target: the dispatch gate (guard-dispatch,
               Agent|Task matcher) only when subagent dispatch is in scope; orient and
               capture hooks only where Stage 7/8 actually wires their tooling. A
               guard whose trigger the target can never fire is dead weight or a
               false blocker.
verify:        copy the canon's *.test.mjs files alongside and RUN them in the
               target (`node --test "hooks/*.test.mjs"`); a red test blocks
               Checkpoint 2.
```

Wire `.claude/settings.json` with one `guard-bash` entry, one `guard-write`
entry, and (when in scope) the `Agent|Task` dispatch-gate entry. Verdict tiers come
with the copied lib.mjs: advisory injects `additionalContext`; ask emits
`permissionDecision "ask"` (the consent tier); hard block exits `2`. The copied
hooks/README.md table is the per-guard trigger/enforcement reference.

```yaml
# why: the installer wires the whole set in one pass so no guard is left unwired; the generator never rewrites it
hook_groups:   six: PreToolUse Bash|PowerShell, PreToolUse Write|Edit, PreToolUse Agent|Task,
               PostToolUse Write|Edit, SubagentStart, SubagentStop
hook_args:     each entry runs node with the script path, then --project ${CLAUDE_PROJECT_DIR} (hooks/README.md, "Wiring")
deny_floor:    the Layer A deny list above, with PowerShell mirrors of each Bash rule
settings:      env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "1"
               effortLevel: "xhigh"
               maxEffortLevel: "max"
canon_copy:    the generator copies the canonical hook sources verbatim (the fidelity rule above)
```

```
Checkpoint: compare the concrete action with authorization already granted; ask only for a new material scope or consent boundary.
```

---

### PHASE C - Wiring

#### Stage 7 - Dual-capture fan-out (MemPalace prose + Graphify graph)

One trigger feeds two sinks with two payloads. Not a mirror: prose memory and a
structural graph are different views. Generate BOTH trigger paths.

Verify the tools FIRST (do not assume invocations):

```bash
# Graphify - package is graphifyy (two y's), CLI is graphify
python3 -c "import graphify" 2>/dev/null || echo "AMBIGUOUS: graphify not installed - pip install graphifyy --break-system-packages"
# Windows PATH caveat: if 'graphify' unresolved, add %APPDATA%\Python\Python3xx\Scripts or use pipx
# MemPalace (a separately installed cross-session prose-memory CLI/plugin) is OPTIONAL-BY-DEFAULT:
# detect the real capture command, never hardcode a guess; absent -> skip the prose leg cleanly
command -v mempalace 2>/dev/null || claude plugin list 2>/dev/null | grep -i mempalace || echo "OPTIONAL: MemPalace not detected - prose leg skipped, graph capture still wires"
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
Leg 1 (FOUNDATION) - git-native: re-run scripts/inspect-git-hooks.mjs for the
  target and compare hooksPath/postCommit.path with Stage 1 before proposing writes.
  Install hooks/memory-sync.post-commit.sh only at that effective postCommit.path
  (chmod +x where applicable), after approval. If a hook/dispatcher exists, inspect
  and preserve its chain; merge only with approval, never overwrite it.
  A configured but missing, disabled or inaccessible directory is NOT permission
  to fall back to .git/hooks, reset core.hooksPath, or modify a shared directory.
  Git-native capture fires on commits from any source when installed and enabled.
Leg 2 (OPTIONAL) - Claude Code PostToolUse(Bash, git commit): run the SAME script
  for in-agent immediacy. The dedup makes the overlap with leg 1 safe.
```

Fill `<CAPTURE_CMD>` + `<WING>` in the template with the repo's verified MemPalace
invocation (the detection above). Without MemPalace the placeholders stay unfilled
and the template's prose leg stays commented out - a clean no-op, not a failure;
graphify auto-detects on PATH. The template
ships the lock, the dedup, the logging, and the synced-head sentinel already
wired - the installer fills only the two capture placeholders. When the repo is
configured for codebase-memory-mcp (Stage 8), the template's reindex leg also
refreshes that index on every commit (gated on `.claude/codebase-memory.json`); a
repo without it is unaffected.

The SessionStart ORIENT leg has a PRIMARY + FALLBACK pair for the structural graph:
codebase-memory-orient (PRIMARY - sources god nodes + layers from the
codebase-memory-mcp index, when installed) and graphify-orient (the automatic
FALLBACK - surfaces graphify-out/GRAPH_REPORT.md only when the primary produced
nothing this session, detected via a per-session sentinel).

#### Stage 8 - MCP config

Wire the structural-graph MCP server so agents query the graph instead of re-reading.
codebase-memory-mcp is BRING-YOUR-OWN: a local binary the operator installs
themself (a C binary shipping a real MCP server; 158 languages, sub-ms
Cypher/trace queries); eidolon vendors no copy and no download path. When it is
absent, skip this stage's MCP block cleanly - graphify (`pip install graphifyy`,
CLI `graphify`) is the shipped fallback and the already-wired substitute:
graphify-orient takes over the SessionStart orient leg automatically, and
`graphify query/path/explain` covers the queries CLI-side. graphify has NO MCP
entrypoint, so do NOT template a `graphify --mcp` line - it would create a
broken server.

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
Checkpoint: compare the concrete action with authorization already granted; ask only for a new material scope or consent boundary.
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
# Verify the current effective handler, not merely that this is a Git repository.
node "$EIDOLON_SKILL_ROOT/scripts/inspect-git-hooks.mjs" "$REPO_ROOT" --check-post-commit
# the primary persona must pass the rail before Stage 10 may seat it; each generated agent must pass the agent contract
# (a file under an agents/ directory is linted as an agent without the --agent flag, which would apply to every file given)
node scripts/persona-lint.mjs references/personas/*-primary.md .claude/agents/*.md && echo "primary persona and agents: PASS [EXTRACTED]"
# every Stage 4-installed skill: frontmatter parses + one-line smoke check before its findings are trusted
for s in .claude/skills/*/SKILL.md; do head -1 "$s" | grep -q '^---$' && echo "$s: frontmatter [EXTRACTED]"; done
```

The inspector checks path, presence, readability and executability only; it does
not prove capture fired. Compare its current path with Stage 7 and inspect any
existing dispatcher for the memory-sync leg. For the independent execution signal,
verify a recent commit's matching `.claude/.memory-sync.log` cascade and output
mutation, or use an explicitly approved test commit in an isolated fixture.
Never create a commit just to inventory hooks, invoke an unknown hook during
recon, or call a direct script invocation proof that Git triggered it. Record
missing or unavailable capture evidence as `AMBIGUOUS`, not healthy.

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
  - path: hooks/guard-dispatch.mjs  kind: hook  wired: PreToolUse(Agent|Task)  last_verified: <date>  # the sensitive-dispatch consent gate; list it so settings-integrity-guard protects it
  - path: "<effective-post-commit-path>"  kind: capture  last_verified: <date>  # Stage 9 postCommit.path, never a hardcoded default
logs:
  fixes:    docs/fixes/        # FIX-YYYY-MM-DD-<slug>.md, flat markdown
  insights: docs/insights/     # INSIGHT-YYYY-MM-DD-<slug>.md, frontmatter + body
```

Print a final summary: artifacts written, anything left AMBIGUOUS, next action.
Do not declare done while any AMBIGUOUS item is unresolved.

---
