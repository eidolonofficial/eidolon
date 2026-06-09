// hooks/session-save.mjs
//
// Eidolon hook suite - PreCompact. Saves a short note of where the run stands before
// context is trimmed, so a compaction never loses the thread (design spec section 11).
// Writes .claude/.session-state (gitignored). Fail open.
//
// This is a template: the harness passes what it can about the run on stdin; fill the
// snapshot from the active manifest, the open findings, and the current stage when those
// are available to the hook.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let j;
  try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()); }
  catch { j = {}; }
  const cwd = String(j.cwd || process.cwd());
  const snapshot = {
    saved_before: "context trim (PreCompact)",
    cwd,
    stage: "<fill: the current pipeline stage>",
    open: "<fill: open findings and the next action>",
    note: "Restored on the next SessionStart by session-restore.mjs.",
  };
  try { writeFileSync(join(cwd, ".claude", ".session-state"), JSON.stringify(snapshot, null, 2)); }
  catch {}
  process.exit(0);
});
