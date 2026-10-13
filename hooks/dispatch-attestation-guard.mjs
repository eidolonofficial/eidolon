// hooks/dispatch-attestation-guard.mjs
//
// Eidolon hook suite - PreToolUse(the dispatch tool, e.g. Task). The consent-tier
// gate on dispatching destructive or sensitive work: when the controller dispatches
// work that carries a destructive or sensitive signal, the dispatch ASKS the human
// (it does not hard-block), citing references/security-policy.md. The deterministic
// guardrails still do the real work; this gate asks, it never walls. The keyword
// detection is adapted from slartz/agent-security-awareness-training (MIT, see
// CREDITS.md).
//
// Decision order (fails OPEN toward allow on anything that is not a sensitive dispatch):
//   - not the dispatch tool                    -> allow (null)
//   - dispatch, but not destructive/sensitive  -> allow (null)
//   - destructive/sensitive                    -> ask (the consent tier)
//
// This stands alone on its own matcher (the dispatch tool), never on
// guard-bash/guard-write (those match Bash/Write/Edit).
import { runHook, emitVerdict } from "./lib.mjs";

// The harness's subagent-dispatch tool. Exact "Task" (the Claude Code tool name) plus a
// couple of generic spellings, so a renamed dispatch tool still gates. Anything else is not
// a dispatch and passes untouched.
export function isDispatchTool(name) {
  const n = String(name || "");
  return /^task$/i.test(n) || /dispatch|subagent/i.test(n);
}

// Does this dispatch carry a destructive or sensitive signal? Reads the description, prompt,
// and subagent_type the controller hands the worker. Conservative: only fires on a named
// signal, so a routine dispatch is never gated.
const SENSITIVE = new RegExp(
  [
    "security[ -]?swarm", "trust[ -]?safety", "red[ -]?team", "blue[ -]?team",
    "deploy", "release", "ship\\b", "publish", "rollout", "production", "\\bprod\\b",
    "migrat", "\\bpii\\b", "personal data", "payment", "cardholder", "pci\\b",
    "credential", "secret", "\\btoken\\b", "\\bkey(s)?\\b", "\\.env\\b",
    "destructive", "rm\\s+-rf", "drop\\s+(table|database)", "truncate", "\\bdelete\\b",
    "\\bwipe\\b", "\\bdestroy\\b", "irreversible", "force[ -]?push",
  ].join("|"),
  "i",
);
export function isSensitiveDispatch(toolInput = {}) {
  const hay = [toolInput.description, toolInput.prompt, toolInput.subagent_type, toolInput.task]
    .filter((x) => typeof x === "string").join("\n");
  return SENSITIVE.test(hay);
}

// Pure evaluator the suite/test calls. Returns a verdict | null.
export function evalDispatchAttestation(j = {}) {
  if (!isDispatchTool(j.tool_name)) return null;
  if (!isSensitiveDispatch(j.tool_input || {})) return null;
  return {
    kind: "ask",
    label: "SENSITIVE DISPATCH GATE",
    why:
      "this dispatch looks destructive or sensitive (deploy/prod, migration, PII/payments, " +
      "credentials, or a destructive verb). Review it against references/security-policy.md " +
      "and confirm you intend to dispatch this work now. This gate asks, it never blocks; " +
      "the deterministic guards still do the real work.",
  };
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("dispatch-attestation-guard.mjs");
if (invokedDirectly) {
  runHook((j) => emitVerdict(evalDispatchAttestation(j)));
}
