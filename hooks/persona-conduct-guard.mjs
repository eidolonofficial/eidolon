// hooks/persona-conduct-guard.mjs
//
// Eidolon hook suite - PreToolUse(Bash, Write, Edit). Checks a seated persona's
// action against its own declared anti-behaviors (design spec sections 11, 19), and
// enforces the anti-synthetic rail at the seat boundary: a persona seated with teeth
// (declared anti-behaviors) but no framework anchor is the synthetic persona the rail
// forbids, so it does not get to act ("no anchor, no seat"). On a match it halts and
// names the persona and the line it crossed.
//
// Mechanism: when Eidolon seats a persona for a task it writes the persona's anchors
// and anti-behaviors to .claude/active-persona.json in the project. This guard reads
// that file, gates on the anchor, then checks the proposed action against the
// DETECTABLE subset of the persona's forbidden behaviors. Process-level anti-behaviors
// that no single tool call reveals (skip-test-first, over-engineer, leave-failing-build)
// are caught by the engineering swarm's closeout gate and the cold-context verifier,
// not here; this guard never pretends to catch what one action cannot show.
//
// The anchor gate closes the seat-boundary hole: the rail was enforced on persona
// definition files (scripts/persona-lint.mjs) and at expert-hire time, but never at the
// moment of seating. Without this gate a persona could be seated with anti-behaviors
// and no anchor, and its teeth would be enforced while it was never grounded.
//
// I/O contract mirrors the lineage uncertainty-guard.mjs: fail open on bad input;
// block via stderr + exit 2.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {confinedPath} from './codex-patch.mjs';
import {actorIdentity, actorPath, policyRoot, boundedRead} from "./operation.mjs";
import { runHook, touchesHookSuite, emitVerdict } from "./lib.mjs";

const CODE = /\.(mjs|cjs|js|jsx|ts|tsx|py|go|rs|java|rb|php|c|cc|cpp|h|hpp|cs|kt|swift)$/i;

// returns { text, index } of the first match, or null
function firstMatch(re, s) { const m = String(s).match(re); return m ? { text: m[0], index: m.index } : null; }

// Each detectable anti-behavior: a test that returns the offending text/where, or null.
const DETECTORS = {
  "irreversible-without-safety-net": (name, ti) => {
    if (name !== "Bash") return null;
    const m = firstMatch(/\brm\s+-rf\b|\bDROP\s+TABLE\b|\bTRUNCATE\s+TABLE\b|\bdel\s+\/[fsq]/i, ti.command || "");
    if (m) return m.text;
    if (/git\s+push\b/.test(ti.command || "") && /--force\b/.test(ti.command || "") && !/--force-with-lease\b/.test(ti.command || "")) return "git push --force";
    return null;
  },
  "disable-or-route-around-hook": (name, ti) => {
    if (name !== "Bash") return null;
    const cmd = String(ti.command || "");
    const m = firstMatch(/core\.hooksPath\s*=|git\s+config\b[^|;&\n]*hooksPath/i, cmd);
    if (m) return m.text;
    // flags between the verb and the path must not hide the target (rm -rf hooks)
    if (/\b(chmod|mv|rm|rmdir|del|Remove-Item)\b/i.test(cmd) && touchesHookSuite(cmd)) {
      const verb = firstMatch(/\b(chmod|mv|rm|rmdir|del|Remove-Item)\b/i, cmd);
      return verb.text + " on the hook suite";
    }
    return null;
  },
  "rewrite-history-to-dodge-gate": (name, ti) => {
    if (name !== "Bash") return null;
    const m = firstMatch(/git\s+(filter-branch|filter-repo)\b/i, ti.command || "");
    if (m) return m.text;
    if (/git\s+push\b/.test(ti.command || "") && /--force\b/.test(ti.command || "") && !/--force-with-lease\b/.test(ti.command || "")) return "git push --force";
    return null;
  },
  "ship-stub-as-done": (name, ti) => {
    if (name !== "Write" && name !== "Edit") return null;
    const path = String(ti.file_path || ti.path || "");
    if (!CODE.test(path)) return null; // a stub in prose is not a shipped stub
    const body = String(ti.content != null ? ti.content : ti.new_string != null ? ti.new_string : "");
    const m = firstMatch(/NotImplementedError|TODO:?\s*implement\b|throw\s+new\s+Error\(\s*['"][^'"]*not\s+implemented|\bnot\s+implemented\s+yet\b/i, body);
    if (!m) return null;
    const line = body.slice(0, m.index).split("\n").length;
    return { text: m.text, where: path + ":" + line };
  },
};

// The seat carries the persona's framework anchor(s). True when at least one non-empty
// anchor is present. Tolerates the canonical `anchors` array and a singular `anchor`
// string, so a hand-written seat that uses either form still grounds the persona.
export function hasAnchor(seat) {
  if (!seat) return false;
  const a = seat.anchors;
  // an anchor is a named framework: a non-empty STRING. A nested array or a number in
  // the anchors list is not an anchor, so it does not count (the safe, stricter direction).
  if (Array.isArray(a)) return a.some((x) => typeof x === "string" && x.trim().length > 0);
  if (typeof a === "string") return a.trim().length > 0;
  if (typeof seat.anchor === "string") return seat.anchor.trim().length > 0;
  return false;
}

// The Expediter is the CONTROLLER'S persona: the orchestrating session that defines
// done-criteria, measures before dispatch, and holds sole authority over hooks and
// loops. It is locked to the main session by design. A dispatched subagent that seats
// or claims the Expediter has stepped outside its mandate (a worker conducting the
// orchestra), so the guard hard-stops the action without changing another actor's seat.
// True when the seated persona identifies as the Expediter under any plain spelling.
export function isExpediterSeat(seat) {
  if (!seat) return false;
  const id = String(seat.persona || "").toLowerCase();
  const title = String(seat.title || "").toLowerCase();
  return /^(the[-_ ])?expediter$/.test(id) || /\bexpediter\b/.test(title);
}

// a Write/Edit that targets the seat file itself is always allowed: it is how an
// operator repairs an unanchored seat (adds an anchor) or unseats. Without this, the
// no-anchor gate would block the very recovery the block message documents.
const SEAT_PATH = /(^|[\\/])\.claude[\\/]active-persona\.json$/;
function isSeatRepair(toolName, toolInput) {
  if (toolName !== "Write" && toolName !== "Edit") return false;
  const tgt = String((toolInput && (toolInput.file_path || toolInput.path)) || "");
  return SEAT_PATH.test(tgt);
}

// Decide what to do for a seated persona and a proposed action.
//   null              -> allow (exit 0)
//   { kind: "subagent-expediter" }              -> block: a subagent is seated as the Expediter (controller-only persona)
//   { kind: "no-anchor" }                       -> block: seat has teeth but no anchor
//   { kind: "anti-behavior", behavior, hit }    -> block: action crosses a declared anti-behavior
// The Expediter lock runs FIRST and unconditionally: it does not require declared
// anti-behaviors (a bare expediter seat is still a violation in a subagent), and it is
// deliberately checked BEFORE the seat-repair carve-out, so a subagent cannot use the
// repair allowance to keep operating under the seat it is forbidden to hold.
// After that, the guard acts only when a persona with teeth is seated. The anchor gate
// runs before the detectors: an ungrounded persona does not get to act at all,
// regardless of the specific action (no anchor, no seat).
export function evaluateSeat(seat, toolName, toolInput, ctx = {}) {
  if (ctx.isSubagent && isExpediterSeat(seat)) return { kind: "subagent-expediter" };
  const ab = (seat && seat.anti_behaviors) || {};
  if (!seat || Array.isArray(seat) || typeof seat !== 'object' ||
      !ab || Array.isArray(ab) || typeof ab !== 'object' ||
      [ab.floor, ab.specific].some(a => a != null && (!Array.isArray(a) || a.some(v => typeof v !== 'string')))) return {kind:'invalid-state'};
  const declared = [...(ab.floor || []), ...(ab.specific || [])];
  if (declared.length === 0) return null; // no persona teeth seated, nothing to enforce
  if (isSeatRepair(toolName, toolInput)) return null; // always allow repair/unseat of the seat file
  if (!hasAnchor(seat)) return { kind: "no-anchor" };
  for (const behavior of declared) {
    const detect = DETECTORS[behavior];
    if (!detect) continue; // not machine-detectable from one action; caught downstream
    const hit = detect(toolName, toolInput);
    if (!hit) continue;
    return { kind: "anti-behavior", behavior, hit };
  }
  return null;
}

// The full hook flow as one evaluator: read the actor-scoped seat, or read-only legacy default, and judge the action.
// Preflight never clears another actor's state. Returns a suite verdict
// ({ kind, label, why, tag? }) or null, so the dispatchers (hooks/guard-bash.mjs,
// hooks/guard-write.mjs) and the standalone entry share one behavior.
export function evalPersonaConduct(j) {
  const cwd = policyRoot(j), identity = actorIdentity(j);
  if(identity.worker && isSeatRepair(j.tool_name,j.tool_input||{}))return {kind:'block',label:'PERSONA CONDUCT GUARD',why:'A worker cannot edit or clear the shared controller seat. Return the repair to the controller; no state was changed.'};
  const scoped = actorPath(j, 'persona.json');
  const seatFile = existsSync(scoped) ? scoped : confinedPath(cwd,cwd,'.claude/active-persona.json');
  if (!existsSync(seatFile)) return null;
  let seat;
  try { seat = JSON.parse(boundedRead(seatFile, 65536).toString('utf8')); }
  catch { return {kind:'block', label:'PERSONA CONDUCT GUARD', why:'Persona state is unreadable or invalid; retain it for operator recovery. No state was changed.'}; }
  if (!seat || Array.isArray(seat) || typeof seat !== 'object') return {kind:'block',label:'PERSONA CONDUCT GUARD',why:'Invalid persona state; no state was changed.'};
  const name = String(j.tool_name || "");
  const ti = (j && j.tool_input) || {};
  const who = (seat.title || seat.persona || "the seated persona") + " (" + (seat.persona || "?") + ")";

  // Subagent detection: the harness writes dispatched agents' transcripts under a
  // "subagents" directory; the main session's transcript never lives there. Absent
  // or unrecognized transcript_path fails open (treated as the main session) so a
  // harness that omits the field never bricks normal work.
  const isSubagent = identity.worker;

  const verdict = evaluateSeat(seat, name, ti, { isSubagent });
  if (!verdict) return null;

  if (verdict.kind === 'invalid-state') return {kind:'block',label:'PERSONA CONDUCT GUARD',why:'Persona anti-behavior schema is invalid; operation blocked. No state was changed.'};
  if (verdict.kind === 'subagent-expediter') {
    return {kind:'block',label:'PERSONA CONDUCT GUARD',tag:'HARD STOP - controller state retained',why:
      'A dispatched worker cannot act as the controller Expediter. The shared controller seat was retained unchanged. Use a separately scoped, grounded worker persona through the reviewed dispatch pipeline.'};
  }

  if (verdict.kind === "no-anchor") {
    return { kind: "block", label: "PERSONA CONDUCT GUARD", why:
      "the seated persona " + who +
      " declares anti-behaviors but names no framework anchor.\n" +
      "The anti-synthetic rail is 'no anchor, no seat': a persona that enforces conduct must name the framework(s) it answers to.\n" +
      "Add a non-empty \"anchors\" list to .claude/active-persona.json (seat from a persona that passes scripts/persona-lint.mjs), or unseat the persona before acting." };
  }

  const hit = verdict.hit;
  const where = typeof hit === "object" ? hit.where : "the command";
  const text = typeof hit === "object" ? hit.text : hit;

  // The consent tier: 'irreversible-without-safety-net' asks instead of blocking,
  // because the declared anti-behavior is conditional (never WITHOUT the safety
  // nets) and the operator may genuinely hold them - an independent backup, a
  // rollback path, a post-op verify - where no guard can see. The human's yes is
  // the attestation. Hook tampering, history surgery, and shipped stubs are
  // unconditional lines, so they stay hard blocks.
  if (verdict.behavior === "irreversible-without-safety-net") {
    return { kind: "ask", label: "PERSONA CONDUCT GUARD", why:
      "the seated persona " + who +
      " forbids '" + verdict.behavior + "'. This action crosses it at " + where + ": " + text + ". " +
      "Approve only if the two-safety-net pattern holds: an independent backup, a rollback " +
      "path stated before it runs, and a post-op verify. Otherwise honor the persona's line " +
      "or stop and ask the operator to review this scope." };
  }

  return { kind: "block", label: "PERSONA CONDUCT GUARD", why:
    "the seated persona " + who +
    " forbids '" + verdict.behavior + "'.\n" +
    "This action crosses it at " + where + ":\n    " + text + "\n" +
    "The persona declared this anti-behavior; honor it or return the disputed rule for operator review." };
}

// Hook entry (only when this module is the entry point, never when imported by a test).
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("persona-conduct-guard.mjs");
if (invokedDirectly) runHook((j) => emitVerdict(evalPersonaConduct(j)));
