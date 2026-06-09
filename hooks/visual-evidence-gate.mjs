// hooks/visual-evidence-gate.mjs
//
// Eidolon hook suite - PreToolUse(Bash, git commit). Blocks a commit that stages a
// visual file (image, video, pdf) without naming evidence it was looked at (design
// spec section 11). A render must be seen, not assumed; the user is the final eyes.
// Reads the staged additions with git (execFile, an argument array, no shell string).
//
// I/O contract mirrors uncertainty-guard.mjs: fail open; block via stderr + exit 2.

import { execFileSync } from "node:child_process";

const VISUAL = /\.(png|jpe?g|gif|webp|svg|mp4|mov|webm|pdf)$/i;
const EVIDENCE = /(screenshot|looked at it|viewed it|verified visually|see\s+\S+\.(png|jpe?g|gif|webp|mp4)|evidence:|user (confirmed|approved|saw))/i;

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let j;
  try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()); }
  catch { process.exit(0); }
  if (j.tool_name && j.tool_name !== "Bash") process.exit(0);
  const cmd = String((j.tool_input || {}).command || "");
  if (!/(?:^|[\n;&|]\s*)git(?:\s+-\S+)*\s+commit\b/.test(cmd)) process.exit(0);

  let staged = "";
  try {
    staged = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=AM"],
      { cwd: String(j.cwd || process.cwd()), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch { process.exit(0); } // not a git repo / nothing staged: nothing to gate

  const images = staged.split(/\r?\n/).filter((f) => f && VISUAL.test(f));
  if (images.length === 0) process.exit(0);

  const m = cmd.match(/-m\s+(['"])([^]*?)\1/);
  const msg = m ? m[2] : cmd;
  if (EVIDENCE.test(msg)) process.exit(0);

  process.stderr.write(
    "VISUAL EVIDENCE GATE [BLOCKED - fix and retry]: this commit stages a visual file (" +
    images.slice(0, 3).join(", ") + (images.length > 3 ? ", ..." : "") +
    ") but names no evidence it was looked at.\n" +
    "A render must be seen, not assumed; the user is the final eyes. Reference the " +
    "evidence (a screenshot, that the user confirmed it) or restate the message.\n");
  process.exit(2);
});
