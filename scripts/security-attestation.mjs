// scripts/security-attestation.mjs
//
// The Security-Awareness Attestation: a portable, signed, re-checkable record that an
// agent read a named security policy, took the scenario quiz, and was graded PASS by an
// EXTERNAL validator that holds the answer key. The orchestrator gates a destructive or
// sensitive dispatch on it (hooks/dispatch-attestation-guard.mjs asks the human when none
// is valid). The pattern is adapted from slartz/agent-security-awareness-training (MIT,
// see CREDITS.md); the signing reuses the hardened Ed25519 review-receipt engine rather
// than reinventing it.
//
// It says the same honest split the review receipt does:
//   - DETERMINISTIC (a machine fact): the policy text re-hashes bit-identically to the
//     signed subject, the Ed25519 signature is valid for a TRUSTED public key, the result
//     is "pass", and the timestamp is current. This proves an external grader really
//     issued this verdict over this exact policy.
//   - It does NOT prove the agent is injection-proof. Awareness is a soft comprehension
//     layer, not a deterministic control; the deterministic guardrails (the hook suite)
//     still do the real work. An agent with a fresh attestation is exactly as
//     prompt-injectable as one without (references/security-awareness.md).
//
// Node built-ins only (works offline, in CI, no external deps). The signer/verifier are
// imported from review-receipt.mjs so the crypto path, the canonical-JSON scheme, and the
// anti-synthetic anchor rail stay byte-identical to the proven one. This file adds no new
// algorithm-selection path (so it cannot reintroduce the alg-substitution class).
//
//   node scripts/security-attestation.mjs keygen --out KEYDIR
//   node scripts/security-attestation.mjs issue  --policy FILE --anchor "..." --quiz FILE \
//        --result pass --graded-by ID --key PRIV.pem [--out FILE] [--model NAME]
//   node scripts/security-attestation.mjs verify --attestation FILE --policy FILE \
//        --pubkey PUB.pem [--max-age-days N] [--self-id ID]
//   node scripts/security-attestation.mjs status --policy FILE [--attestation FILE]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { join } from "node:path";
import { packetHash, canonical, signReceipt, verifyReceipt, optionValue } from "./review-receipt.mjs";

export const PREDICATE_TYPE = "https://eidolon.dev/SecurityAwareness/v0";
export const POLICY_SUBJECT = "security-policy.md";
export const DEFAULT_MAX_AGE_DAYS = 90;

// The legal results. A non-pass attestation is a real, signable record (a documented
// failure travels too), but verifyAttestation only clears a "pass".
const RESULTS = new Set(["pass", "fail"]);

// sha256 over the policy text in the SAME scheme review-receipt hashes its packet with
// (name\0content\0), so the subject the verifier re-hashes is byte-identical and the
// imported verifyReceipt works unchanged. The subject name is fixed so issue and verify
// hash the same bytes.
export function policyHash(policyText) {
  return packetHash([{ name: POLICY_SUBJECT, content: String(policyText) }]);
}

// The files array verifyReceipt re-hashes. Built from the policy text alone, with the
// fixed subject name, so it matches policyHash above.
export function policyFiles(policyText) {
  return [{ name: POLICY_SUBJECT, content: String(policyText) }];
}

// Build the SecurityAwareness attestation (in-toto Statement shape). Refuses with no
// framework anchor (the anti-synthetic rail), no external grader id (the "never self-grade"
// rail), or an unknown result. graded_by names the EXTERNAL validator; the real externality
// guarantee is the trusted signing key, this field is the human-readable witness.
export function buildSecurityAttestation({ policyHash: ph, anchor, quizVersion, result, gradedBy, judgeModel, timestamp }) {
  if (!anchor || !String(anchor).trim()) {
    throw new Error("no framework anchor: no anchor, no attestation (the anti-synthetic rail)");
  }
  if (!gradedBy || !String(gradedBy).trim()) {
    throw new Error("no external grader: you do not grade your own quiz, ever (graded_by is required)");
  }
  const res = String(result || "").trim().toLowerCase();
  if (!RESULTS.has(res)) {
    throw new Error('result must be "pass" or "fail" (got: ' + JSON.stringify(result) + ")");
  }
  if (!ph || !String(ph).trim()) {
    throw new Error("no policy hash: the attestation must bind to the exact policy text it was graded against");
  }
  return {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: "security-policy", digest: { sha256: String(ph) } }],
    predicateType: PREDICATE_TYPE,
    predicate: {
      framework_anchor: String(anchor).trim(),
      policy_sha256: String(ph),
      quiz_version: quizVersion ? String(quizVersion) : null,
      result: res,
      graded_by: String(gradedBy).trim(),
      judge_model: judgeModel ? String(judgeModel) : null,
      timestamp: timestamp || new Date().toISOString(),
      attestation_contract:
        "graded by an external validator holding the answer key; the agent never grades its own quiz. " +
        "a soft comprehension layer, not a deterministic control (references/security-awareness.md).",
    },
  };
}

// Verify an attestation against the policy text and a TRUSTED public key. Layers the four
// SecurityAwareness checks on top of the two deterministic review-receipt checks (policy
// re-hashes to the subject; signature is valid for the trusted key). Returns the same
// { ok, problems, ... } shape so callers read it like a receipt.
export function verifyAttestation({ receipt, policyText, publicKeyPem, expectedPolicyHash, maxAgeDays = DEFAULT_MAX_AGE_DAYS, selfId = null, now = Date.now() }) {
  const base = verifyReceipt({ receipt, files: policyFiles(policyText), publicKeyPem });
  const problems = [...base.problems];
  const pred = (receipt && receipt.statement && receipt.statement.predicate) || {};

  if (receipt && receipt.statement && receipt.statement.predicateType !== PREDICATE_TYPE) {
    problems.push("wrong predicate type: not a SecurityAwareness attestation (" + receipt.statement.predicateType + ")");
  }
  if (String(pred.result).toLowerCase() !== "pass") {
    problems.push('result is not "pass" (got: ' + JSON.stringify(pred.result) + ")");
  }
  const expected = expectedPolicyHash || policyHash(policyText);
  if (pred.policy_sha256 !== expected) {
    problems.push("policy hash mismatch: the attestation was graded against a different policy text");
  }
  const ts = Date.parse(pred.timestamp);
  if (Number.isNaN(ts)) {
    problems.push("missing or unparseable timestamp");
  } else if (now - ts > maxAgeDays * 86400000) {
    problems.push("attestation is stale (older than " + maxAgeDays + " days): re-attest against the current policy");
  } else if (ts - now > 86400000) {
    problems.push("attestation timestamp is in the future: refusing a post-dated attestation");
  }
  if (!pred.graded_by || !String(pred.graded_by).trim()) {
    problems.push("no graded_by: an attestation with no named external grader is a self-grade by omission");
  } else if (selfId && String(pred.graded_by).trim() === String(selfId).trim()) {
    problems.push("self-graded: graded_by equals the agent's own id; you do not grade your own quiz");
  }

  return {
    ok: problems.length === 0,
    problems,
    result: pred.result,
    anchor: pred.framework_anchor,
    graded_by: pred.graded_by,
    policy_sha256: pred.policy_sha256,
    timestamp: pred.timestamp,
  };
}

// CLI (only when this module is the entry point, never when imported by a hook or a test)
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("security-attestation.mjs");
if (invokedDirectly) {
  const arg = (f) => optionValue(process.argv, f);
  const cmd = process.argv[2];
  const readText = (p) => readFileSync(p, "utf8");
  try {
    if (cmd === "keygen") {
      const out = arg("--out") || "security-keys";
      mkdirSync(out, { recursive: true });
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");
      writeFileSync(join(out, "security-private.pem"), privateKey.export({ type: "pkcs8", format: "pem" }).toString());
      writeFileSync(join(out, "security-public.pem"), publicKey.export({ type: "spki", format: "pem" }).toString());
      console.log("PASS  grader keypair written to " + out + ". The grader keeps security-private.pem; the target trusts security-public.pem. Never commit the private key.");
      process.exit(0);
    }
    if (cmd === "issue") {
      const policyPath = arg("--policy");
      if (!policyPath || !existsSync(policyPath)) { console.error("FAIL  --policy FILE is required and must exist"); process.exit(1); }
      const keyPath = arg("--key");
      if (!keyPath || !existsSync(keyPath)) { console.error("FAIL  --key PRIV.pem is required (run keygen first); the grader signs, never the agent"); process.exit(1); }
      const policyText = readText(policyPath);
      const quizPath = arg("--quiz");
      const statement = buildSecurityAttestation({
        policyHash: policyHash(policyText),
        anchor: arg("--anchor"),
        quizVersion: quizPath && existsSync(quizPath) ? policyHash(readText(quizPath)).slice(0, 16) : arg("--quiz-version"),
        result: arg("--result") || "pass",
        gradedBy: arg("--graded-by"),
        judgeModel: arg("--model"),
      });
      const receipt = signReceipt(statement, readText(keyPath));
      const out = arg("--out") || join(".claude", "security-attestation.json");
      const dir = out.includes("/") || out.includes("\\") ? out.replace(/[\\/][^\\/]*$/, "") : "";
      if (dir) mkdirSync(dir, { recursive: true });
      writeFileSync(out, JSON.stringify(receipt, null, 2));
      console.log("PASS  attestation issued: " + out + " (anchor: " + statement.predicate.framework_anchor + ", result: " + statement.predicate.result + ", graded_by: " + statement.predicate.graded_by + ").");
      process.exit(0);
    }
    if (cmd === "verify") {
      const attPath = arg("--attestation");
      const policyPath = arg("--policy");
      const pubPath = arg("--pubkey");
      if (!attPath || !existsSync(attPath)) { console.error("FAIL  --attestation FILE is required and must exist"); process.exit(1); }
      if (!policyPath || !existsSync(policyPath)) { console.error("FAIL  --policy FILE is required and must exist"); process.exit(1); }
      if (!pubPath || !existsSync(pubPath)) { console.error("FAIL  --pubkey PUB.pem is required: verify against the grader key you trust, never one inside the attestation"); process.exit(1); }
      const receipt = JSON.parse(readText(attPath));
      const r = verifyAttestation({
        receipt,
        policyText: readText(policyPath),
        publicKeyPem: readText(pubPath),
        maxAgeDays: Number(arg("--max-age-days")) || DEFAULT_MAX_AGE_DAYS,
        selfId: arg("--self-id") || null,
      });
      if (r.ok) {
        console.log("PASS  attestation verifies: signed by the trusted grader key over the current policy, result pass, current. graded_by: " + r.graded_by + ", anchor: " + r.anchor + ".");
        console.log("      (Deterministic + policy checks only. Awareness is a soft layer; the deterministic guardrails still do the real work.)");
        process.exit(0);
      }
      console.error("FAIL  attestation does not verify:\n  " + r.problems.join("\n  "));
      process.exit(1);
    }
    if (cmd === "status") {
      const policyPath = arg("--policy");
      if (!policyPath || !existsSync(policyPath)) { console.error("FAIL  --policy FILE is required and must exist"); process.exit(1); }
      const ph = policyHash(readText(policyPath));
      const attPath = arg("--attestation") || join(".claude", "security-attestation.json");
      if (!existsSync(attPath)) { console.log("NONE  policy " + ph.slice(0, 12) + " - no attestation at " + attPath + " (a destructive/sensitive dispatch will ask the human)."); process.exit(0); }
      let pred = {};
      try { pred = (JSON.parse(readText(attPath)).statement || {}).predicate || {}; } catch {}
      const fresh = pred.policy_sha256 === ph ? "current-policy" : "STALE-POLICY";
      console.log((pred.result === "pass" ? "PASS" : "SEEN") + "  policy " + ph.slice(0, 12) + " - attestation result=" + (pred.result || "?") + " graded_by=" + (pred.graded_by || "?") + " (" + fresh + "). Cryptographic verify needs the grader pubkey.");
      process.exit(0);
    }
    console.error("usage: security-attestation.mjs <keygen|issue|verify|status> ...  (see the header)");
    process.exit(1);
  } catch (e) {
    console.error("FAIL  " + e.message);
    process.exit(1);
  }
}
