// hooks/orient-gate-core.mjs  (TEMPLATE -- fill <WING> at install, Stage 7)
//
// Pure logic + sentinel I/O for the ORIENT-GATE. A session must ACTIVELY read the
// code graph (graphify) AND cross-session prose memory (mempalace) before it
// dispatches an agent or edits source code. The SessionStart graphify-orient +
// mempalace-orient hooks SURFACE a summary; this gate ENFORCES a task-relevant read
// of the real thing -- the difference between orientation offered and orientation done.
//
// Why it exists: the SessionStart orient trio puts the graph and memory in front of a
// session, but nothing made a session READ them before acting. A session can dispatch
// agents or edit code from a surface view and re-open a question the graph or memory had
// already settled. This makes the read a precondition, not a hope. Pairs with the orient
// trio (the surface) as its teeth, the way persona-conduct-guard is the teeth for
// seat-surface.
//
// Sentinel design: one file PER SESSION, `.claude/.orient-gate.<sessionId>.json`,
// anchored at the git repo ROOT.
//   - PER-SESSION files (not one shared record): concurrent sessions in the same repo
//     never clobber each other's orientation. A single shared sentinel is raced
//     last-writer-wins -- a second live session overwrites the first's flags within
//     seconds and mis-fires the gate on the first session's own approved edits.
//   - GIT-ROOT anchored: a subdir cwd (e.g. `cd backend && pytest`) no longer fragments
//     orientation across one file per directory.
// Fail-open is the suite contract (hooks/lib.mjs): a bad payload, a missing session id,
// or an unreadable sentinel never bricks the workflow -- it allows.
//
// Template note: the mempalace recall command in the block message fills <WING> at
// install (Stage 7), like mempalace-orient. The graph + memory TOOLS are Eidolon's
// defaults (graphify, MemPalace); swap the detectors if a repo uses others. The
// source-code definition (isSourceCodePath) is by file extension outside docs / build /
// governance dirs, so it is portable; a repo may narrow it to its own code roots.

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";

const WING = "<WING>"; // installer fills the project's MemPalace wing (Stage 7)

// Walk up from `start` to the git repo root (the dir containing .git); fall back to
// `start` when none is found. Anchors the sentinel per-repo so a subdir cwd does not
// fragment orientation.
export function repoRoot(start) {
  let dir = String(start || ".");
  for (let i = 0; i < 40; i++) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return String(start || ".");
}

const SENTINEL_PREFIX = ".orient-gate.";
const SENTINEL_SUFFIX = ".json";
const sanitizeSession = (sid) => String(sid || "").replace(/[^A-Za-z0-9_-]/g, "");

export function sentinelPath(root, sessionId) {
  return join(repoRoot(root), ".claude", SENTINEL_PREFIX + sanitizeSession(sessionId) + SENTINEL_SUFFIX);
}
export function readSentinel(root, sessionId) {
  try { return JSON.parse(readFileSync(sentinelPath(root, sessionId), "utf8")); } catch { return null; }
}
export function writeSentinel(root, sessionId, obj) {
  writeFileSync(sentinelPath(root, sessionId), JSON.stringify(obj, null, 2), "utf8");
}
function nowIso() { return new Date().toISOString(); }

// Best-effort prune of stale per-session sentinels (older than ~24h). Never throws.
const TTL_MS = 24 * 60 * 60 * 1000;
function pruneStale(root) {
  try {
    const dir = join(repoRoot(root), ".claude");
    const cutoff = Date.now() - TTL_MS;
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(SENTINEL_PREFIX) || !name.endsWith(SENTINEL_SUFFIX)) continue;
      const p = join(dir, name);
      try {
        const o = JSON.parse(readFileSync(p, "utf8"));
        const t = Date.parse(o?.graphifyReadAt || o?.mempalaceReadAt || "");
        if (Number.isFinite(t) && t < cutoff) unlinkSync(p);
      } catch { /* unreadable -> leave it */ }
    }
  } catch { /* .claude missing -> nothing to prune */ }
}

const norm = (p) => String(p || "").replace(/\\/g, "/");

// ---- active-orientation detection (PostToolUse side) ----

const GRAPHIFY_FILE = /graphify-out\/(graph_report\.md|graph\.json)$/i;
const GRAPHIFY_BASH = /\bgraphify\s+(query|path|explain|update)\b/i;
const MEMPALACE_BASH = /\bmempalace\s+search\b/i;

function inputHay(ti) {
  return [ti.skill, ti.args, ti.command, ti.query, ti.prompt]
    .filter((x) => typeof x === "string")
    .join(" ");
}

function isGraphifySkillOrMcp(name, ti) {
  const n = String(name || "");
  const hay = inputHay(ti);
  if (/^skill$/i.test(n) && /graphify/i.test(hay)) return true;
  if (/graphify/i.test(n)) return true; // a graphify MCP tool of any verb
  return false;
}
function isMempalaceSearchSkillOrMcp(name, ti) {
  const n = String(name || "");
  const hay = inputHay(ti);
  if (/^skill$/i.test(n) && /mempalace/i.test(hay) && /search/i.test(hay)) return true;
  if (/mempalace/i.test(n) && /search/i.test(n + " " + hay)) return true;
  return false;
}

// From a PostToolUse payload, which orientation flag (if any) this call sets.
// Returns "graphify" | "mempalace" | null.
export function sense(j = {}) {
  const name = String(j.tool_name || "");
  const ti = j.tool_input || {};
  if (/^read$/i.test(name) && GRAPHIFY_FILE.test(norm(ti.file_path || ti.path))) return "graphify";
  if (/^bash$/i.test(name) && GRAPHIFY_BASH.test(String(ti.command || ""))) return "graphify";
  if (isGraphifySkillOrMcp(name, ti)) return "graphify";
  if (/^bash$/i.test(name) && MEMPALACE_BASH.test(String(ti.command || ""))) return "mempalace";
  if (isMempalaceSearchSkillOrMcp(name, ti)) return "mempalace";
  return null;
}

// Record an orientation read into THIS session's own sentinel file. No-op when the flag
// is already set for the session. Because each session writes its own file, concurrent
// sessions never clobber each other.
export function recordRead(root, j = {}) {
  const flag = sense(j);
  if (!flag) return null;
  const sessionId = String(j.session_id || "");
  if (!sessionId) return null; // no session to key by
  const cur = readSentinel(root, sessionId) || { sessionId };
  const key = flag === "graphify" ? "graphifyReadAt" : "mempalaceReadAt";
  if (cur[key]) return flag; // already recorded this session
  cur.sessionId = sessionId;
  cur[key] = nowIso();
  writeSentinel(root, sessionId, cur);
  pruneStale(root);
  return flag;
}

// ---- gate decision (PreToolUse side) ----

export function isDispatchTool(name) {
  const n = String(name || "");
  return /^task$/i.test(n) || /^agent$/i.test(n) || /dispatch|subagent/i.test(n);
}
export function isCodeEditTool(name) {
  return /^(write|edit|notebookedit)$/i.test(String(name || ""));
}

// A recognized source-code file, outside the documentation / build / governance dirs.
// Portable across stacks; a concrete repo may narrow this to its own code roots.
const SOURCE_EXT = /\.(mjs|cjs|js|jsx|ts|tsx|py|go|rs|java|rb|php|c|cc|cpp|h|hpp|cs|kt|kts|swift|scala|vue|svelte|css|scss|sql)$/i;
const EXEMPT_DIR = /(^|\/)(docs|mockups|node_modules|dist|build|\.claude|\.git)\//i;
export function isSourceCodePath(path) {
  const p = norm(path);
  if (!p) return false;
  if (!SOURCE_EXT.test(p)) return false; // only real source files (markdown, config, data are not gated)
  if (EXEMPT_DIR.test(p)) return false; // docs / build / governance dirs are not source edits
  return true;
}

// Pure gate decision given resolved inputs (no fs). `sentinel` is THIS session's own
// record (or null). Returns a suite verdict | null.
export function decideGate({ toolName, filePath, sessionId, sentinel }) {
  const dispatch = isDispatchTool(toolName);
  const gated = dispatch || (isCodeEditTool(toolName) && isSourceCodePath(filePath));
  if (!gated) return null;
  if (!sessionId) return null; // cannot track a session without an id -> fail open

  const ok = sentinel && sentinel.sessionId === sessionId;
  const hasGraphify = !!(ok && sentinel.graphifyReadAt);
  const hasMempalace = !!(ok && sentinel.mempalaceReadAt);
  if (hasGraphify && hasMempalace) return null;

  const missing = [];
  if (!hasGraphify) missing.push("graphify (the code graph)");
  if (!hasMempalace) missing.push("mempalace (cross-session memory)");
  const what = dispatch ? "dispatching an agent" : "editing source code";
  const wingNote = WING && WING !== "<WING>" ? " --wing " + WING : "";

  return {
    kind: "block",
    label: "ORIENT-GATE",
    tag: "BLOCKED - orient first",
    why:
      "before " + what + " you must read the code graph AND cross-session memory this session. " +
      "Not yet read: " + missing.join(" + ") + ". " +
      'Read `graphify-out/GRAPH_REPORT.md` (or run `graphify query "<your task>"`) AND run ' +
      '`mempalace search "<your task>"' + wingNote + "`, then retry. " +
      "The graph + memory hold settled decisions; skipping them re-opens questions a prior " +
      "session already closed. Orientation is offered every session start -- this gate makes it done.",
  };
}

// Hook-side evaluator: resolve THIS session's sentinel (git-root anchored), then decide.
export function evalGate(j = {}) {
  const ti = j.tool_input || {};
  const sessionId = String(j.session_id || "");
  return decideGate({
    toolName: String(j.tool_name || ""),
    filePath: ti.file_path || ti.path || "",
    sessionId,
    sentinel: readSentinel(String(j.cwd || process.cwd()), sessionId),
  });
}
