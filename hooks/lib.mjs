// hooks/lib.mjs
//
// Eidolon hook suite - shared plumbing. Every guard reads the same Claude Code
// hook JSON from stdin, rejects invalid enforcement input, blocks via stderr + exit 2,
// asks via the documented permissionDecision JSON (the consent tier), and
// advises via stdout JSON. Before this module each guard carried its own
// copy of that contract, and three of them had drifted into three different
// git-commit detectors; the weaker two missed `git -C <path> commit`. One
// implementation, one behavior.
//
// Not wired in settings.json; imported by the guards next to it. The
// hook-integrity and protected-paths guards cover this file like any other
// hook: removing the plumbing disables the suite.

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {normalizeEvent, policyRoot} from "./operation.mjs";
import {gitOperations, shellPathFacts} from "./shell-operation.mjs";

// A real git-commit invocation: start of input or after a separator, optional
// leading VAR=value assignments, optional -C/-c/--git-dir/--work-tree options,
// then the commit subcommand. A mere "git commit" substring (an echo, a script
// body) does not trip it.
export const GIT_COMMIT =
  /(?:^|[\n;&|]\s*)(?:[A-Za-z_]\w*=\S*\s+)*git(?:\s+-C\s+\S+|\s+-c\s+\S+|\s+--git-dir=\S+|\s+--work-tree=\S+)*\s+commit\b/;

export function isGitCommit(cmd) {
  return gitOperations(String(cmd)).some(op => op.subcommand === 'commit');
}

// A quoted message flag span: -m / --message in any of their spellings,
// including combined short flags (-am 'msg') and the = form (--message="msg").
const MESSAGE_FLAG = /(?:^|\s)(?:--message=?|-[a-zA-Z]*m)\s*(['"])([^]*?)\1/g;

// The full commit message of a commit command: every -m/--message part (git
// joins them as paragraphs), or the -F/--file body, or the whole command when
// the message arrives some other way (heredoc, editor). Scanning the whole
// command on fallback errs toward catching a claim, never toward missing one.
export function commitMessageOf(cmd, cwd) {
  const messages = [];
  for (const op of gitOperations(String(cmd), cwd)) {
    if (op.subcommand !== 'commit') continue;
    if (op.messages.length) messages.push(...op.messages);
    else if (op.messageFile && op.messageFile !== '-') {
      try { messages.push(readFileSync(resolve(op.cwd, op.messageFile), 'utf8')); }
      catch { messages.push(String(cmd)); }
    } else messages.push(String(cmd));
  }
  return messages.join('\n\n');
}

// The command with its message spans (and the heredoc body of a commit) removed, so text inside
// -m '...' is never mistaken for a flag, a file operand or a verb of the command itself.
// A heredoc fed to git commit (git commit -F - <<'EOF' ... EOF) is a message too; only its opening line stays.
const COMMIT_HEREDOC = /(git\b[^\n]*\bcommit\b[^\n]*<<-?[ \t]*(['"]?)(\w+)\2[^\n]*)\n[^]*?\n[ \t]*\3[ \t]*(?=\n|$)/g;
export function withoutMessage(cmd) {
  return String(cmd).replace(MESSAGE_FLAG, " ").replace(COMMIT_HEREDOC, "$1");
}

// True when the command references the governance hook suite: the hooks dir as
// a path segment ("hooks", "./hooks/x.mjs", ".git/hooks/pre-push") or a hook
// file by its extension anywhere ("/abs/path/hooks/guard.mjs"). A hooks
// directory nested in the source tree ("src/hooks/useAuth.ts") is application
// code, not the suite, and does not match.
const HOOKS_SEGMENT = /(?:^|[\s'"=:;&|])(?:\.[\/\\])?(?:\.git[\/\\])?hooks(?:[\/\\]|(?=['"\s;&|)]|$))/i;
const HOOKS_GOV_FILE = /hooks[\/\\]\S*\.(?:mjs|cjs|ps1|sh|py)\b/i;
export function touchesHookSuite(cmd, j) {
  return shellPathFacts(String(cmd), j.cwd || policyRoot(j), policyRoot(j), j.shell_language).some(f => f.kind === 'hooks' || f.kind === 'authority');
}

// Run a hook body against the parsed stdin JSON. A parse failure exits 0: a
// malformed payload must never brick the workflow (fail open). The body may
// exit itself (block/advise do); otherwise the hook allows.
export function runHook(fn, {enforcement = true} = {}) {
  let raw = '', oversized = false;
  process.stdin.on('data', c => {
    if (Buffer.byteLength(raw) + c.length > 5 * 1024 * 1024) oversized = true;
    else raw += c;
  });
  process.stdin.on('end', () => {
    try {
      if (oversized) throw Error('Input limit');
      const at = process.argv.indexOf('--project');
      const j = normalizeEvent(JSON.parse(raw.replace(/^\uFEFF/, '').trim()), at < 0 ? undefined : process.argv[at + 1]);
      fn(j); process.exitCode = 0;
    } catch {
      process.stderr.write(enforcement ? 'EIDOLON POLICY: invalid event or enforcement state; operation blocked. No payload was logged.\n' : 'EIDOLON ADVISORY: unavailable; no enforcement claim.\n');
      process.exitCode = enforcement ? 2 : 0;
    }
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

// EIDOLON_HOOK_DEBUG=1 appends the key names of each hook input (never the values), so a live run can show
// whether a field such as agent_type reaches a worker's PreToolUse.
function recordKeys(j) {
  if (process.env.EIDOLON_HOOK_DEBUG !== "1") return;
  try {
    const dir = join(policyRoot(j), ".claude");
    mkdirSync(dir, { recursive: true });
    const keys = Object.keys(j).filter((k) => !/^eidolon_|^original_tool_name$|^shell_language$/.test(k));
    appendFileSync(join(dir, ".hook-debug.jsonl"), JSON.stringify({ ts: new Date().toISOString(), keys }) + "\n");
  } catch { /* a debug seam never fails a hook */ }
}

// Run an ordered suite of pure evaluators against one stdin payload: the
// dispatcher shape, one spawn for a whole matcher instead of one per guard.
// Precedence: the first block halts the call immediately (wiring order is
// preserved, so consolidation never changes which guard speaks first); next an
// ask escalates to the human, its reason carrying every ask that fired; only
// when nothing blocks or asks do the advisories ride along together.
export function runSuite(evaluators) {
  runHook((j) => {
    recordKeys(j);
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
