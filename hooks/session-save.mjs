// hooks/session-save.mjs
//
// Eidolon hook suite - PreCompact. Saves a snapshot of where the run stands before
// context is trimmed, so a compaction never loses the thread (design spec section 11).
// Writes .claude/.session-state (gitignored; the .claude dir is created if missing,
// otherwise the save would silently never land). Fail open.
//
// A PreCompact hook cannot summarize the run (no LLM), so instead of <fill> placeholders
// it captures the DETERMINISTIC facts it CAN read -- HEAD, branch, recent commits, and a
// working-tree summary -- which give the next session real signal on their own. The note
// asks the operator to run their save-session command for the narrative (next step,
// what-not-to-retry) that the facts cannot carry.

import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

// Deterministic git facts; every field fails open independently, so a non-repo cwd or a
// git error yields an empty fact set rather than aborting the snapshot.
function gitFacts(cwd) {
  const g = (args) => {
    try { return execFileSync("git", args, { cwd, encoding: "utf8" }).trim(); }
    catch { return ""; }
  };
  const facts = {};
  const head = g(["log", "-1", "--format=%h %s"]);
  if (head) facts.head = head;
  const branch = g(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch) facts.branch = branch;
  const recent = g(["log", "-3", "--format=%h %s"]);
  if (recent) facts.recent = recent.split("\n").filter(Boolean);
  if (head) {
    const porcelain = g(["status", "--porcelain"]);
    facts.status = porcelain ? porcelain.split("\n").filter(Boolean).length + " file(s) uncommitted" : "clean";
  }
  return facts;
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let j;
  try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()); }
  catch { j = {}; }
  const cwd = String(j.cwd || process.cwd());
  const snapshot = {
    saved_before: "context trim (PreCompact" + (j.trigger ? ", " + j.trigger : "") + ")",
    saved_at: new Date().toISOString(),
    cwd,
    git: gitFacts(cwd),
    note: "Deterministic git facts only -- a PreCompact hook cannot summarize the run. Run your " +
      "save-session command to capture the narrative (next step, what-not-to-retry) before the " +
      "context trims. Restored on the next SessionStart by session-restore.mjs, framed as a hypothesis.",
  };
  try {
    mkdirSync(join(cwd, ".claude"), { recursive: true });
    writeFileSync(join(cwd, ".claude", ".session-state"), JSON.stringify(snapshot, null, 2));
  } catch {}
  process.exit(0);
});
