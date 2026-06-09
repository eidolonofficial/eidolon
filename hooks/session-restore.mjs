// hooks/session-restore.mjs
//
// Eidolon hook suite - SessionStart. Brings the saved run-state note back so a new
// session resumes the thread a compaction or a stop interrupted (design spec section
// 11). Reads .claude/.session-state and injects it as additional context. Fail open.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let j;
  try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()); }
  catch { j = {}; }
  const cwd = String(j.cwd || process.cwd());
  const f = join(cwd, ".claude", ".session-state");
  if (!existsSync(f)) process.exit(0);

  let state = "";
  try { state = readFileSync(f, "utf8"); } catch { process.exit(0); }
  if (!state.trim()) process.exit(0);

  const msg = "Restored run-state note from the last session:\n" + state;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: msg },
  }));
  process.exit(0);
});
