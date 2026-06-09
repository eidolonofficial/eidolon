// hooks/protected-paths-guard.mjs
//
// Eidolon hook suite - PreToolUse(Bash). Blocks a destructive op on a protected path
// (design spec sections 10, 11). Protected by default: the git dir, the three records
// (and the root DECISIONS.md), the hooks, the settings file, and the persona template.
// State an independent backup, a rollback path, and a post-op verify, or do not run it.
//
// I/O contract lives in hooks/lib.mjs: fail open; block via stderr + exit 2.

import { runHook, touchesHookSuite, block } from "./lib.mjs";

const PROTECTED = [
  /(^|[\/\\\s'"])\.git(\b|[\/\\])/i,            // the git dir
  /docs[\/\\](fixes|insights|decisions)\b/i,     // the three append-only records
  /(^|[\/\\\s'"])DECISIONS?\.md\b/i,             // the root decision log
  /\.claude[\/\\]settings\.json/i,               // the hook wiring
  /references[\/\\]persona-template\.md/i,       // the persona template
];
const DESTRUCTIVE = /\b(rm|rmdir|del|Remove-Item|truncate|shred|unlink)\b/i;

runHook((j) => {
  if (j.tool_name && j.tool_name !== "Bash") return;
  const cmd = String((j.tool_input || {}).command || "");

  if (DESTRUCTIVE.test(cmd) && (PROTECTED.some((re) => re.test(cmd)) || touchesHookSuite(cmd))) {
    block("PROTECTED PATHS GUARD",
      "a destructive op on a protected path (.git, a record, a hook, settings.json, " +
      "or the persona template).\n" +
      "State an independent backup, a rollback path before it runs, and a post-op " +
      "verify, or do not run it.");
  }
});
