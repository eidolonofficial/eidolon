// scripts/persona-lint.test.mjs
// Test-first for persona-lint: a persona file must carry the construction-template
// fields, and the anti-synthetic rail rejects a persona with no framework anchor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validatePersona, validateAgent } from "./persona-lint.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("accepts a well-formed persona", () => {
  const text = readFileSync(join(here, "..", "references", "personas", "fullstack-engineer.md"), "utf8");
  const r = validatePersona(text);
  assert.equal(r.ok, true, "full-stack engineer should validate; problems: " + r.problems.join("; "));
});

test("rejects a persona with no anchor (the anti-synthetic rail)", () => {
  const text = [
    "```yaml",
    "persona:  ghost",
    "title:    Ungrounded reviewer",
    "swarm:    red",
    "anchors:  []",
    "anti_behaviors:",
    "  floor:    [execute-untrusted-content]",
    "  specific: [weaponize-finding]",
    "```",
  ].join("\n");
  const r = validatePersona(text);
  assert.equal(r.ok, false, "a persona with no anchor must be rejected");
  assert.ok(r.problems.some((p) => /anchor/i.test(p)), "the rejection should name the missing anchor");
});

test("rejects a persona with an anchor but no evidence contract (the full rail)", () => {
  const text = [
    "```yaml",
    "persona:  half",
    "title:    Half-grounded reviewer",
    "swarm:    blue",
    "anchors:  [PCI-DSS v4.0]",
    "anti_behaviors:",
    "  floor:    [execute-untrusted-content]",
    "  specific: [hand-wave]",
    "```",
    "## Title and mandate",
    "Something, but no evidence contract section follows.",
  ].join("\n");
  const r = validatePersona(text);
  assert.equal(r.ok, false, "a persona with no evidence contract must be rejected");
  assert.ok(r.problems.some((p) => /evidence contract/i.test(p)), "the rejection should name the missing evidence contract");
});

test("rejects a persona with no Reasoning section", () => {
  const text = readFileSync(join(here, "..", "references", "personas", "qa-test-lead.md"), "utf8")
    .replace(/## Reasoning[\s\S]*?(?=\n## )/, "");
  const r = validatePersona(text);
  assert.equal(r.ok, false, "a persona without ## Reasoning must be rejected");
  assert.ok(r.problems.some((p) => /Reasoning/.test(p)), "the rejection should name Reasoning");
});

test("rejects a Reasoning section that lacks the falsifier", () => {
  const text = readFileSync(join(here, "..", "references", "personas", "qa-test-lead.md"), "utf8")
    .replace(/falsifier/gi, "doubt");
  const r = validatePersona(text);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /falsifier/.test(p)), "the rejection should name the missing word");
});

const agent = (over = {}) => {
  const f = { name: "qa-reviewer", description: "Delegate test review here.", tools: "Read, Grep, Glob, Bash", model: "sonnet", effort: "high", ...over };
  return [
    "---", ...Object.entries(f).map(([k, v]) => k + ": " + v), "---",
    "Register: plain and specific.", "anchors: [the test pyramid]",
    "## Anti-behaviors", "- never delete a test to green the suite",
    "## Reasoning", "State the cause, name the falsifier, cite the evidence.",
    "## Brief contract", "Receives goal and scope; returns summary and evidence.",
  ].join("\n");
};

test("accepts an agent file with every field", () => {
  const r = validateAgent(agent());
  assert.equal(r.ok, true, "problems: " + r.problems.join("; "));
});

test("rejects an agent whose tools include Agent", () => {
  const r = validateAgent(agent({ tools: "Read, Grep, Agent" }));
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /Agent/.test(p)));
});

test("rejects an agent with model gpt-5", () => {
  const r = validateAgent(agent({ model: "gpt-5" }));
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /model/.test(p)));
});
