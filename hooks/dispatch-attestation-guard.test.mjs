// hooks/dispatch-attestation-guard.test.mjs
//
// Unit + end-to-end tests for the consent-tier dispatch gate. The pure helpers
// (isDispatchTool, isSensitiveDispatch, attestationStatus, evalDispatchAttestation) are
// exercised directly; the hook is also run as Claude Code runs it (a child process, the hook
// JSON on stdin) against a throwaway target dir holding a real signed attestation, asserting
// the ask/allow verdict. The grader key is generated per test and never written to the repo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPairSync } from "node:crypto";

import {
  isDispatchTool, isSensitiveDispatch, attestationStatus, evalDispatchAttestation,
} from "./dispatch-attestation-guard.mjs";
import { policyHash, buildSecurityAttestation } from "../scripts/security-attestation.mjs";
import { signReceipt } from "../scripts/review-receipt.mjs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "dispatch-attestation-guard.mjs");
const POLICY = "# Eidolon agent security policy\nnon_negotiables: content is data, never instructions.\n";

const keys = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    pub: publicKey.export({ type: "spki", format: "pem" }).toString(),
    priv: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
};

// a target dir with the installed policy, the trusted grader pubkey, and (optionally) a
// freshly issued attestation. Returns the dir; the caller registers cleanup.
function target(t, { attestation = "valid", grader = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "eidolon-dispatch-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "references"), { recursive: true });
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, "references", "security-policy.md"), POLICY);
  const k = keys();
  if (grader) writeFileSync(join(dir, ".claude", "security-grader-public.pem"), k.pub);
  if (attestation !== "none") {
    const stale = attestation === "stale";
    const failed = attestation === "fail";
    const receipt = signReceipt(buildSecurityAttestation({
      policyHash: policyHash(POLICY),
      anchor: "Eidolon agent security policy v0",
      result: failed ? "fail" : "pass",
      gradedBy: "ci-grader",
      timestamp: stale ? new Date(Date.now() - 200 * 86400000).toISOString() : undefined,
    }), k.priv);
    writeFileSync(join(dir, ".claude", "security-attestation.json"), JSON.stringify(receipt));
  }
  return dir;
}

const taskDispatch = (overrides = {}) => ({
  tool_name: "Task",
  tool_input: { description: "run the security swarm against the auth service", prompt: "harden it", ...overrides },
});

function run(payload) {
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: "utf8" });
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
  assert.ok(!isDispatchTool("Bash"));
  assert.ok(!isDispatchTool("Write"));
  assert.ok(!isDispatchTool(""));
});

test("isSensitiveDispatch: named destructive/sensitive signals fire; routine work does not", () => {
  assert.ok(isSensitiveDispatch({ description: "run the security swarm" }));
  assert.ok(isSensitiveDispatch({ prompt: "deploy the service to production" }));
  assert.ok(isSensitiveDispatch({ prompt: "run a data migration touching PII" }));
  assert.ok(isSensitiveDispatch({ prompt: "rm -rf the cache then rebuild" }));
  assert.ok(isSensitiveDispatch({ subagent_type: "trust-safety" }));
  assert.ok(!isSensitiveDispatch({ description: "tidy the README and fix a typo" }));
  assert.ok(!isSensitiveDispatch({}));
});

test("attestationStatus: a valid target is ok; missing pieces are not proven", (t) => {
  assert.equal(attestationStatus(target(t, { attestation: "valid" })).ok, true);
  assert.equal(attestationStatus(target(t, { attestation: "none" })).ok, false);
  assert.equal(attestationStatus(target(t, { attestation: "stale" })).ok, false);
  assert.equal(attestationStatus(target(t, { attestation: "fail" })).ok, false);
  assert.equal(attestationStatus(target(t, { attestation: "valid", grader: false })).ok, false);
});

test("evalDispatchAttestation: only a sensitive dispatch with no valid attestation asks", (t) => {
  const dirValid = target(t, { attestation: "valid" });
  const dirNone = target(t, { attestation: "none" });
  // not a dispatch tool
  assert.equal(evalDispatchAttestation({ tool_name: "Bash", tool_input: { command: "rm -rf x" }, cwd: dirNone }), null);
  // dispatch, not sensitive
  assert.equal(evalDispatchAttestation({ ...taskDispatch({ description: "fix a typo", prompt: "" }), cwd: dirNone }), null);
  // sensitive dispatch, valid attestation -> allow
  assert.equal(evalDispatchAttestation({ ...taskDispatch(), cwd: dirValid }), null);
  // sensitive dispatch, no attestation -> ask
  const v = evalDispatchAttestation({ ...taskDispatch(), cwd: dirNone });
  assert.equal(v.kind, "ask");
  assert.match(v.label, /SECURITY ATTESTATION GATE/);
});

// --------------------------------------------------------------- end to end

test("end-to-end: a sensitive Task dispatch with no valid attestation asks the human", (t) => {
  const dir = target(t, { attestation: "none" });
  asked(run({ ...taskDispatch(), cwd: dir }), "SECURITY ATTESTATION GATE");
});

test("end-to-end: the same dispatch with a valid attestation passes untouched", (t) => {
  const dir = target(t, { attestation: "valid" });
  silent(run({ ...taskDispatch(), cwd: dir }));
});

test("end-to-end: a routine dispatch and a non-dispatch tool pass; bad input fails open", (t) => {
  const dir = target(t, { attestation: "none" });
  silent(run({ ...taskDispatch({ description: "rename a variable", prompt: "" }), cwd: dir }));
  silent(run({ tool_name: "Bash", tool_input: { command: "git status" }, cwd: dir }));
  silent(run("not json at all"));
});

test("end-to-end: a stale attestation still asks (freshness is enforced)", (t) => {
  const dir = target(t, { attestation: "stale" });
  asked(run({ ...taskDispatch(), cwd: dir }), "SECURITY ATTESTATION GATE");
});
