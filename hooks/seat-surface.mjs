// hooks/seat-surface.mjs
//
// SessionStart (ALL sources) -- surfaces the seated persona IN CONTEXT from message 1.
// The persona-conduct-guard ENFORCES the seated persona's anti-behaviors (teeth); this
// SURFACES the persona (identity + anchors + the enforced lines) so a fresh or continued
// session operates AS the persona, instead of merely being blocked when it strays. Without
// a surface, the seat is enforced but invisible -- the agent never sees "you are seated as X"
// and can drift into unseated, un-oriented work.
//
// Reads .claude/active-persona.json (the Stage-10 seat). Additive, never blocks, never
// crashes a session start (sibling of session-restore / process-doctrine). Generic: it
// reads the seat written by Stage 10 and any orchestration marker; no repo specifics.
import { readFileSync } from "node:fs";
import { join } from "node:path";

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let j = {};
  try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim() || "{}"); } catch {}
  const source = String(j.source || "startup");
  const cwd = String(j.cwd || process.cwd());

  let seat = {};
  try { seat = JSON.parse(readFileSync(join(cwd, ".claude", "active-persona.json"), "utf8")) || {}; }
  catch { process.exit(0); } // no seat -- nothing to surface, never block
  if (!seat.persona && !seat.title) process.exit(0);

  const title = String(seat.title || seat.persona);
  const pid = String(seat.persona || "?");
  const anchors = Array.isArray(seat.anchors) ? seat.anchors : [];
  const ab = seat.anti_behaviors || {};
  const lines = [...(ab.floor || []), ...(ab.specific || [])];
  const orch = seat.orchestration && seat.orchestration.persona;

  const directive =
    "PERSONA SEAT (every-pass surface). You are seated as " + title + " (" + pid + "). " +
    (anchors.length ? "Anchors: " + anchors.join("; ") + ". " : "") +
    (lines.length
      ? "Enforced anti-behaviors (persona-conduct-guard hard-blocks these on every tool call): " + lines.join(", ") + ". "
      : "") +
    "Operate under this persona. " +
    (orch ? "Orchestration layer: " + orch + " (the orchestration seat is in .claude/active-persona.json; see references/conductor-standard.md). " : "") +
    (source === "compact"
      ? "POST-COMPACTION: work is likely in flight -- state the mode and continue the in-flight task; do not re-run setup."
      : "Hold the operator's ask-first gates as stop-and-confirm.");

  process.stdout.write(JSON.stringify({
    systemMessage: "PERSONA SEAT: " + title + " (" + pid + ") surfaced [" + source + "]",
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: directive },
  }));
  process.exit(0);
});
