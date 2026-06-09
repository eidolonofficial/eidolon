// hooks/persona-conduct-guard.mjs
//
// Eidolon hook suite - PreToolUse(Bash, Write, Edit). Checks a seated persona's
// action against its own declared anti-behaviors (design spec sections 11, 19).
// On a match it halts and names the persona and the line it crossed.
//
// Mechanism: when Eidolon seats a persona for a task it writes the persona's
// anti-behaviors to .claude/active-persona.json in the project. This guard reads
// that file and checks the proposed action against the DETECTABLE subset of the
// persona's forbidden behaviors. Process-level anti-behaviors that no single tool
// call reveals (skip-test-first, over-engineer, leave-failing-build) are caught by
// the engineering swarm's closeout gate and the cold-context verifier, not here;
// this guard never pretends to catch what one action cannot show.
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
  const ab = (seat && seat.anti_behaviors) || {};
  const declared = [...(ab.floor || []), ...(ab.specific || [])];
  if (declared.length === 0) process.exit(0);

  const name = String(j.tool_name || "");
  const ti = (j && j.tool_input) || {};
  const who = (seat.title || seat.persona || "the seated persona") + " (" + (seat.persona || "?") + ")";

  for (const behavior of declared) {
    const detect = DETECTORS[behavior];
    if (!detect) continue; // not machine-detectable from one action; caught downstream
    const hit = detect(name, ti);
    if (!hit) continue;
    const where = typeof hit === "object" ? hit.where : "the command";
    const text = typeof hit === "object" ? hit.text : hit;
    process.stderr.write(
      "PERSONA CONDUCT GUARD [BLOCKED - fix and retry]: the seated persona " + who +
      " forbids '" + behavior + "'.\n" +
      "This action crosses it at " + where + ":\n    " + text + "\n" +
      "The persona declared this anti-behavior; honor it or unseat the persona before acting.\n"
    );
    process.exit(2);
  }
  process.exit(0);
});
