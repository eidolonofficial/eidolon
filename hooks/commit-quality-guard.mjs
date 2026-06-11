// hooks/commit-quality-guard.mjs
//
// Eidolon hook suite - PreToolUse(Bash). Blocks the bypasses that dodge the hook
// suite or rewrite history to hide it (design spec sections 10, 11). A wrong gate
// gets fixed in the open, not quietly routed around.
//
// Blocks: --no-verify (and commit's -n short form) on commit and push, a
// non-lease --force push, a core.hooksPath override, and filter-branch /
// filter-repo history surgery. Flag scanning runs on the command with its -m
// message spans stripped, so quoting a flag in a commit message never trips it.
//
// Wire under PreToolUse matcher "Bash" (standalone or via hooks/guard-bash.mjs).
// I/O contract lives in hooks/lib.mjs: fail open on bad input; block via
// stderr + exit 2.

import { runHook, withoutMessage, emitVerdict } from "./lib.mjs";

// Pure verdict for one payload; first matching check wins. Returns a verdict
// object or null (allow).
export function evalCommitQuality(j) {
  const cmd = String((j.tool_input || {}).command || "");
  if ((j.tool_name && j.tool_name !== "Bash") || !/\bgit\b/.test(cmd)) return null;

  // flags live outside the quoted message; [^|;&\n]* keeps each check inside
  // one subcommand so a flag in a later `echo` does not blame the commit
  const flags = withoutMessage(cmd);
  const B = (why) => ({ kind: "block", label: "COMMIT QUALITY GUARD", why });

  if (/git\s+commit\b[^|;&\n]*(?:--no-verify\b|\s-[a-zA-Z]*n\b)/.test(flags))
    return B("git commit --no-verify (-n) skips the hooks. Fix the underlying issue instead of bypassing the gate.");
  if (/git\s+push\b[^|;&\n]*--no-verify\b/.test(flags))
    return B("git push --no-verify skips the pre-push hooks. Fix the underlying issue instead of bypassing the gate.");
  if (/git\s+push\b[^|;&\n]*(?:--force\b|\s-f\b)/.test(flags) && !/--force-with-lease\b/.test(flags))
    return B("git push --force can clobber remote history. Use --force-with-lease, and only with an independent backup.");
  if (/core\.hooksPath\s*=|git\s+config\b[^|;&\n]*core\.hooksPath/i.test(flags))
    return B("overriding core.hooksPath disables the hook suite. The hooks are not optional.");
  if (/git\s+(?:filter-branch|filter-repo)\b/.test(flags))
    return B("history surgery (filter-branch / filter-repo) rewrites the record. Do this only in the open, with a backup, when explicitly asked.");
  return null;
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("commit-quality-guard.mjs");
if (invokedDirectly) runHook((j) => emitVerdict(evalCommitQuality(j)));
