// hooks/persona-conduct-guard.test.mjs
// Seat-time anti-synthetic rail: a persona seated with teeth (declared anti-behaviors)
// but no framework anchor is the synthetic persona the rail forbids ("no anchor, no
// seat"). These tests pin the seat-boundary gate AND prove the existing anti-behavior
// detection is preserved unchanged.

import { test } from "node:test";
import assert from "node:assert/strict";
import { hasAnchor, evaluateSeat, isExpediterSeat } from "./persona-conduct-guard.mjs";

const anchored = {
  persona: "fullstack-engineer",
  title: "Full-stack engineer",
  anchors: ["TDD", "project coding style"],
  anti_behaviors: { floor: ["irreversible-without-safety-net"], specific: ["ship-stub-as-done"] },
};
const unanchored = { ...anchored, anchors: [] };
const teethless = { persona: "x", title: "X", anchors: [], anti_behaviors: { floor: [], specific: [] } };

test("hasAnchor: true for a non-empty anchors array, false for missing/empty/whitespace", () => {
  assert.equal(hasAnchor(anchored), true);
  assert.equal(hasAnchor({ anchors: [] }), false);
  assert.equal(hasAnchor({ anchors: ["   "] }), false);
  assert.equal(hasAnchor({}), false);
  assert.equal(hasAnchor(null), false);
  assert.equal(hasAnchor({ anchor: "OWASP ASVS v5.0.0" }), true); // tolerate singular string
});

test("hasAnchor counts only non-empty string entries (nested/numeric are not real anchors)", () => {
  assert.equal(hasAnchor({ anchors: [["TDD"]] }), false, "a nested array is not a named anchor");
  assert.equal(hasAnchor({ anchors: [5] }), false, "a number is not a named anchor");
  assert.equal(hasAnchor({ anchors: [{}] }), false, "an object is not a named anchor");
  assert.equal(hasAnchor({ anchors: ["OWASP ASVS", 5] }), true, "a real string entry still counts");
});

test("repairing the seat file is allowed even under an unanchored seat (the recovery path must be reachable)", () => {
  // a normal action under an unanchored seat is still blocked...
  assert.equal(evaluateSeat(unanchored, "Write", { file_path: "src/x.mjs", content: "ok" }).kind, "no-anchor");
  // ...but a Write/Edit to the seat file itself must be allowed, or the documented fix is unreachable
  assert.equal(evaluateSeat(unanchored, "Write", { file_path: "C:/proj/.claude/active-persona.json", content: "{}" }), null);
  assert.equal(evaluateSeat(unanchored, "Edit", { file_path: ".claude/active-persona.json" }), null);
});

test("THE GAP: a seated persona with teeth but no anchor is BLOCKED (no anchor, no seat)", () => {
  const v = evaluateSeat(unanchored, "Bash", { command: "ls" });
  assert.ok(v, "an unanchored persona with teeth must not be allowed to act");
  assert.equal(v.kind, "no-anchor");
});

test("a benign action under a properly anchored persona is allowed", () => {
  assert.equal(evaluateSeat(anchored, "Bash", { command: "ls -la" }), null);
});

test("no-op when no anti-behaviors are declared, even without an anchor (nothing to enforce)", () => {
  assert.equal(evaluateSeat(teethless, "Bash", { command: "ls" }), null);
});

test("preserved: an anchored persona still blocks its detectable anti-behavior (rm -rf)", () => {
  const v = evaluateSeat(anchored, "Bash", { command: "rm -rf build" });
  assert.ok(v);
  assert.equal(v.kind, "anti-behavior");
  assert.equal(v.behavior, "irreversible-without-safety-net");
});

test("preserved: an anchored persona blocks a shipped stub in a code file", () => {
  const v = evaluateSeat(anchored, "Write", { file_path: "x.mjs", content: "function f(){ throw new Error('not implemented yet'); }" });
  assert.ok(v);
  assert.equal(v.kind, "anti-behavior");
  assert.equal(v.behavior, "ship-stub-as-done");
});

test("the anchor gate precedes anti-behavior detection: unanchored + rm -rf reports no-anchor first", () => {
  const v = evaluateSeat(unanchored, "Bash", { command: "rm -rf /" });
  assert.equal(v.kind, "no-anchor", "an ungrounded persona should not act at all, regardless of the specific action");
});

// --- The Expediter lock: the controller's persona is never a subagent's seat ---

const expediterSeat = {
  persona: "expediter",
  title: "The Expediter",
  anchors: ["DMAIC"],
  anti_behaviors: { floor: ["irreversible-without-safety-net"], specific: [] },
};
const bareExpediterSeat = { persona: "the-expediter", title: "", anchors: [], anti_behaviors: { floor: [], specific: [] } };

test("isExpediterSeat recognizes the persona under its plain spellings, and nothing else", () => {
  assert.equal(isExpediterSeat({ persona: "expediter" }), true);
  assert.equal(isExpediterSeat({ persona: "the-expediter" }), true);
  assert.equal(isExpediterSeat({ persona: "x", title: "The Expediter (orchestration)" }), true);
  assert.equal(isExpediterSeat({ persona: "backend-data-engineer" }), false);
  assert.equal(isExpediterSeat(null), false);
});

test("THE LOCK: a subagent seated as the Expediter is hard-stopped on ANY action", () => {
  const v = evaluateSeat(expediterSeat, "Bash", { command: "ls" }, { isSubagent: true });
  assert.ok(v, "a subagent must never act under the Expediter seat");
  assert.equal(v.kind, "subagent-expediter");
});

test("the lock does not require teeth: a bare Expediter seat in a subagent is still blocked", () => {
  const v = evaluateSeat(bareExpediterSeat, "Bash", { command: "ls" }, { isSubagent: true });
  assert.ok(v, "the lock is identity-based, not teeth-based");
  assert.equal(v.kind, "subagent-expediter");
});

test("the lock precedes the seat-repair carve-out: a subagent cannot keep the seat by editing the seat file", () => {
  const v = evaluateSeat(expediterSeat, "Write", { file_path: ".claude/active-persona.json", content: "{}" }, { isSubagent: true });
  assert.ok(v, "seat repair must not be an escape hatch for the lock");
  assert.equal(v.kind, "subagent-expediter");
});

test("the main session keeps full Expediter use: no ctx or isSubagent:false changes nothing", () => {
  assert.equal(evaluateSeat(expediterSeat, "Bash", { command: "ls" }), null);
  assert.equal(evaluateSeat(expediterSeat, "Bash", { command: "ls" }, { isSubagent: false }), null);
});

test("a subagent under any non-Expediter persona is judged by the ordinary rules only", () => {
  assert.equal(evaluateSeat(anchored, "Bash", { command: "ls" }, { isSubagent: true }), null);
  const v = evaluateSeat(anchored, "Bash", { command: "rm -rf build" }, { isSubagent: true });
  assert.equal(v.kind, "anti-behavior", "the lock must not weaken existing enforcement for other personas");
});
