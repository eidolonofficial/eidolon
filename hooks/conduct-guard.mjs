// hooks/conduct-guard.mjs
//
// Eidolon hook suite - PreToolUse(Write, Edit, Bash git commit). Advisory: trips on
// conduct-drift language (deferring doable work, stub-instead-of-fix, unverified claim)
// in a file or a commit message and injects a reminder (design spec sections 10, 11).
// The hard blocks live elsewhere (verification-guard for commit claims,
// persona-conduct-guard for a seated persona's stubs, commit-quality-guard for bypass);
// this is the broader advisory net.
//
// I/O contract lives in hooks/lib.mjs: fail open; advise via stdout JSON
// (hookSpecificOutput.additionalContext); never a hard block. Wire standalone
// or via hooks/guard-bash.mjs and hooks/guard-write.mjs.

import { runHook, isGitCommit, commitMessageOf, emitVerdict } from "./lib.mjs";

const DEFER = /\b(i'?ll (do|fix|handle|finish|come back to) (this|that|it)? ?later|leav(e|ing) (this|that|it) for later|punt(ing)? on (this|that|it)|deal with (this|it) later|circle back later)\b/i;
const STUB = /\b(NotImplementedError|TODO:?\s*implement|placeholder (impl|implementation)|stub(bed)? (it )?out|fake (it )?for now|hack(ed)? (this|it) (in|together) for now)\b/i;
const UNVERIFIED = /\b(this (definitely|certainly|obviously) works|works for sure|i'?m sure (this|it) works|done \(not tested\)|verified \(untested\)|should be fine, shipping)\b/i;

// Pure verdict for one payload.
export function evalConduct(j) {
  const name = String(j.tool_name || "");
  const ti = j.tool_input || {};

  // META: files whose job is to enumerate these phrases must never be flagged.
  const path = String(ti.file_path || ti.path || "");
  if (/hooks[\/\\]|antibehavior-catalog|persona-template|references[\/\\]personas[\/\\]|CLAUDE\.md|README/i.test(path)) return null;

  let text = "";
  if (name === "Write") text = String(ti.content || "");
  else if (name === "Edit") text = String(ti.new_string || "");
  else if (name === "Bash") {
    const cmd = String(ti.command || "");
    if (!isGitCommit(cmd)) return null;
    text = commitMessageOf(cmd, j.cwd);
  } else return null;

  const hits = [];
  if (DEFER.test(text)) hits.push("deferring doable work");
  if (STUB.test(text)) hits.push("stub instead of fix");
  if (UNVERIFIED.test(text)) hits.push("unverified claim");
  if (hits.length === 0) return null;

  return { kind: "advise", label: "CONDUCT GUARD", why:
    "this reads like " + hits.join(" + ") + ". " +
    "A handoff is honest only when the work is genuinely blocked and the blocker is named; " +
    "root cause, not a stub; state the second signal that proves it, or cut the claim." };
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("conduct-guard.mjs");
if (invokedDirectly) runHook((j) => emitVerdict(evalConduct(j)));
