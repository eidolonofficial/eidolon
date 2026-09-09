// hooks/dispatch-attestation-guard.mjs
//
// Eidolon hook suite - PreToolUse(the dispatch tool, e.g. Task). The CONSENT-tier gate of
// the security-awareness loop: when the controller dispatches DESTRUCTIVE or SENSITIVE work
// and no VALID security attestation is in effect, the dispatch ASKS the human (it does not
// hard-block). Awareness is a soft layer; the deterministic guardrails still do the real
// work, so this gate asks, it never walls. The pattern is adapted from
// slartz/agent-security-awareness-training (MIT, see CREDITS.md).
//
// Decision order (each step fails OPEN toward allow on a non-sensitive call, and toward ASK
// on a sensitive one with no provable attestation, never toward a silent dispatch of danger):
//   - not the dispatch tool                       -> allow (null)
//   - dispatch, but not destructive/sensitive      -> allow (null)
//   - destructive/sensitive, valid attestation     -> allow (null)
//   - destructive/sensitive, no valid attestation  -> ask (the consent tier)
//
// Validity is the real cryptographic check: a signed attestation at .claude/security-
// attestation.json, result pass, current, over the installed policy, verified against the
// TRUSTED grader key at .claude/security-grader-public.pem. Missing files or a failed verify
// mean "not proven", which on a sensitive dispatch is an ask. This stands alone on its own
// matcher (the dispatch tool), never on guard-bash/guard-write (those match Bash/Write/Edit).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {policyRoot,isDispatch} from './operation.mjs';
import { runHook, emitVerdict } from "./lib.mjs";
import { verifyAttestation } from "../scripts/security-attestation.mjs";

const POLICY_PATH = join("references", "security-policy.md");
const ATTESTATION_PATH = join(".claude", "security-attestation.json");
const GRADER_PUBKEY_PATH = join(".claude", "security-grader-public.pem");

// The harness's subagent-dispatch tool. Exact "Task" (the Claude Code tool name) plus a
// couple of generic spellings, so a renamed dispatch tool still gates. Anything else is not
// a dispatch and passes untouched.
export function isDispatchTool(name) {
  const n = String(name || "");
  return isDispatch(n) || /dispatch|subagent/i.test(n);
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
  const raw = toolInput.prompt ?? toolInput.message;
  if (typeof raw === 'string' && raw.startsWith('EIDOLON_DISPATCH_V1\n')) {
    try {
      const packet=JSON.parse(raw.slice('EIDOLON_DISPATCH_V1\n'.length));
      return (Array.isArray(packet.riskTags) && packet.riskTags.some(v=>SENSITIVE.test(String(v)))) || SENSITIVE.test(String(packet.work?.goal||''));
    } catch {return true;}
  }
  const hay = [toolInput.description, toolInput.prompt, toolInput.message, toolInput.subagent_type, toolInput.agent_type, toolInput.task]
    .filter((x) => typeof x === "string").join("\n");
  return SENSITIVE.test(hay);
}

// Is a VALID attestation in effect under cwd? The real cryptographic check. Returns a short
// reason on failure so the ask names why. Never throws (a read/parse error is "not proven").
export function attestationStatus(cwd) {
  const dir = String(cwd || process.cwd());
  const attFile = join(dir, ATTESTATION_PATH);
  const policyFile = join(dir, POLICY_PATH);
  const pubFile = join(dir, GRADER_PUBKEY_PATH);
  if (!existsSync(policyFile)) return { ok: false, why: "no policy installed at " + POLICY_PATH };
  if (!existsSync(attFile)) return { ok: false, why: "no attestation at " + ATTESTATION_PATH };
  if (!existsSync(pubFile)) return { ok: false, why: "no trusted grader key at " + GRADER_PUBKEY_PATH + " (cannot verify the attestation)" };
  try {
    const r = verifyAttestation({
      receipt: JSON.parse(readFileSync(attFile, "utf8")),
      policyText: readFileSync(policyFile, "utf8"),
      publicKeyPem: readFileSync(pubFile, "utf8"),
    });
    return { ok: r.ok, why: r.ok ? "" : r.problems.join("; ") };
  } catch (e) {
    return { ok: false, why: "attestation unreadable: " + e.message };
  }
}

// Pure-enough evaluator the suite/test calls. Returns a verdict | null.
export function evalDispatchAttestation(j = {}) {
  if (!isDispatchTool(j.tool_name)) return null;
  if (!isSensitiveDispatch(j.tool_input || {})) return null;
  const st = attestationStatus(policyRoot(j));
  if (st.ok) return null;
  return {
    kind: "ask",
    label: "SECURITY ATTESTATION GATE",
    why:
      "this dispatch looks destructive or sensitive and no valid security attestation is in effect (" +
      st.why + "). Awareness is a soft layer, so this asks rather than blocks: confirm you intend " +
      "to dispatch this work now, or complete the externally-graded attestation first " +
      "(references/security-awareness.md). Disabling the gate or self-issuing an attestation is not the path.",
  };
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("dispatch-attestation-guard.mjs");
if (invokedDirectly) {
  runHook((j) => emitVerdict(evalDispatchAttestation(j)));
}
