// hooks/lib.mjs
//
// Eidolon hook suite - shared plumbing. Every guard reads the same Claude Code
// hook JSON from stdin, fails open on bad input, blocks via stderr + exit 2,
// asks via the documented permissionDecision JSON (the consent tier), and
// advises via stdout JSON. Before this module each guard carried its own
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
// The vendored evolve engine (engine/asi-evolve/ and its on-demand venv at engine/.venv/)
// carries third-party hooks/ paths that are NOT Eidolon's governance suite: pip alone vendors
// pyproject_hooks/ and requests/hooks.py, and faiss/sentence-transformers bring more. A routine
// rm/chmod inside the engine tree or its venv must not read as tampering with the suite. So
// neutralize ONLY engine-prefixed path tokens before testing: a command that ALSO names a real
// hook outside engine/ (e.g. `cp hooks/guard-bash.mjs engine/x`) keeps its real-hook token and
// still trips - the true catch is preserved, only the vendored-tree false positive is removed.
// Beneficial change (fewer false catches, never fewer true ones); proof + provenance in
// docs/fixes/FIX-2026-06-16-engine-hook-suite-exemption.md.
const ENGINE_TOKEN = /(^|[\s'"=:;&|(])(?:\.[\/\\])?engine[\/\\][^\s;&|]*/gi;
export function touchesHookSuite(cmd) {
  const scrubbed = String(cmd).replace(ENGINE_TOKEN, "$1 ");
  return HOOKS_SEGMENT.test(scrubbed) || HOOKS_GOV_FILE.test(scrubbed);
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
// The tag is the bracketed disposition; persona-conduct's Expediter lock uses
// "HARD STOP - seat cleared", everything else the default.
export function block(label, why, tag = "BLOCKED - fix and retry") {
  process.stderr.write(label + " [" + tag + "]: " + why + "\n");
  process.exit(2);
}

// Escalate to the human: the call neither proceeds nor dies; Claude Code shows
// the reason and waits for an explicit yes. The consent tier between advise and
// block, for an action the operator may legitimately have a safety net for (a
// rollback path the guard cannot see). Documented PreToolUse output:
// hookSpecificOutput.permissionDecision "ask".
export function ask(label, why) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: label + ": " + why,
    },
  }));
  process.exit(0);
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

// One verdict ({ kind: "block"|"ask"|"advise", label, why, tag? }), emitted the
// way the suite speaks. The standalone guard entry points and the dispatchers
// both speak through this, so a verdict renders identically whether the guard
// ran alone or in the consolidated suite.
export function emitVerdict(v) {
  if (!v) return;
  if (v.kind === "block") block(v.label, v.why, v.tag);
  if (v.kind === "ask") ask(v.label, v.why);
  if (v.kind === "advise") advise(v.label, v.why);
}

// Run an ordered suite of pure evaluators against one stdin payload: the
// dispatcher shape, one spawn for a whole matcher instead of one per guard.
// Precedence: the first block halts the call immediately (wiring order is
// preserved, so consolidation never changes which guard speaks first); next an
// ask escalates to the human, its reason carrying every ask that fired; only
// when nothing blocks or asks do the advisories ride along together.
export function runSuite(evaluators) {
  runHook((j) => {
    const asks = [];
    const advisories = [];
    for (const evaluate of evaluators) {
      const v = evaluate(j);
      if (!v) continue;
      if (v.kind === "block") block(v.label, v.why, v.tag);
      else if (v.kind === "ask") asks.push(v);
      else advisories.push(v);
    }
    if (asks.length) ask(asks[0].label, asks.map((a) => a.why).join(" "));
    else if (advisories.length) advise(advisories[0].label, advisories.map((a) => a.why).join(" "));
  });
}
