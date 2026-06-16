// hooks/mempalace-orient.mjs  (TEMPLATE -- fill <WING> at install, Stage 7)
//
// SessionStart (ALL sources) -- the prose-memory recall surface. Puts cross-session
// memory in front of the session from message 1, seeded from what was just done
// (branch + recent commit subjects). Stage 7 wires dual-capture SYNC (write memory on
// commit); this is the missing RECALL/ORIENT leg (read memory at start). The memory
// tool here is MemPalace (Eidolon's default); swap the command if the repo uses a
// different store.
//
// Fail-open: the store absent/slow/erroring -> exit 0 silently (an error string is
// never surfaced as "recall"). Never blocks, never crashes a session start. Short
// timeout so a slow index never stalls the start.
import { execFileSync } from "node:child_process";

const WING = "<WING>";          // installer fills the project's MemPalace wing (Stage 7)
const TIMEOUT_MS = 12000;
const MAX_CHARS = 1600;

function git(args, cwd) {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 4000 }).trim(); }
  catch { return ""; }
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let j = {};
  try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim() || "{}"); } catch {}
  const cwd = String(j.cwd || process.cwd());

  // Seed the recall from what we were just doing: branch + recent commit subjects.
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  const subjects = git(["log", "-2", "--format=%s"], cwd).split("\n").join(" ");
  const seed = [branch, subjects].filter(Boolean).join(" ").slice(0, 200) || "project orientation";

  // Fail-open on ANY error so a missing or slow store never stalls or breaks a start.
  const args = ["search", seed, "--results", "5"];
  if (WING && WING !== "<WING>") args.push("--wing", WING);
  let out = "";
  try {
    out = execFileSync("mempalace", args, {
      encoding: "utf8",
      timeout: TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    }).trim();
  } catch { process.exit(0); }

  // Empty OR an error string (a broken/desynced index prints "Search error: ...") ->
  // surface nothing.
  if (!out || /search error|internal error|traceback|error finding id/i.test(out)) process.exit(0);
  const body = out.length > MAX_CHARS
    ? out.slice(0, MAX_CHARS) + "\n... (truncated; run a targeted search)"
    : out;

  const wingNote = WING && WING !== "<WING>" ? ' --wing ' + WING : "";
  const directive =
    'MEMPALACE RECALL (every-pass surface, seeded from recent work: "' + seed + '").\n\n' +
    body + "\n\n" +
    'This is a seeded recall, not exhaustive -- run `mempalace search "<your task topic>"' +
    wingNote + ' --results 5` for the specific work before non-trivial changes.' +
    "\n\nORIENT-GATE (ENFORCED): a task-relevant `mempalace search` AND a read of the code graph " +
    "(graphify-out/GRAPH_REPORT.md or `graphify query`) are REQUIRED before dispatching any agent or " +
    "editing source code -- a PreToolUse orient-gate BLOCKS those actions until both are done this session.";

  process.stdout.write(JSON.stringify({
    systemMessage: "MEMPALACE RECALL: surfaced" + (WING && WING !== "<WING>" ? " for wing " + WING : ""),
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: directive },
  }));
  process.exit(0);
});
