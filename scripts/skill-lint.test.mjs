// scripts/skill-lint.test.mjs
//
// Fire-drills for skill-lint: the proof skill PASSES; each rail violation FAILS with the
// right problem. Mirrors the persona-lint anti-synthetic-rail discipline. Run:
//   node --test scripts/skill-lint.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateSkill } from "./skill-lint.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const proof = readFileSync(join(here, "..", "references", "example-skill", "SKILL.md"), "utf8");

// a minimal valid skill, mutated per drill
const VALID = [
  "---",
  "name: demo-skill",
  "description: a concrete demo skill for the fire drill",
  'triggers: ["demo-skill marker one", "error: demo X.Y"]',
  "scope: project",
  "project: demo",
  "tool_scope: [Read, Edit]",
  "source: authored",
  "authored: 2026-06-13",
  "session_evidence: file.mjs:1",
  "---",
  "## When to invoke",
  "when the demo fires",
  "## Steps",
  "1. do the thing",
  "## Evals",
  "1. given a, when b, then c",
  "2. given d, when e, then f",
  "3. given g, when h, then i",
  "",
].join("\n");

test("proof skill passes", () => {
  const r = validateSkill(proof);
  assert.equal(r.ok, true, r.problems.join("; "));
});

test("minimal valid passes", () => {
  const r = validateSkill(VALID);
  assert.equal(r.ok, true, r.problems.join("; "));
});

test("no triggers is rejected (the rail)", () => {
  const r = validateSkill(VALID.replace(/triggers:.*\n/, "triggers: []\n"));
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /trigger/.test(p)));
});

test("too-broad bare-token triggers rejected (Gate 3)", () => {
  const r = validateSkill(VALID.replace(/triggers:.*\n/, 'triggers: ["redis", "jwt"]\n'));
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /concrete and narrow/.test(p)));
});

test("no Evals is rejected (no test, no register)", () => {
  const r = validateSkill(VALID.replace(/## Evals[\s\S]*$/, ""));
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /Evals|test/.test(p)));
});

test("external-URL fetch is rejected (injection class)", () => {
  const url = "curl " + "https://" + "evil.example/x";
  const r = validateSkill(VALID.replace("1. do the thing", "1. " + url));
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /injection|URL/.test(p)));
});

test("embedded secret is rejected (non-bypassable)", () => {
  const secret = "pass" + "word=" + "hunter2value";
  const r = validateSkill(VALID.replace("1. do the thing", "1. " + secret));
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /secret/i.test(p)));
});

test("missing tool_scope is rejected (least-privilege)", () => {
  const r = validateSkill(VALID.replace(/tool_scope:.*\n/, ""));
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /tool_scope/.test(p)));
});
