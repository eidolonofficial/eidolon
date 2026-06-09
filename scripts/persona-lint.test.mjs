// scripts/persona-lint.test.mjs
// Test-first for persona-lint: a persona file must carry the construction-template
// fields, and the anti-synthetic rail rejects a persona with no framework anchor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validatePersona } from "./persona-lint.mjs";

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
