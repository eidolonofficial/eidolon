// hooks/drift-guard.mjs
//
// Eidolon hook suite - PreToolUse(Write, Edit). Counts consecutive scaffold-only edits
// (config, hooks, scripts, CI), resets the count on real deliverable work, advises as
// the count climbs, and blocks at the wall (design spec sections 10, 11). The
// deliverable owns the run; infra concerns are bounded and noted.
//
// State: .claude/.drift-count (gitignored). I/O contract mirrors uncertainty-guard.mjs:
// fail open; advise via stdout JSON; hard block via stderr + exit 2.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const WALL = 10; // hard block at this many consecutive scaffold-only edits
const WARN = 6;  // advise from here up
const SCAFFOLD = /(^|[\/\\])(hooks[\/\\]|\.claude[\/\\]|scripts[\/\\]|\.github[\/\\]|Dockerfile|Makefile|\.gitignore$|[^\/\\]*\.(ya?ml|toml|ini|cfg)$|[^\/\\]*\.config\.[jt]s$)/i;

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let j;
  try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()); }
  catch { process.exit(0); }
  const name = String(j.tool_name || "");
  if (name !== "Write" && name !== "Edit") process.exit(0);
  const ti = j.tool_input || {};
  const path = String(ti.file_path || ti.path || "");
  if (!path) process.exit(0);

  const cwd = String(j.cwd || process.cwd());
  const stateFile = join(cwd, ".claude", ".drift-count");

  let count = 0;
  try { if (existsSync(stateFile)) count = parseInt(readFileSync(stateFile, "utf8"), 10) || 0; } catch {}

  const isScaffold = SCAFFOLD.test(path);
  count = isScaffold ? count + 1 : 0;
  try { writeFileSync(stateFile, String(count)); } catch {}

  if (!isScaffold) process.exit(0); // deliverable work: counter reset, allow

  if (count >= WALL) {
    process.stderr.write(
      "DRIFT GUARD [BLOCKED - fix and retry]: " + count + " consecutive scaffold-only " +
      "edits (config, hooks, scripts, CI).\n" +
      "The deliverable owns the run. Move the actual feature forward, or state plainly " +
      "why the scaffolding is the deliverable this run.\n");
    process.exit(2);
  }
  if (count >= WARN) {
    const msg = "DRIFT GUARD: " + count + " scaffold-only edits in a row. The deliverable " +
      "owns the run; the wall is at " + WALL + ".";
    process.stdout.write(JSON.stringify({
      systemMessage: msg,
      hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: msg },
    }));
  }
  process.exit(0);
});
