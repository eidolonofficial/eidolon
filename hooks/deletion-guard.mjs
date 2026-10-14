// hooks/deletion-guard.mjs
//
// Eidolon hook suite - PreToolUse(Bash). Walls deletion and overwrite of the append-only
// records (the fix, insight, and decision logs) via a shell command (design spec
// sections 10, 11): delete verbs, truncating redirects, cp/mv/tee/sed -i onto a record,
// Set-Content, Clear-Content, Out-File. The records never retire, cap, or auto-archive;
// removal requires an explicit human decision, never a command. Appends stay allowed.
// (The append-only-record-guard covers Write/Edit; this covers the shell.)
//
// I/O contract lives in hooks/lib.mjs: fail open; block via stderr + exit 2.
// Wire standalone or via hooks/guard-bash.mjs.

import { runHook, emitVerdict, withoutMessage } from "./lib.mjs";
import { policyRoot } from "./operation.mjs";
import { shellPathFacts, tolerant } from "./shell-operation.mjs";

const RECORD = /docs[\/\\](fixes|insights|decisions)\b|(^|[\/\\\s'"])DECISIONS?\.md\b/i;
const DELETE = /\b(rm|rmdir|del|Remove-Item|shred|unlink)\b/i;

// Pure verdict for one payload. The path facts resolve cd segments and dot segments; the
// verb-and-path regexes stay as a second net for forms the facts do not model (git rm).
export const evalDeletion = tolerant((j) => {
  if (j.tool_name && j.tool_name !== "Bash") return null;
  const cmd = String((j.tool_input || {}).command || "");
  const changed = shellPathFacts(cmd, j.cwd || process.cwd(), policyRoot(j), j.shell_language)
    // A hard link to a record is a second name for it: a write through the link rewrites the record.
    .some((f) => f.kind === "record" && (f.op === "delete" || f.op === "write" || (f.op === "link" && f.hard)));
  // The raw net reads the command without its commit message: a message may say "rm" and name a record.
  const bare = withoutMessage(cmd);

  if (changed || (DELETE.test(bare) && RECORD.test(bare))) {
    return { kind: "block", label: "DELETION GUARD", why:
      "this deletes or overwrites an append-only record (a fix, insight, or decision log). " +
      "Appending (>>, tee -a, Add-Content) is allowed.\n" +
      "The records never retire, cap, or auto-archive. Removal requires an explicit " +
      "human decision, never a command." };
  }
  return null;
});

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("deletion-guard.mjs");
if (invokedDirectly) runHook((j) => emitVerdict(evalDeletion(j)));
