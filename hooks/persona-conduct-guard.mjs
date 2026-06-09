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
    const m = firstMatch(/core\.hooksPath\s*=|chmod\s+[0-7+rwx-]+\s+\S*hooks\b|\b(mv|rm)\b\s+\S*hooks\//i, ti.command || "");
    return m ? m.text : null;
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
//   { kind: "no-anchor" }                       -> block: seat has teeth but no anchor
//   { kind: "anti-behavior", behavior, hit }    -> block: action crosses a declared anti-behavior
// The guard only acts when a persona with teeth is seated (declared anti-behaviors). At
// that point the anchor gate runs FIRST: an ungrounded persona does not get to act at
// all, regardless of the specific action (no anchor, no seat).
export function evaluateSeat(seat, toolName, toolInput) {
  const ab = (seat && seat.anti_behaviors) || {};
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

// Hook entry (only when this module is the entry point, never when imported by a test).
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("persona-conduct-guard.mjs");
if (invokedDirectly) {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    let j;
    try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()); }
    catch { process.exit(0); }

    const cwd = String(j.cwd || process.cwd());
    const seatFile = join(cwd, ".claude", "active-persona.json");
    if (!existsSync(seatFile)) process.exit(0); // no persona seated, nothing to enforce

    let seat;
    try { seat = JSON.parse(readFileSync(seatFile, "utf8")); } catch { process.exit(0); }

    const name = String(j.tool_name || "");
    const ti = (j && j.tool_input) || {};
    const who = (seat.title || seat.persona || "the seated persona") + " (" + (seat.persona || "?") + ")";

    const verdict = evaluateSeat(seat, name, ti);
    if (!verdict) process.exit(0);

    if (verdict.kind === "no-anchor") {
      process.stderr.write(
        "PERSONA CONDUCT GUARD [BLOCKED - fix and retry]: the seated persona " + who +
        " declares anti-behaviors but names no framework anchor.\n" +
        "The anti-synthetic rail is 'no anchor, no seat': a persona that enforces conduct must name the framework(s) it answers to.\n" +
        "Add a non-empty \"anchors\" list to .claude/active-persona.json (seat from a persona that passes scripts/persona-lint.mjs), or unseat the persona before acting.\n"
      );
      process.exit(2);
    }

    const hit = verdict.hit;
    const where = typeof hit === "object" ? hit.where : "the command";
    const text = typeof hit === "object" ? hit.text : hit;
    process.stderr.write(
      "PERSONA CONDUCT GUARD [BLOCKED - fix and retry]: the seated persona " + who +
      " forbids '" + verdict.behavior + "'.\n" +
      "This action crosses it at " + where + ":\n    " + text + "\n" +
      "The persona declared this anti-behavior; honor it or unseat the persona before acting.\n"
    );
    process.exit(2);
  });
}
