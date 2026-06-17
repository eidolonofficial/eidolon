# 2026-06-17 — codebase-memory-mcp as the primary structural orient surface

Status: accepted

## Context

The orient trio (seat-surface, graphify-orient, mempalace-orient) + orient-gate gives a
session its structural + prose orientation at SessionStart and enforces a read before
agents/code. The structural leg was graphify-only: graphify-orient reads
`graphify-out/GRAPH_REPORT.md`, and Stage 8 templated a `graphify --mcp` MCP server.

Two problems surfaced in the field:
- **graphify has no MCP server.** `graphify` is CLI-only (`query/path/explain`); the
  templated `graphify --mcp` line wires a server that does not exist. Stage 8 was a no-op
  (or a broken entry) on every install.
- **A stronger structural engine exists.** codebase-memory-mcp (a local C binary; tree-sitter
  + Hybrid-LSP; 158 languages; Cypher, `trace_path`, `detect_changes`, code-semantic search;
  sub-ms queries; no LLM/token cost) ships a **real** MCP server and a CLI, and indexes into a
  persistent graph. It covers and exceeds graphify's structural role.

## Decision

Add codebase-memory-mcp as the **PRIMARY** structural orient surface; keep graphify as the
**automatic FALLBACK**.

- New `hooks/codebase-memory-orient.mjs` (SessionStart): sources god nodes (hotspots by
  fan-in) + layers + entry points from `cli get_architecture`, reads project + binary path
  from `.claude/codebase-memory.json`, writes a per-session sentinel
  `.claude/.primary-orient.<sid>.json`, fails open (exit 0) so graphify falls back.
- `hooks/graphify-orient.mjs` stays silent for a session whose primary sentinel exists; it
  surfaces the graph only when the primary produced nothing (binary missing, repo unindexed,
  bad JSON, or no config). A per-session sentinel arbitrates — no double-injection, automatic
  fallback.
- `hooks/orient-gate-core.mjs` `sense()` accepts a codebase-memory `cli` query or MCP tool as
  satisfying the structural half (flag keyed `"graphify"` for back-compat; `decideGate`
  unchanged). The negative case (a mere mention without `cli`) does NOT satisfy the gate.
- `hooks/memory-sync.post-commit.sh` gains a reindex leg, gated on
  `.claude/codebase-memory.json` + the binary on PATH (persistence:false — refreshes the
  cache the orient hook reads, not the gitignored team artifact).
- Stage 8 wires `codebase-memory-mcp` as the structural MCP server and drops the broken
  `graphify --mcp` template.

## Consequences

- Repos that install + index codebase-memory-mcp get a richer structural orient + a working
  MCP server. Repos that do not are unaffected: every new path fails open and graphify remains
  the (working, file-based) structural surface and orient-gate satisfier.
- The orient-gate's enforcement is preserved (still blocks until BOTH structural + prose are
  read this session) — verified by a negative-recognition test and an enforcement test.
- `.claude/codebase-memory.json` (project + machine-specific binary path) and
  `.claude/.primary-orient.<sid>.json` (per-session sentinels) are runtime state — gitignored.

Provenance: built and field-verified on fraud-forensic-replay (the orient trio + orient-gate
were folded upstream in #8/#9; this adds the codebase-memory primary/fallback layer on top).
