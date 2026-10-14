# Token economy: the vetted set

What Eidolon offers a project so that each token goes further: the register and the
artifact ladder, the compressors for expensive tool output, and the retrieval and
fan-out mechanisms that make RAG, DAGs and parallel work cheap. Everything here is
optional, detected, and installed only through the "install a skill" consent gate
(SKILL.md INVARIANTS). Eidolon writes nothing of this on its own.

## The rules that come first

```yaml
# why: a compressor sits between the world and the model; used wrong it hides the thing you needed to see
native_first:     before any tool below, use what the host already has: /compact, a bounded
                  Agent return (1 to 2K tokens), the Workflow tool for a repeating pipeline,
                  worktrees for overlapping writes, /loop and /goal for unattended runs
never_evidence:   compressed or summarized output is never evidence for a count, a path, a
                  file time or an empty result; re-run the raw command for the claim of record
never_compress:   instruction files (CLAUDE.md, SKILL.md, rules), memory files, and the
                  append-only records (docs/decisions, docs/fixes, DECISIONS.md) are never
                  rewritten by a compressor; a compressed register is for chat and reports
local_only:       a tool enters this list only if the text it touches stays on the machine;
                  an opt-out beacon that carries no content is acceptable, a cloud pass is not
high_trust:       anything that rewrites a tool call or its result before the model sees it
                  (a hook, a proxy) is a trust boundary: pin its version, read its diff before
                  an upgrade, and keep hooks/README.md's integrity guards wired
consent:          one AskUserQuestion per install, with the name, source, license and the
                  why/liability line; a declined offer is not asked again that session
```

## The vetted set

| Tool | What it saves | Where it runs | License | Install | How Eidolon uses it |
|---|---|---|---|---|---|
| ponytail (DietrichGebert/ponytail) | code never written: the ladder stops at the first rung that holds | prompt text, no code | MIT | `/plugin marketplace add DietrichGebert/ponytail`, `/plugin install ponytail@ponytail` | conductor-standard.md section 10 carries its doctrine; the plugin adds `/ponytail lite\|full\|ultra` |
| caveman (JuliusBrussee/caveman) | output tokens in chat and reports, measured at about 65 percent | prompt text; an optional local proxy | Apache-2.0 | `/plugin marketplace add JuliusBrussee/caveman`, `/plugin install caveman@caveman` | the register of chat and agent reports; the auto-clarity exceptions hold (security warnings, irreversible confirmations, ordered steps, confusion) |
| cavecrew (ships inside caveman) | subagent returns at about one third the size | three agent presets: investigator, builder, reviewer | Apache-2.0 | comes with caveman | the fast mechanical tier (conductor-standard.md section 4): inventories, one or two file edits, diff review; the brief still carries the persona line and the done-check |
| rtk (rtk-ai/rtk) | 60 to 90 percent of the output of git, gh, npm, cargo, pytest, docker and about a hundred more | a single Rust binary; `rtk init -g` adds a Bash-tool hook that rewrites `git status` to `rtk git status` | CLI Apache-2.0; engine and proxy BUSL-1.1, production use free | `winget install rtk-ai.rtk`, `brew install rtk`, or the curl script; confirm with `rtk gain` (another crate shares the name) | test, build and git output inside build and verify legs; never the command of record |
| headroom (headroomlabs-ai/headroom) | tool outputs, logs, files and RAG chunks before they reach the model; about 20 percent on coding work, 60 to 95 on JSON | local Python library, proxy and MCP server (`headroom_compress`, `headroom_retrieve`, `headroom_stats`); originals cached locally and retrievable within a TTL | Apache-2.0 | `uv tool install --python 3.13 "headroom-ai[all]"`; the plugin `headroom@headroom-marketplace` adds the startup hooks | large tool results in research and review legs, with `headroom_retrieve` for the full text when a claim depends on it; set `HEADROOM_BEACON=off` or `DO_NOT_TRACK=1` to silence its anonymous ratio beacon |
| repomix (yamadashy/repomix) | a repo or subtree packed into one file with token counts; `--compress` keeps signatures and drops bodies | Node CLI, also an MCP server | MIT | `npx repomix` | the cross-session packet (references/cross-session.md) and a worker's prior when a subtree must travel whole |
| codebase-memory-mcp (DeusData/codebase-memory-mcp) | file reads: a structure question costs a graph query (its own five-query figure is about 120 times fewer tokens, self-reported) | local tree-sitter index in SQLite, 17 MCP tools | MIT | the agent installs it from its README | the primary structural orient (setup-workflow.md Stage 7) and the graph side of retrieval |
| graphify (Graphify-Labs/graphify) | the same for docs, SQL schemas, configs and PDFs; edges tagged EXTRACTED or INFERRED | local tree-sitter for code; the docs pass uses the assistant's model | Apache-2.0 and MIT | `uv tool install graphifyy`, `graphify install` | the fallback orient and the docs graph |
| mempalace (MemPalace/mempalace) | re-explaining the project: prose memory with BM25 plus vectors | local, 19 MCP tools | MIT | the plugin `mempalace@mempalace` | the bounded prior in a brief, 3 to 5 hits, never a history dump |
| LLMLingua (microsoft/LLMLingua) | long prompts compressed by a small local model | Python, downloads a model | MIT | `pip install llmlingua` | optional, for a packet that must fit a budget; research-grade, measure before trusting |

## Looked at and not in the default set

- claude-context (zilliztech): vector search that needs an embedding provider and a vector
  store; local only with Ollama and a local Milvus, so it fails `local_only` by default.
- GitNexus: a good local graph with an MCP server, but its `analyze` command writes
  CLAUDE.md and AGENTS.md and registers hooks by itself, which crosses the consent gate;
  usable when the person runs it knowingly.
- Serena (oraios/serena): symbol-level retrieval and edits through language servers, GPL-3.0;
  an editing aid, not a compressor; a fine personal choice outside this set.

## RAG, DAGs and parallel work, with the tools that carry them

```yaml
# why: the principles live in references/engineering-principles.md; this maps each to the tool that makes it cheap
retrieval:  just-in-time by default (grep, read, graph query); codebase-memory-mcp answers
            structure, mempalace answers history, graphify answers docs; the brief carries a
            bounded prior; headroom compresses the chunks a leg does pull in
dag:        the wave plan is the DAG (conductor-standard.md section 2); independent nodes
            launch in one controller message; the Workflow tool runs a pipeline that
            repeats; worktrees hold overlapping writes; lanes keep nodes disjoint
parallel:   fan-out sized to coverage, 3 to 5 for research; cavecrew presets for cheap
            scouts and surgical edits; every leg returns a distilled summary, never a
            transcript; rtk and headroom shrink what each leg reads along the way
budget:     the brief states turns or tokens per leg; the preflight states the arithmetic
```

## What Stage 4 offers

Setup detects what is present (the plugin ids in the user's settings, `rtk --version`,
the headroom MCP tools, `repomix --version`, the graph and memory tools from Stage 7)
and offers the rest in one AskUserQuestion per gap, in this order: ponytail, caveman
with cavecrew, rtk, headroom, repomix. Each option shows the name, the source, the
license and one line on what it changes. Declined stays declined for the session. On a
yes the controller runs the install command shown above, verifies the result (the plugin
appears in `/plugin`, the binary answers `--version`, the MCP tools list), and records
the choice in CREDITS.md and the decision log.
