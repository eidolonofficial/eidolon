// hooks/lib.mjs
//
// Eidolon hook suite - shared plumbing. Every guard reads the same Claude Code
// hook JSON from stdin, fails open on bad input, blocks via stderr + exit 2,
// and advises via stdout JSON. Before this module each guard carried its own
// copy of that contract, and three of them had drifted into three different
// git-commit detectors; the weaker two missed `git -C <path> commit`. One
// implementation, one behavior.
//
// Not wired in settings.json; imported by the guards next to it. The
// hook-integrity and protected-paths guards cover this file like any other
// hook: removing the plumbing disables the suite.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// A real git-commit invocation: start of input or after a separator, optional
// leading VAR=value assignments, optional -C/-c/--git-dir/--work-tree options,
// then the commit subcommand. A mere "git commit" substring (an echo, a script
// body) does not trip it.
export const GIT_COMMIT =
  /(?:^|[\n;&|]\s*)(?:[A-Za-z_]\w*=\S*\s+)*git(?:\s+-C\s+\S+|\s+-c\s+\S+|\s+--git-dir=\S+|\s+--work-tree=\S+)*\s+commit\b/;

export function isGitCommit(cmd) {
  return GIT_COMMIT.test(String(cmd));
}

// A quoted message flag span: -m / --message in any of their spellings,
// including combined short flags (-am 'msg') and the = form (--message="msg").
const MESSAGE_FLAG = /(?:^|\s)(?:--message=?|-[a-zA-Z]*m)\s*(['"])([^]*?)\1/g;

// The full commit message of a commit command: every -m/--message part (git
// joins them as paragraphs), or the -F/--file body, or the whole command when
// the message arrives some other way (heredoc, editor). Scanning the whole
// command on fallback errs toward catching a claim, never toward missing one.
export function commitMessageOf(cmd, cwd) {
  cmd = String(cmd);
  const parts = [];
  for (const m of cmd.matchAll(MESSAGE_FLAG)) parts.push(m[2]);
  if (parts.length) return parts.join("\n\n");
  const f = cmd.match(/(?:-F|--file)[=\s]+(\S+)/);
  if (f && f[1] !== "-") {
    try {
      return readFileSync(resolve(String(cwd || process.cwd()), f[1].replace(/^['"]|['"]$/g, "")), "utf8");
    } catch { /* unreadable message file: fall through to the whole command */ }
  }
  return cmd;
}

// The command with its message spans removed, so text inside -m '...' is never
// mistaken for a flag or a file operand of the command itself.
export function withoutMessage(cmd) {
  return String(cmd).replace(MESSAGE_FLAG, " ");
}

// True when the command references the governance hook suite: the hooks dir as
// a path segment ("hooks", "./hooks/x.mjs", ".git/hooks/pre-push") or a hook
// file by its extension anywhere ("/abs/path/hooks/guard.mjs"). A hooks
// directory nested in the source tree ("src/hooks/useAuth.ts") is application
// code, not the suite, and does not match.
const HOOKS_SEGMENT = /(?:^|[\s'"=:;&|])(?:\.[\/\\])?(?:\.git[\/\\])?hooks(?:[\/\\]|(?=['"\s;&|)]|$))/i;
const HOOKS_GOV_FILE = /hooks[\/\\]\S*\.(?:mjs|cjs|ps1|sh|py)\b/i;
export function touchesHookSuite(cmd) {
  return HOOKS_SEGMENT.test(String(cmd)) || HOOKS_GOV_FILE.test(String(cmd));
}

// Run a hook body against the parsed stdin JSON. A parse failure exits 0: a
// malformed payload must never brick the workflow (fail open). The body may
// exit itself (block/advise do); otherwise the hook allows.
export function runHook(fn) {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    let j;
    try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()); }
    catch { process.exit(0); }
    fn(j || {});
    process.exit(0);
  });
}

// Hard block: the reason goes to stderr, exit 2. Claude sees it and retries.
export function block(label, why) {
  process.stderr.write(label + " [BLOCKED - fix and retry]: " + why + "\n");
  process.exit(2);
}

// Advisory: the tool call proceeds; the note rides along as context.
export function advise(label, why) {
  const msg = label + ": " + why;
  process.stdout.write(JSON.stringify({
    systemMessage: msg,
    hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: msg },
  }));
  process.exit(0);
}
