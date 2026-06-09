// hooks/drift-guard.mjs
//
// Eidolon hook suite - PreToolUse(Write, Edit). Counts consecutive scaffold-only edits
// (config, hooks, scripts, CI), resets the count on real deliverable work, advises as
// the count climbs, and blocks at the wall (design spec sections 10, 11). The
// deliverable owns the run; infra concerns are bounded and noted.
//
// State: .claude/.drift-count (gitignored; the .claude dir is created if missing,
// otherwise the counter would silently never persist). I/O contract lives in
// hooks/lib.mjs: fail open; advise via stdout JSON; hard block via stderr + exit 2.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runHook, block, advise } from "./lib.mjs";

const WALL = 10; // hard block at this many consecutive scaffold-only edits
const WARN = 6;  // advise from here up
const SCAFFOLD = /(^|[\/\\])(hooks[\/\\]|\.claude[\/\\]|scripts[\/\\]|\.github[\/\\]|Dockerfile|Makefile|\.gitignore$|[^\/\\]*\.(ya?ml|toml|ini|cfg)$|[^\/\\]*\.config\.[jt]s$)/i;

runHook((j) => {
  const name = String(j.tool_name || "");
  if (name !== "Write" && name !== "Edit") return;
  const ti = j.tool_input || {};
  const path = String(ti.file_path || ti.path || "");
  if (!path) return;

  const cwd = String(j.cwd || process.cwd());
  const stateDir = join(cwd, ".claude");
  const stateFile = join(stateDir, ".drift-count");

  let count = 0;
  try { if (existsSync(stateFile)) count = parseInt(readFileSync(stateFile, "utf8"), 10) || 0; } catch {}

  const isScaffold = SCAFFOLD.test(path);
  count = isScaffold ? count + 1 : 0;
  try { mkdirSync(stateDir, { recursive: true }); writeFileSync(stateFile, String(count)); } catch {}

  if (!isScaffold) return; // deliverable work: counter reset, allow

  if (count >= WALL) {
    block("DRIFT GUARD",
      count + " consecutive scaffold-only edits (config, hooks, scripts, CI).\n" +
      "The deliverable owns the run. Move the actual feature forward, or state plainly " +
      "why the scaffolding is the deliverable this run.");
  }
  if (count >= WARN) {
    advise("DRIFT GUARD",
      count + " scaffold-only edits in a row. The deliverable owns the run; the wall is at " + WALL + ".");
  }
});
