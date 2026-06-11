// hooks/append-only-record-guard.mjs
//
// Eidolon hook suite - PreToolUse(Write, Edit). The fix log, insight log, and
// decision log are append-only (design spec sections 10, 11). Operational rules
// can retire; the records never retire, cap, or auto-archive. This guard advises
// on a shrinking edit, and blocks an emptying or more-than-half-shrinking one
// (silent deletion). Removal of a record needs an explicit human decision,
// never a silent overwrite.
//
// Wire under PreToolUse matcher "Write|Edit" (standalone or via
// hooks/guard-write.mjs). I/O contract lives in hooks/lib.mjs: fail open on
// bad input; advisory via stdout JSON (additionalContext); hard block via
// stderr + exit 2.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { runHook, emitVerdict } from "./lib.mjs";

const RECORD = /(?:^|[\/\\])docs[\/\\](?:fixes|insights|decisions)[\/\\]|(?:^|[\/\\])DECISIONS?\.md$/i;

// sizes compare in UTF-8 bytes on both sides; statSync reports bytes
const bytes = (s) => Buffer.byteLength(String(s ?? ""), "utf8");

// Pure verdict for one payload; the strictest matching tier wins.
export function evalAppendOnlyRecord(j) {
  const ti = j.tool_input || {};
  const name = String(j.tool_name || "");
  const given = String(ti.file_path || ti.path || "");
  if (!given || !RECORD.test(given)) return null;
  const path = resolve(String(j.cwd || process.cwd()), given);

  const B = (why) => ({ kind: "block", label: "APPEND-ONLY RECORD GUARD", why });
  const A = (why) => ({ kind: "advise", label: "APPEND-ONLY RECORD GUARD", why });

  if (name === "Write") {
    if (!existsSync(path)) return null; // a new record file is an append
    const prev = statSync(path).size;
    if (prev === 0) return null; // nothing recorded yet, nothing to shrink
    const next = bytes(ti.content);
    if (next === 0)
      return B("this empties an append-only record (" + given + "). Records never delete; removal needs an explicit human decision.");
    if (next < prev * 0.5)
      return B("this Write shrinks an append-only record (" + given + ") by more than half. A real removal needs an explicit human decision, not a silent overwrite.");
    if (next < prev)
      return A("this Write is shorter than the existing record (" + given + "). These logs are append-only; prefer adding over replacing.");
    return null;
  }

  if (name === "Edit") {
    const oldLen = bytes(ti.old_string);
    const newLen = bytes(ti.new_string);
    if (newLen === 0 && oldLen > 0)
      return B("this Edit deletes a span from an append-only record (" + given + ") and replaces it with nothing. Records are append-only.");
    if (newLen < oldLen)
      return A("this Edit removes content from an append-only record (" + given + "). These logs are append-only; retire operational rules elsewhere, not the record.");
  }
  return null;
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("append-only-record-guard.mjs");
if (invokedDirectly) runHook((j) => emitVerdict(evalAppendOnlyRecord(j)));
