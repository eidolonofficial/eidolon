// hooks/conduct-guard.mjs
//
// Eidolon hook suite - PreToolUse(Write, Edit, Bash git commit). Advisory: trips on
// conduct-drift language (deferring doable work, stub-instead-of-fix, unverified claim)
// in a file or a commit message and injects a reminder (design spec sections 10, 11).
// The hard blocks live elsewhere (verification-guard for commit claims,
// persona-conduct-guard for a seated persona's stubs, commit-quality-guard for bypass);
// this is the broader advisory net.
//
// I/O contract mirrors uncertainty-guard.mjs: fail open; advise via stdout JSON
// (hookSpecificOutput.additionalContext); never a hard block.

const DEFER = /\b(i'?ll (do|fix|handle|finish|come back to) (this|that|it)? ?later|leav(e|ing) (this|that|it) for later|punt(ing)? on (this|that|it)|deal with (this|it) later|circle back later)\b/i;
const STUB = /\b(NotImplementedError|TODO:?\s*implement|placeholder (impl|implementation)|stub(bed)? (it )?out|fake (it )?for now|hack(ed)? (this|it) (in|together) for now)\b/i;
const UNVERIFIED = /\b(this (definitely|certainly|obviously) works|works for sure|i'?m sure (this|it) works|done \(not tested\)|verified \(untested\)|should be fine, shipping)\b/i;

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let j;
  try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()); }
  catch { process.exit(0); }
  const name = String(j.tool_name || "");
  const ti = j.tool_input || {};

  // META: files whose job is to enumerate these phrases must never be flagged.
  const path = String(ti.file_path || ti.path || "");
  if (/hooks[\/\\]|antibehavior-catalog|persona-template|references[\/\\]personas[\/\\]|CLAUDE\.md|README/i.test(path)) process.exit(0);

  let text = "";
  if (name === "Write") text = String(ti.content || "");
  else if (name === "Edit") text = String(ti.new_string || "");
  else if (name === "Bash") {
    const cmd = String(ti.command || "");
    if (!/(?:^|[\n;&|]\s*)git(?:\s+-\S+)*\s+commit\b/.test(cmd)) process.exit(0);
    const m = cmd.match(/-m\s+(['"])([^]*?)\1/);
    text = m ? m[2] : cmd;
  } else process.exit(0);

  const hits = [];
  if (DEFER.test(text)) hits.push("deferring doable work");
  if (STUB.test(text)) hits.push("stub instead of fix");
  if (UNVERIFIED.test(text)) hits.push("unverified claim");
  if (hits.length === 0) process.exit(0);

  const msg = "CONDUCT GUARD: this reads like " + hits.join(" + ") + ". " +
    "A handoff is honest only when the work is genuinely blocked and the blocker is named; " +
    "root cause, not a stub; state the second signal that proves it, or cut the claim.";
  process.stdout.write(JSON.stringify({
    systemMessage: msg,
    hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: msg },
  }));
  process.exit(0);
});
