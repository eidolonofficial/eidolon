// hooks/graphify-orient.mjs
//
// SessionStart (ALL sources) -- the graphify orientation surface, the automatic FALLBACK
// to codebase-memory-orient (the PRIMARY structural surface): it stays silent when that
// hook fired this session (its .claude/.primary-orient.<sid>.json sentinel exists) and
// surfaces the graph only when the primary produced nothing. Puts the code
// graph's STRUCTURE in front of the session from message 1: the god nodes (core
// abstractions), the key hyperedges, and freshness (graph build-commit vs current
// HEAD). Stage 7 wires dual-capture SYNC (is the graph up to date); this is the
// missing RECALL/ORIENT leg (what the graph SAYS). So a session starts knowing the
// shape of the codebase instead of re-deriving it.
//
// Deterministic (no LLM, no API): reads graphify-out/GRAPH_REPORT.md, the
// pre-computed god-nodes + hyperedges + build-commit. Read-only -- it never runs
// `graphify update`; staleness is surfaced and the refresh is one named command, so
// the hook stays fast and never races the post-commit sync. Additive, never blocks,
// never crashes a session start (sibling of session-restore / process-doctrine).
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { primarySentinelPath } from "./codebase-memory-orient.mjs";

// Lines of a "## <Heading>..." section up to the next "## " heading or a line cap.
function section(md, heading, cap) {
  const start = md.indexOf("## " + heading);
  if (start < 0) return "";
  const after = md.slice(start);
  const nl = after.indexOf("\n");
  const body = after.slice(nl + 1);
  const end = body.indexOf("\n## ");
  const trimmed = (end < 0 ? body : body.slice(0, end)).trim();
  return trimmed.split("\n").slice(0, cap).join("\n");
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let j = {};
  try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim() || "{}"); } catch {}
  const cwd = String(j.cwd || process.cwd());
  const sessionId = String(j.session_id || "");

  // FALLBACK: codebase-memory-orient is the PRIMARY structural surface. When it fires it
  // writes a per-session sentinel; if that exists, stay silent so we never double-inject.
  // graphify is the AUTOMATIC FALLBACK -- it surfaces the graph only when the primary
  // produced nothing (binary missing / repo unindexed / bad JSON / no config).
  if (sessionId) {
    try { if (existsSync(primarySentinelPath(cwd, sessionId))) process.exit(0); } catch { /* fall through -> inject */ }
  }

  let md = "";
  try { md = readFileSync(join(cwd, "graphify-out", "GRAPH_REPORT.md"), "utf8"); }
  catch { process.exit(0); } // no graph -- nothing to surface, never block

  // Freshness: graph build-commit vs current HEAD.
  let builtFrom = "";
  const m = md.match(/Built from commit:\s*`?([0-9a-f]{7,40})`?/i);
  if (m) builtFrom = m[1].slice(0, 8);
  let head = "";
  try { head = execFileSync("git", ["rev-parse", "--short=8", "HEAD"], { cwd, encoding: "utf8" }).trim(); } catch {}
  const stale = !!(builtFrom && head && !head.startsWith(builtFrom) && !builtFrom.startsWith(head));
  const freshness = builtFrom
    ? stale
      ? `Graph is STALE: built from ${builtFrom}, HEAD is ${head}. Run \`graphify update .\` before trusting structural edges.`
      : `Graph fresh (built from ${builtFrom}, HEAD ${head}).`
    : "Graph freshness unknown.";

  const gods = section(md, "God Nodes", 12);
  const hyper = section(md, "Hyperedges", 16);

  const directive =
    "GRAPHIFY ORIENT (every-pass surface). " + freshness + "\n\n" +
    (gods ? gods + "\n\n" : "") +
    (hyper ? hyper + "\n\n" : "") +
    "Use the graphify skill (query / path / explain) + graphify-out/GRAPH_REPORT.md before substantive " +
    "structural work. EXTRACTED edges are facts; INFERRED are hypotheses to confirm against source." +
    "\n\nORIENT-GATE (ENFORCED): before dispatching ANY agent or editing source code you MUST read " +
    'graphify-out/GRAPH_REPORT.md (or run `graphify query "<your task>"`) AND run a task-relevant ' +
    '`mempalace search "<your task>"` this session -- a PreToolUse orient-gate BLOCKS those actions until both are done.' +
    (stale ? " The graph is STALE: run `graphify update .` first so you orient against current code, not a past commit." : "");

  process.stdout.write(JSON.stringify({
    systemMessage: "GRAPHIFY ORIENT: " + (stale ? "graph STALE -- " : "") + "god nodes + hyperedges surfaced",
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: directive },
  }));
  process.exit(0);
});
