// hooks/dispatch-attestation-guard.test.mjs
//
// Unit + end-to-end tests for the consent-tier dispatch gate. The pure helpers
// (isDispatchTool, isSensitiveDispatch, evalDispatchAttestation) are exercised directly;
// the hook is also run as Claude Code runs it (a child process, the hook JSON on stdin),
// asserting the ask/allow verdict. Contract: a destructive or sensitive dispatch always
// ASKS, citing references/security-policy.md; everything else passes untouched.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isDispatchTool, isSensitiveDispatch, evalDispatchAttestation,
} from "./dispatch-attestation-guard.mjs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "dispatch-attestation-guard.mjs");

const taskDispatch = (overrides = {}) => ({
  tool_name: "Task",
  tool_input: { description: "run the security swarm against the auth service", prompt: "harden it", ...overrides },
});

function run(payload) {
  return spawnSync(process.execPath, [HOOK], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
  });
}
const asked = (r, label) => {
  assert.equal(r.status, 0, "ask is exit 0; got " + r.status + "\n" + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, new RegExp(label));
};
const silent = (r) => { assert.equal(r.status, 0); assert.equal(r.stdout, ""); };

// --------------------------------------------------------------- pure helpers

test("isDispatchTool: Task and dispatch-shaped names match; ordinary tools do not", () => {
  assert.ok(isDispatchTool("Task"));
  assert.ok(isDispatchTool("task"));
  assert.ok(isDispatchTool("dispatch-agent"));
  assert.ok(isDispatchTool("mcp__acme__subagent_run"));
  assert.ok(!isDispatchTool("Bash"));
  assert.ok(!isDispatchTool("Write"));
  assert.ok(!isDispatchTool(""));
});

test("isSensitiveDispatch: named destructive/sensitive signals fire; routine work does not", () => {
  assert.ok(isSensitiveDispatch({ description: "run the security swarm" }));
  assert.ok(isSensitiveDispatch({ prompt: "deploy the service to production" }));
  assert.ok(isSensitiveDispatch({ prompt: "run a data migration touching PII" }));
  assert.ok(isSensitiveDispatch({ prompt: "rm -rf the cache then rebuild" }));
  assert.ok(isSensitiveDispatch({ prompt: "rotate the API credentials" }));
  assert.ok(isSensitiveDispatch({ subagent_type: "trust-safety" }));
  assert.ok(isSensitiveDispatch({ task: "wipe the staging database" }));
  assert.ok(!isSensitiveDispatch({ description: "tidy the README and fix a typo" }));
  assert.ok(!isSensitiveDispatch({ prompt: "summarize the test failures" }));
  assert.ok(!isSensitiveDispatch({}));
});

test("evalDispatchAttestation: only a sensitive dispatch asks, and the ask names the policy", () => {
  // not a dispatch tool: even a destructive command is not this gate's business
  assert.equal(evalDispatchAttestation({ tool_name: "Bash", tool_input: { command: "rm -rf x" } }), null);
  // dispatch, not sensitive
  assert.equal(evalDispatchAttestation(taskDispatch({ description: "fix a typo", prompt: "" })), null);
  // sensitive dispatch -> ask, citing the policy
  const v = evalDispatchAttestation(taskDispatch());
  assert.equal(v.kind, "ask");
  assert.match(v.label, /SENSITIVE DISPATCH GATE/);
  assert.match(v.why, /references\/security-policy\.md/);
});

// --------------------------------------------------------------- end to end

test("end-to-end: a sensitive Task dispatch asks the human, citing the policy", () => {
  const r = run(taskDispatch());
  asked(r, "SENSITIVE DISPATCH GATE");
  asked(r, "references/security-policy\\.md");
});

test("end-to-end: a routine dispatch and a non-dispatch tool pass; bad input fails open", () => {
  silent(run(taskDispatch({ description: "rename a variable", prompt: "" })));
  silent(run({ tool_name: "Bash", tool_input: { command: "git status" } }));
  silent(run("not json at all"));
});

test("end-to-end: the signal is read from every dispatch field (description, prompt, subagent_type, task)", () => {
  asked(run({ tool_name: "Task", tool_input: { prompt: "deploy to production" } }), "SENSITIVE DISPATCH GATE");
  asked(run({ tool_name: "Task", tool_input: { subagent_type: "red-team" } }), "SENSITIVE DISPATCH GATE");
  asked(run({ tool_name: "Task", tool_input: { task: "drop table users" } }), "SENSITIVE DISPATCH GATE");
});
