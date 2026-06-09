// scripts/review-receipt.test.mjs
// Test-first for the AI-Review Receipt. Covers the anti-synthetic rail (no anchor, no
// receipt), the deterministic content hash, and the security-critical paths: a tampered
// evidence file must fail verification, and a tampered verdict must break the signature.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { packetHash, buildReceipt, signReceipt, verifyReceipt, optionValue, resolveSubjectHash, hasEvidence } from "./review-receipt.mjs";

const FILES = [
  { name: "diff.patch", content: "diff X" },
  { name: "spec.md", content: "the spec" },
  { name: "rubric.md", content: "the rubric" },
];
const keys = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    pub: publicKey.export({ type: "spki", format: "pem" }).toString(),
    priv: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
};

test("packetHash is deterministic and content-sensitive", () => {
  const a = packetHash(FILES);
  const b = packetHash(FILES.map((f) => ({ ...f })));
  const c = packetHash([{ ...FILES[0], content: "diff Y" }, FILES[1], FILES[2]]);
  assert.equal(a, b, "same inputs -> same hash");
  assert.notEqual(a, c, "changed content -> changed hash");
});

test("buildReceipt refuses with no framework anchor (the rail)", () => {
  assert.throws(() => buildReceipt({ subjectHash: "abc", anchor: "", verdict: "PASS" }), /no anchor, no receipt/i);
  assert.throws(() => buildReceipt({ subjectHash: "abc", anchor: "   ", verdict: "PASS" }), /no anchor, no receipt/i);
});

test("buildReceipt carries the anchor, verdict, subject, and a rejudge manifest", () => {
  const r = buildReceipt({ subjectHash: "abc123", anchor: "OWASP ASVS v5.0.0", verdict: "PASS", judgeModel: "claude-x" });
  assert.equal(r.subject[0].digest.sha256, "abc123");
  assert.equal(r.predicate.framework_anchor, "OWASP ASVS v5.0.0");
  assert.equal(r.predicate.verdict, "PASS");
  assert.equal(r.predicate.rejudge_manifest.packet_sha256, "abc123");
  assert.equal(r.predicate.rejudge_manifest.judge_model, "claude-x");
  assert.match(r.predicate.rejudge_manifest.agreement_band, /agreement band/i);
});

test("a valid receipt verifies against the signing key", () => {
  const k = keys();
  const subjectHash = packetHash(FILES);
  const statement = buildReceipt({ subjectHash, anchor: "OWASP ASVS v5.0.0", verdict: "PASS" });
  const receipt = signReceipt(statement, k.priv);
  const r = verifyReceipt({ receipt, files: FILES, publicKeyPem: k.pub });
  assert.equal(r.ok, true, "problems: " + r.problems.join("; "));
  assert.equal(r.verdict, "PASS");
  assert.equal(r.anchor, "OWASP ASVS v5.0.0");
});

test("a tampered evidence file fails the content-hash check", () => {
  const k = keys();
  const subjectHash = packetHash(FILES);
  const receipt = signReceipt(buildReceipt({ subjectHash, anchor: "OWASP ASVS", verdict: "PASS" }), k.priv);
  const tampered = [{ name: "diff.patch", content: "diff EVIL" }, FILES[1], FILES[2]];
  const r = verifyReceipt({ receipt, files: tampered, publicKeyPem: k.pub });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /hash|tamper|mismatch/i.test(p)), "should name the hash mismatch");
});

test("a tampered verdict breaks the signature", () => {
  const k = keys();
  const subjectHash = packetHash(FILES);
  const receipt = signReceipt(buildReceipt({ subjectHash, anchor: "OWASP ASVS", verdict: "PASS" }), k.priv);
  receipt.statement.predicate.verdict = "RED"; // forge the verdict after signing
  const r = verifyReceipt({ receipt, files: FILES, publicKeyPem: k.pub });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /signature/i.test(p)), "should name the broken signature");
});

test("optionValue rejects a missing or option-shaped value (CLI rail guard)", () => {
  // the canary bug: an empty/dropped --anchor must NOT swallow the next flag as its value
  assert.equal(optionValue(["node", "x", "issue", "--anchor", "--verdict", "PASS"], "--anchor"), undefined);
  // flag is the last token, no value at all
  assert.equal(optionValue(["node", "x", "issue", "--anchor"], "--anchor"), undefined);
  // flag absent entirely
  assert.equal(optionValue(["node", "x", "issue", "--verdict", "PASS"], "--anchor"), undefined);
  // a real value passes through unchanged
  assert.equal(optionValue(["node", "x", "issue", "--anchor", "OWASP ASVS v5.0.0"], "--anchor"), "OWASP ASVS v5.0.0");
});

test("an option-shaped anchor from the CLI is refused by the rail (end to end)", () => {
  // simulate `issue --anchor --verdict PASS`: optionValue -> undefined -> buildReceipt throws
  const anchor = optionValue(["node", "x", "issue", "--anchor", "--verdict", "PASS"], "--anchor");
  assert.throws(() => buildReceipt({ subjectHash: "abc", anchor, verdict: "PASS" }), /no anchor, no receipt/i);
});

test("verifying against the wrong key fails", () => {
  const k = keys();
  const other = keys();
  const subjectHash = packetHash(FILES);
  const receipt = signReceipt(buildReceipt({ subjectHash, anchor: "OWASP ASVS", verdict: "PASS" }), k.priv);
  const r = verifyReceipt({ receipt, files: FILES, publicKeyPem: other.pub });
  assert.equal(r.ok, false, "a receipt must not verify against a key that did not sign it");
});

// FINDING 1 (MEDIUM): issue must recompute the hash itself and never blindly trust a manifest.
test("resolveSubjectHash recomputes from files and rejects a mismatched manifest", () => {
  const h = packetHash(FILES);
  assert.equal(resolveSubjectHash(FILES, null), h, "no manifest -> recompute from the files");
  assert.equal(resolveSubjectHash(FILES, { content_hash: h }), h, "agreeing manifest -> the recomputed hash");
  assert.throws(
    () => resolveSubjectHash(FILES, { content_hash: "deadbeefdeadbeef" }),
    /does not match/i,
    "a planted/mismatched manifest must fail loudly, never be signed over",
  );
});

// FINDING 3 (LOW): no evidence, no receipt (the rail's spirit, for the bundle).
test("hasEvidence is false for an all-empty bundle", () => {
  assert.equal(hasEvidence(FILES), true);
  assert.equal(
    hasEvidence([{ name: "diff.patch", content: "" }, { name: "spec.md", content: "" }, { name: "rubric.md", content: "" }]),
    false,
    "three empty files are not evidence",
  );
  assert.equal(hasEvidence([{ name: "diff.patch", content: "   \n  " }]), false, "whitespace-only is not evidence");
});

// FINDING 2 (LOW): the same key supplied with different PEM whitespace must still verify (key_id normalized).
test("verifies against the same key with different PEM whitespace", () => {
  const k = keys();
  const receipt = signReceipt(buildReceipt({ subjectHash: packetHash(FILES), anchor: "OWASP ASVS", verdict: "PASS" }), k.priv);
  const mangled = k.pub.trim() + "\r\n\r\n"; // altered trailing whitespace, same key
  const r = verifyReceipt({ receipt, files: FILES, publicKeyPem: mangled });
  assert.equal(r.ok, true, "problems: " + r.problems.join("; "));
});
