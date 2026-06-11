// hooks/deletion-guard.mjs
//
// Eidolon hook suite - PreToolUse(Bash). Walls outright deletion of the append-only
// records (the fix, insight, and decision logs) via a shell command (design spec
// sections 10, 11). The records never retire, cap, or auto-archive; removal requires
// an explicit human decision, never a command. (The append-only-record-guard covers
// Write/Edit; this covers the delete verbs.)
//
// I/O contract lives in hooks/lib.mjs: fail open; block via stderr + exit 2.
// Wire standalone or via hooks/guard-bash.mjs.

import { runHook, emitVerdict } from "./lib.mjs";

const RECORD = /docs[\/\\](fixes|insights|decisions)\b|(^|[\/\\\s'"])DECISIONS?\.md\b/i;
const DELETE = /\b(rm|rmdir|del|Remove-Item|shred|unlink)\b/i;

// Pure verdict for one payload.
export function evalDeletion(j) {
  if (j.tool_name && j.tool_name !== "Bash") return null;
  const cmd = String((j.tool_input || {}).command || "");

  if (DELETE.test(cmd) && RECORD.test(cmd)) {
    return { kind: "block", label: "DELETION GUARD", why:
      "this deletes an append-only record (a fix, insight, or decision log).\n" +
      "The records never retire, cap, or auto-archive. Removal requires an explicit " +
      "human decision, never a command." };
  }
  return null;
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("deletion-guard.mjs");
if (invokedDirectly) runHook((j) => emitVerdict(evalDeletion(j)));
