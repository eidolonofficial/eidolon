// scripts/eidolon-audit.test.mjs
// Test-first for eidolon-audit: it extracts the harness references and confirms the
// complete build is coherent (every reference resolves, every persona passes the rail,
// every wired hook exists).

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractRefs, auditRepo } from "./eidolon-audit.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");

test("extractRefs finds references, hooks, and scripts paths in text", () => {
  const t = "see references/security-swarm.md and hooks/drift-guard.mjs and scripts/persona-lint.mjs here";
  const r = extractRefs(t);
  assert.ok(r.includes("references/security-swarm.md"), "should find the reference path");
  assert.ok(r.includes("hooks/drift-guard.mjs"), "should find the hook path");
  assert.ok(r.includes("scripts/persona-lint.mjs"), "should find the script path");
});

test("auditRepo reports the complete eidolon build as coherent", () => {
  const r = auditRepo(repo);
  assert.equal(r.ok, true, "audit problems: " + r.problems.join("; "));
});
