// hooks/visual-evidence-gate.mjs
//
// Eidolon hook suite - PreToolUse(Bash, git commit). Blocks a commit that stages a
// visual file (image, video, pdf) without naming evidence it was looked at (design
// spec section 11). A render must be seen, not assumed; the user is the final eyes.
//
// Looks in three places, because a PreToolUse hook runs before the command does:
//   1. what is already staged (git diff --cached, execFile with an argument array),
//   2. visual files named by the command itself (`git add shot.png && git commit`
//      stages within the very command the hook is gating - the index check alone
//      would always run too early and see nothing),
//   3. modified tracked visuals swept in by commit -a / -am.
// The -m message spans are stripped before (2), so naming a screenshot AS evidence
// is never mistaken for staging one.
//
// I/O contract lives in hooks/lib.mjs: fail open; block via stderr + exit 2.

import { execFileSync } from "node:child_process";
import { runHook, isGitCommit, commitMessageOf, withoutMessage, block } from "./lib.mjs";

const VISUAL = /\.(png|jpe?g|gif|webp|svg|mp4|mov|webm|pdf)$/i;
const VISUAL_TOKEN = /[\w.\/\\~-]+\.(?:png|jpe?g|gif|webp|svg|mp4|mov|webm|pdf)\b/gi;
const EVIDENCE = /(screenshot|looked at it|viewed it|verified visually|see\s+\S+\.(png|jpe?g|gif|webp|mp4)|evidence:|user (confirmed|approved|saw))/i;

runHook((j) => {
  if (j.tool_name && j.tool_name !== "Bash") return;
  const cmd = String((j.tool_input || {}).command || "");
  if (!isGitCommit(cmd)) return;
  const cwd = String(j.cwd || process.cwd());

  const git = (args) => {
    try {
      return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch { return ""; } // not a git repo: nothing to gate
  };

  const visuals = new Set();
  for (const f of git(["diff", "--cached", "--name-only", "--diff-filter=AM"]).split(/\r?\n/))
    if (f && VISUAL.test(f)) visuals.add(f);
  for (const t of withoutMessage(cmd).match(VISUAL_TOKEN) || [])
    visuals.add(t);
  // -a is read from the original command: -am is a combined message flag, so the
  // stripped form would lose the -a along with the message
  if (/git\b[^|;&\n]*commit\b[^|;&\n]*(?:\s--all\b|\s-[a-zA-Z]*a)/.test(cmd))
    for (const f of git(["diff", "--name-only", "--diff-filter=M"]).split(/\r?\n/))
      if (f && VISUAL.test(f)) visuals.add(f);

  if (visuals.size === 0) return;

  const msg = commitMessageOf(cmd, cwd);
  if (EVIDENCE.test(msg)) return;

  const list = [...visuals];
  block("VISUAL EVIDENCE GATE",
    "this commit stages a visual file (" +
    list.slice(0, 3).join(", ") + (list.length > 3 ? ", ..." : "") +
    ") but names no evidence it was looked at.\n" +
    "A render must be seen, not assumed; the user is the final eyes. Reference the " +
    "evidence (a screenshot, that the user confirmed it) or restate the message.");
});
