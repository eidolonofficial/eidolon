// hooks/append-only-record-guard.mjs
//
// Eidolon hook suite - PreToolUse(Write, Edit). The fix log, insight log, and
// decision log are append-only (design spec sections 10, 11). Operational rules
// can retire; the records never retire, cap, or auto-archive. This guard reminds
// on a shrinking edit and blocks an emptying one (silent deletion). Removal of a
// record needs an explicit human decision, never a silent overwrite.
//
// Wire under PreToolUse matcher "Write|Edit". I/O contract mirrors
// uncertainty-guard.mjs: fail open on bad input; advisory via stdout JSON
// (additionalContext); hard block via stderr + exit 2.

import { existsSync, statSync } from "node:fs";

const RECORD = /(?:^|[\/\\])docs[\/\\](?:fixes|insights|decisions)[\/\\]|(?:^|[\/\\])DECISIONS?\.md$/i;

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let j;
  try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()); }
  catch { process.exit(0); }

  const ti = (j && j.tool_input) || {};
  const name = String(j.tool_name || "");
  const path = String(ti.file_path || ti.path || "");
  if (!path || !RECORD.test(path)) process.exit(0);

  const block = (why) => {
    process.stderr.write("APPEND-ONLY RECORD GUARD [BLOCKED - fix and retry]: " + why + "\n");
    process.exit(2);
  };
  const advise = (why) => {
    const msg = "APPEND-ONLY RECORD GUARD: " + why;
    process.stdout.write(JSON.stringify({
      systemMessage: msg,
      hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: msg },
    }));
    process.exit(0);
  };

  if (name === "Write") {
    const next = String(ti.content != null ? ti.content : "").length;
    if (existsSync(path)) {
      const prev = statSync(path).size;
      if (next === 0)
        block("this empties an append-only record (" + path + "). Records never delete; removal needs an explicit human decision.");
      if (prev > 0 && next < prev * 0.5)
        block("this Write shrinks an append-only record (" + path + ") by more than half. A real removal needs an explicit human decision, not a silent overwrite.");
      if (next < prev)
        advise("this Write is shorter than the existing record (" + path + "). These logs are append-only; prefer adding over replacing.");
    }
    process.exit(0);
  }

  if (name === "Edit") {
    const oldLen = String(ti.old_string != null ? ti.old_string : "").length;
    const newLen = String(ti.new_string != null ? ti.new_string : "").length;
    if (newLen === 0 && oldLen > 0)
      block("this Edit deletes a span from an append-only record (" + path + ") and replaces it with nothing. Records are append-only.");
    if (newLen < oldLen)
      advise("this Edit removes content from an append-only record (" + path + "). These logs are append-only; retire operational rules elsewhere, not the record.");
    process.exit(0);
  }

  process.exit(0);
});
