// hooks/verification-guard.mjs
//
// Eidolon hook suite - PreToolUse(Bash, git commit). The most insistent guard.
// Blocks a commit message that claims a visual or runtime result works without
// naming the evidence for it. A screenshot proves the render happened, not that
// it is right, and the user is the final eyes (design spec sections 4, 9, 11).
//
// Wire under PreToolUse matcher "Bash" with `"if": "Bash(git commit *)"`.
// I/O contract mirrors the lineage's known-good uncertainty-guard.mjs:
// fail open on bad input; block via stderr + exit 2.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// A confirmed visual or runtime "it works" claim.
const CLAIM = /(looks good|looks right|looks correct|renders? (?:correctly|fine|properly|now)|displays? (?:correctly|properly)|works (?:in|on) (?:the )?(?:browser|ui|app|page|screen)|works now|working now|verified (?:the )?(?:ui|visual|render|screen|output)|screenshot confirms|runs? (?:correctly|fine|now)|tested (?:it )?(?:in|on) (?:the )?(?:browser|ui|app)|visually verified|confirmed working|verified it works)/i;

// An evidence marker that backs the claim.
const EVIDENCE = /(screenshot|evidence:|verified via|signal:|proof:|see\s+\S+\.(?:png|jpe?g|gif|webp|mp4|svg)|\.(?:png|jpe?g|gif|webp|mp4)\b)/i;

// A real git-commit invocation, not a mere substring (a script/echo that only
// contains "git commit" must not trip the guard).
const COMMIT = /(?:^|[\n;&|]\s*)(?:[A-Za-z_]\w*=\S*\s+)*git(?:\s+-C\s+\S+|\s+-c\s+\S+|\s+--git-dir=\S+|\s+--work-tree=\S+)*\s+commit\b/;

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let j;
  try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()); }
  catch { process.exit(0); }

  const ti = (j && j.tool_input) || {};
  const cwd = String(j.cwd || process.cwd());
  const cmd = String(ti.command || "");
  if ((j.tool_name && j.tool_name !== "Bash") || !COMMIT.test(cmd)) process.exit(0);

  // Pull the commit message: -m inline, -F <file>, or inline heredoc.
  let msg = "";
  const mInline = cmd.match(/-m\s+(['"])([^]*?)\1/);
  const mFile = cmd.match(/(?:-F|--file)[=\s]+(\S+)/);
  if (mInline) msg = mInline[2];
  else if (mFile && mFile[1] !== "-") {
    try { msg = readFileSync(resolve(cwd, mFile[1].replace(/^['"]|['"]$/g, "")), "utf8"); }
    catch { msg = cmd; }
  } else msg = cmd;

  if (CLAIM.test(msg) && !EVIDENCE.test(msg)) {
    process.stderr.write(
      "VERIFICATION GUARD [BLOCKED - fix and retry]: this commit message claims a " +
      "visual or runtime result works, but names no evidence.\n" +
      "A screenshot proves the render happened, not that it is right, and the user " +
      "is the final eyes.\n" +
      "Either reference the evidence (a screenshot path, the signal that proved it) " +
      "or restate the message to describe the change, not an unverified result.\n"
    );
    process.exit(2);
  }
  process.exit(0);
});
