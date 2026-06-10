// hooks/advisor-guard.test.mjs
// Subagents are forbidden from calling advisor tools; the main session is untouched.
// The pure evaluator is tested directly, in the suite's idiom.

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAdvisor } from "./advisor-guard.mjs";

test("a subagent calling an advisor tool is blocked, under any advisor-shaped name", () => {
  assert.equal(evaluateAdvisor("advisor", { isSubagent: true }).kind, "subagent-advisor");
  assert.equal(evaluateAdvisor("mcp__tools__advisor", { isSubagent: true }).kind, "subagent-advisor");
  assert.equal(evaluateAdvisor("Advisor", { isSubagent: true }).kind, "subagent-advisor");
});

test("the main session is allowed through untouched (the ban is subagent-scoped)", () => {
  assert.equal(evaluateAdvisor("advisor", { isSubagent: false }), null);
  assert.equal(evaluateAdvisor("advisor", {}), null);
  assert.equal(evaluateAdvisor("advisor"), null);
});

test("a subagent calling a non-advisor tool is not this guard's business", () => {
  assert.equal(evaluateAdvisor("Bash", { isSubagent: true }), null);
  assert.equal(evaluateAdvisor("Write", { isSubagent: true }), null);
  assert.equal(evaluateAdvisor("", { isSubagent: true }), null);
  assert.equal(evaluateAdvisor(undefined, { isSubagent: true }), null);
});
