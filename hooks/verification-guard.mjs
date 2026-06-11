// hooks/verification-guard.mjs
//
// Eidolon hook suite - PreToolUse(Bash, git commit). The most insistent guard.
// Blocks a commit message that claims a visual or runtime result works without
// naming the evidence for it. A screenshot proves the render happened, not that
// it is right, and the user is the final eyes (design spec sections 4, 9, 11).
//
// Wire under PreToolUse matcher "Bash" (standalone or via hooks/guard-bash.mjs).
// I/O contract lives in hooks/lib.mjs: fail open on bad input; block via
// stderr + exit 2.

import { runHook, isGitCommit, commitMessageOf, emitVerdict } from "./lib.mjs";

// A confirmed visual or runtime "it works" claim.
const CLAIM = /(looks good|looks right|looks correct|renders? (?:correctly|fine|properly|now)|displays? (?:correctly|properly)|works (?:in|on) (?:the )?(?:browser|ui|app|page|screen)|works now|working now|verified (?:the )?(?:ui|visual|render|screen|output)|screenshot confirms|runs? (?:correctly|fine|now)|tested (?:it )?(?:in|on) (?:the )?(?:browser|ui|app)|visually verified|confirmed working|verified it works)/i;

// An evidence marker that backs the claim.
const EVIDENCE = /(screenshot|evidence:|verified via|signal:|proof:|see\s+\S+\.(?:png|jpe?g|gif|webp|mp4|svg)|\.(?:png|jpe?g|gif|webp|mp4)\b)/i;

// Pure verdict for one payload, so the dispatcher and the standalone entry
// share one behavior. Returns a verdict object or null (allow).
export function evalVerification(j) {
  const ti = j.tool_input || {};
  const cmd = String(ti.command || "");
  if ((j.tool_name && j.tool_name !== "Bash") || !isGitCommit(cmd)) return null;

  const msg = commitMessageOf(cmd, j.cwd);
  if (CLAIM.test(msg) && !EVIDENCE.test(msg)) {
    return { kind: "block", label: "VERIFICATION GUARD", why:
      "this commit message claims a visual or runtime result works, but names no evidence.\n" +
      "A screenshot proves the render happened, not that it is right, and the user " +
      "is the final eyes.\n" +
      "Either reference the evidence (a screenshot path, the signal that proved it) " +
      "or restate the message to describe the change, not an unverified result." };
  }
  return null;
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("verification-guard.mjs");
if (invokedDirectly) runHook((j) => emitVerdict(evalVerification(j)));
