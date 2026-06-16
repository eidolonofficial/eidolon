// hooks/session-restore.mjs
//
// Eidolon hook suite - SessionStart. Brings the saved run-state snapshot back so a new
// session resumes the thread a compaction or a stop interrupted (design spec section 11).
// Reads .claude/.session-state and injects it as additional context. Fail open.
//
// The snapshot is a point-in-time hypothesis, not ground truth: it is framed as such so
// the resumed session verifies it against source-of-record (git log, the decision/fix/notes
// records) rather than consuming it blindly, and a snapshot older than the staleness window
// is flagged so a leftover note is never mistaken for current state.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

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
  try { state = readFileSync(f, "utf8"); }
  catch { process.exit(0); }
  if (!state.trim()) process.exit(0);

  // Staleness applies only when the snapshot carries a parseable saved_at; otherwise make
  // no claim about its age.
  let staleBanner = "";
  try {
    const savedAt = Date.parse(JSON.parse(state).saved_at);
    if (Number.isFinite(savedAt) && Date.now() - savedAt > STALE_MS) {
      const days = Math.round((Date.now() - savedAt) / 86400000);
      staleBanner = "\n[!] STALE: this snapshot is about " + days + " day(s) old -- it likely predates the " +
        "current state. Verify hard against git before trusting any line.";
    }
  } catch { /* not JSON or no saved_at -> make no staleness claim */ }

  const msg =
    "Restored run-state SNAPSHOT from the last session. Treat it as a HYPOTHESIS about where the run " +
    "stands, NOT ground truth -- verify against source-of-record (git log, the decision/fix/notes " +
    "records) before acting." + staleBanner + "\n" + state;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: msg },
  }));
  process.exit(0);
});
