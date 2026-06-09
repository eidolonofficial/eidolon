// scripts/verify-packet.test.mjs
// Test-first for verify-packet: the manifest is reconstructable (same inputs, same
// hash) and tamper-evident (different content, different hash), so a cold session can
// trust a packet it reads.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildManifest } from "./verify-packet.mjs";

test("buildManifest lists files, carries base_sha, and hashes content", () => {
  const files = [{ name: "diff.patch", content: "X" }, { name: "spec.md", content: "S" }];
  const a = buildManifest("base1", files);
  const b = buildManifest("base1", [{ name: "diff.patch", content: "X" }, { name: "spec.md", content: "S" }]);
  const c = buildManifest("base1", [{ name: "diff.patch", content: "Y" }, { name: "spec.md", content: "S" }]);
  assert.deepEqual(a.files, ["diff.patch", "spec.md"], "manifest lists the packet files");
  assert.equal(a.base_sha, "base1", "manifest carries the base sha");
  assert.equal(a.content_hash, b.content_hash, "same inputs -> same hash (reconstructable)");
  assert.notEqual(a.content_hash, c.content_hash, "different content -> different hash (tamper-evident)");
});
