// hooks/protected-paths-guard.mjs
//
// Eidolon hook suite - PreToolUse(Bash). Blocks a destructive op on a protected path
// (design spec sections 10, 11). Protected by default: the git dir, the three records
// (and the root DECISIONS.md), the hooks, the settings file, and the persona template.
// State an independent backup, a rollback path, and a post-op verify, or do not run it.
//
// I/O contract lives in hooks/lib.mjs: fail open; block via stderr + exit 2.
// Wire standalone or via hooks/guard-bash.mjs.

import { runHook, touchesHookSuite, emitVerdict, withoutMessage } from "./lib.mjs";
import { policyRoot } from "./operation.mjs";
import { shellPathFacts, tolerant } from "./shell-operation.mjs";

const PROTECTED = [
  /(^|[\/\\\s'"])\.git(\b|[\/\\])/i,            // the git dir
  /docs[\/\\](fixes|insights|decisions)\b/i,     // the three append-only records
  /(^|[\/\\\s'"])DECISIONS?\.md\b/i,             // the root decision log
  /\.claude[\/\\]settings\.json/i,               // the hook wiring
  /references[\/\\]persona-template\.md/i,       // the persona template
];
const DESTRUCTIVE = /\b(rm|rmdir|del|Remove-Item|truncate|shred|unlink)\b/i;

// Pure verdict for one payload.
export const evalProtectedPaths = tolerant((j) => {
  if (j.tool_name && j.tool_name !== "Bash") return null;
  const cmd = String((j.tool_input || {}).command || "");
  // Facts follow cd segments and dot segments; the regexes below are the second net.
  const deletes = shellPathFacts(cmd, j.cwd || process.cwd(), policyRoot(j), j.shell_language).some((f) => f.op === "delete");

  const bare = withoutMessage(cmd); // a commit message may say "rm" and name a record
  if (deletes || (DESTRUCTIVE.test(bare) && (PROTECTED.some((re) => re.test(bare)) || touchesHookSuite(cmd, j)))) {
    return { kind: "block", label: "PROTECTED PATHS GUARD", why:
      "a destructive op on a protected path (.git, a record, a hook, settings.json, " +
      "or the persona template).\n" +
      "State an independent backup, a rollback path before it runs, and a post-op " +
      "verify, or do not run it." };
  }
  return null;
});

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("protected-paths-guard.mjs");
if (invokedDirectly) runHook((j) => emitVerdict(evalProtectedPaths(j)));
