// hooks/codebase-memory-orient.mjs  (TEMPLATE -- fill <WING> at install, Stage 7)
//
// SessionStart (ALL sources) -- the PRIMARY structural orientation surface. Sources the
// code graph from codebase-memory-mcp (`cli get_architecture`): god nodes (hotspots by
// fan-in), layers, entry points, clusters, counts. graphify-orient is the AUTOMATIC
// FALLBACK -- when this hook fires it writes a per-session sentinel that graphify-orient
// reads to stay silent; graphify surfaces the graph only when this produced nothing
// (binary missing, repo unindexed, bad JSON, or no config). Pairs with orient-gate (the
// teeth) like the rest of the orient trio.
//
// codebase-memory-mcp is a local C indexer (no LLM, no API, no token cost). The project
// name + binary path live in .claude/codebase-memory.json (installer-written at Stage 7/8;
// machine-specific, gitignored). The CLI scopes by PROJECT NAME (not cwd), and the binary
// may not be on the agent-process PATH yet, so both are carried explicitly.
//
// Deterministic; additive; never blocks; never crashes a session start (sibling of
// graphify-orient / session-restore). Any failure -> exit 0 silently so the fallback fires.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "./orient-gate-core.mjs";

const WING = "<WING>"; // installer fills the project's MemPalace wing (Stage 7), like orient-gate-core

const PRIMARY_SENTINEL_PREFIX = ".primary-orient.";
const PRIMARY_SENTINEL_SUFFIX = ".json";
const sanitizeSession = (sid) => String(sid || "").replace(/[^A-Za-z0-9_-]/g, "");

// The per-session sentinel graphify-orient checks. Per-session + git-root anchored (same
// convention as orient-gate-core) so concurrent sessions never clobber and a subdir cwd
// does not fragment it.
export function primarySentinelPath(root, sessionId) {
  return join(repoRoot(root), ".claude", PRIMARY_SENTINEL_PREFIX + sanitizeSession(sessionId) + PRIMARY_SENTINEL_SUFFIX);
}

// Best-effort prune of stale primary-orient sentinels (>24h) so .claude/ does not accumulate
// one file per past session. Mirrors orient-gate-core's pruneStale; never throws.
const TTL_MS = 24 * 60 * 60 * 1000;
function prunePrimarySentinels(root) {
  try {
    const dir = join(repoRoot(root), ".claude");
    const cutoff = Date.now() - TTL_MS;
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(PRIMARY_SENTINEL_PREFIX) || !name.endsWith(PRIMARY_SENTINEL_SUFFIX)) continue;
      try {
        const o = JSON.parse(readFileSync(join(dir, name), "utf8"));
        const t = Date.parse(o?.at || "");
        if (Number.isFinite(t) && t < cutoff) unlinkSync(join(dir, name));
      } catch { /* unreadable -> leave it */ }
    }
  } catch { /* .claude missing -> nothing to prune */ }
}

// Drop the leading project-id token from a codebase-memory qualified_name
// ("proj-id.frontend.x.close" -> "frontend.x.close"). Generic: removes the first dotted
// segment (the project id itself contains no dots).
export function shortQN(qn) {
  const s = String(qn || "");
  const dot = s.indexOf(".");
  return dot < 0 ? s : s.slice(dot + 1);
}

// Pure: parsed `get_architecture` JSON -> the injected directive body. Tolerates missing
// arrays (an empty/partial arch still emits the ENFORCED ORIENT-GATE block). The mempalace
// recall command in the gate block fills <WING> at install, like orient-gate-core.
export function formatArch(arch, { exe, project, wing } = {}) {
  const a = arch || {};
  const nodes = a.total_nodes ?? 0;
  const edges = a.total_edges ?? 0;
  const langs = (a.languages || []).slice(0, 5).map((l) => `${l.language} ${l.file_count}`).join(" · ");
  const gods = (a.hotspots || []).slice(0, 10)
    .map((h, i) => `${i + 1}. ${h.name} (fan-in ${h.fan_in}) -- ${shortQN(h.qualified_name)}`)
    .join("\n");
  const layers = (a.layers || []).filter((l) => l.name).slice(0, 8)
    .map((l) => `${l.name}:${l.layer}`).join(" · ");
  const entries = (a.entry_points || []).slice(0, 6).map((e) => `${e.name} (${e.file})`).join(", ");
  const clusters = (a.clusters || []).slice(0, 5).map((c) => `${c.label}#${c.id} (${c.members})`).join(", ");

  const exePath = exe || "codebase-memory-mcp";
  const proj = project || "<project>";
  const wingNote = wing && wing !== "<WING>" ? " --wing " + wing : "";

  const parts = [
    `CODEBASE-MEMORY ORIENT (primary structural surface). Index ready: ${nodes} nodes / ${edges} edges.` +
      (langs ? ` Languages: ${langs}.` : ""),
  ];
  if (gods) parts.push("God nodes (most-connected core abstractions, by fan-in):\n" + gods);
  if (layers) parts.push("Layers: " + layers);
  if (entries) parts.push("Entry points: " + entries);
  if (clusters) parts.push("Clusters: " + clusters);
  parts.push(
    "Query the graph before substantive structural work: " +
      `\`${exePath} cli search_graph '{"project":"${proj}","name_pattern":"..."}'\`, ` +
      "`... query_graph` (Cypher), `... trace_path`, `... get_architecture`, or the codebase-memory-mcp MCP tools.",
  );
  parts.push(
    "ORIENT-GATE (ENFORCED): before dispatching ANY agent or editing source code you MUST query the " +
      "code graph -- run `" + exePath + " cli get_architecture '{\"project\":\"" + proj + "\"}'` (or any " +
      "codebase-memory-mcp cli/MCP query; graphify-out/GRAPH_REPORT.md or `graphify query` is the FALLBACK) -- " +
      'AND run a task-relevant `mempalace search "<your task>"' + wingNote + "` this session. " +
      "A PreToolUse orient-gate BLOCKS those actions until both are done.",
  );
  return parts.join("\n\n");
}

function main() {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    let j = {};
    try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim() || "{}"); } catch {}
    const cwd = String(j.cwd || process.cwd());
    const sessionId = String(j.session_id || "");

    // Config (project + exe). Missing -> nothing to source from; let graphify fall back.
    let cfg = {};
    try { cfg = JSON.parse(readFileSync(join(repoRoot(cwd), ".claude", "codebase-memory.json"), "utf8")); }
    catch { process.exit(0); }
    const { exe, project } = cfg;
    if (!exe || !project) process.exit(0);

    // Query the code graph. Any failure -> exit 0 silently so graphify-orient fires.
    let arch;
    try {
      const out = execFileSync(exe, ["cli", "get_architecture", JSON.stringify({ project })], {
        cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 10000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      arch = JSON.parse(out);
    } catch { process.exit(0); }

    const directive = formatArch(arch, { exe, project, wing: WING });

    // Mark that the primary surface fired this session -> graphify-orient stays silent.
    try {
      if (sessionId) {
        prunePrimarySentinels(cwd);
        writeFileSync(primarySentinelPath(cwd, sessionId),
          JSON.stringify({ sessionId, at: new Date().toISOString() }), "utf8");
      }
    } catch { /* sentinel best-effort: worst case graphify also injects (redundant, not wrong) */ }

    process.stdout.write(JSON.stringify({
      systemMessage: "CODEBASE-MEMORY ORIENT: god nodes + layers surfaced (primary)",
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: directive },
    }));
    process.exit(0);
  });
}

// Run IO only when invoked directly, so importing for tests has no side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
