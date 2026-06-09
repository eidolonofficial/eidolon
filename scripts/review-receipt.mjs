// scripts/review-receipt.mjs
//
// The AI-Review Receipt: a portable, signed, re-judgeable attestation of a review
// verdict, built on a verify packet (scripts/verify-packet.mjs). It carries the named
// framework anchor the reviewer was bound to, the evidence contract, the verdict, and a
// re-judge manifest, in the shape of an in-toto Statement. The anti-synthetic rail
// applies: no framework anchor, no receipt.
//
// It verifies TWO different things, and says so:
//   - Deterministic (real tamper-evidence): the evidence bundle re-hashes bit-identically,
//     and the Ed25519 signature is valid for a trusted public key (who issued it).
//   - Probabilistic (documented, not done here): re-judging in a cold context confirms the
//     verdict falls within a pre-declared agreement band, NOT a bit-identical verdict.
//
// Node built-ins only (works offline, in CI, no external deps). For public,
// third-party-auditable receipts, the Ed25519 envelope can be swapped for Sigstore
// keyless signing + a Rekor transparency log (see references/review-receipt.md).
//
//   node scripts/review-receipt.mjs keygen --out KEYDIR
//   node scripts/review-receipt.mjs issue  --packet DIR --anchor "OWASP ASVS v5.0.0" --verdict PASS --key PRIV.pem [--out FILE] [--model NAME] [--rubric URI]
//   node scripts/review-receipt.mjs verify --receipt FILE --packet DIR --pubkey PUB.pem

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash, sign as cryptoSign, verify as cryptoVerify, createPublicKey, createPrivateKey, generateKeyPairSync } from "node:crypto";
import { join } from "node:path";

// sha256 over each file's name\0content\0. MUST stay byte-identical to verify-packet's
// buildManifest (scripts/verify-packet.mjs) so an issue-time manifest hash and a verify-time
// recompute agree; if you change this scheme, change both. String() guards a non-string
// content here; buildManifest assumes string content from its own call path (FINDING 5).
export function packetHash(files) {
  const h = createHash("sha256");
  for (const f of files) h.update(f.name + "\0" + String(f.content) + "\0");
  return h.digest("hex");
}

// recompute the packet hash from the files themselves, and refuse to sign over a manifest
// hash this signer did not compute. The signer must attest what it actually hashed, never a
// content_hash a (possibly untrusted) packet-builder planted in manifest.json (FINDING 1).
export function resolveSubjectHash(files, manifest) {
  const recomputed = packetHash(files);
  if (manifest && manifest.content_hash && manifest.content_hash !== recomputed) {
    throw new Error("manifest.content_hash does not match the actual files; refusing to issue over a hash this signer did not compute");
  }
  return recomputed;
}

// at least one evidence file carries real (non-whitespace) content. No evidence, no receipt:
// the rail that refuses an empty anchor, applied to the bundle the verdict is about (FINDING 3).
export function hasEvidence(files) {
  return files.some((f) => String(f.content).trim().length > 0);
}

// canonical JSON (recursively sorted keys) so the signed bytes are stable across reloads.
export function canonical(o) {
  if (Array.isArray(o)) return o.map(canonical);
  if (o && typeof o === "object") {
    return Object.keys(o).sort().reduce((a, k) => { a[k] = canonical(o[k]); return a; }, {});
  }
  return o;
}

// build the ReviewVerdict attestation (in-toto Statement shape). Refuses with no anchor.
export function buildReceipt({ subjectHash, anchor, evidenceContract, verdict, rubricUri, judgeModel, agreementBand }) {
  if (!anchor || !String(anchor).trim()) {
    throw new Error("no framework anchor: no anchor, no receipt (the anti-synthetic rail)");
  }
  return {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: "verify-packet", digest: { sha256: subjectHash } }],
    predicateType: "https://eidolon.dev/ReviewVerdict/v0",
    predicate: {
      framework_anchor: String(anchor).trim(),
      evidence_contract: evidenceContract || "every finding carries literal evidence (file:line, tool output, or URL + response)",
      verdict: verdict || "PASS",
      rubric_uri: rubricUri || null,
      rejudge_manifest: {
        packet_sha256: subjectHash,
        judge_model: judgeModel || null,
        rubric_version: rubricUri || null,
        agreement_band: "re-judge confirms the verdict within a declared agreement band (k of n), NOT a bit-identical verdict",
      },
    },
  };
}

function keyId(publicKeyPem) {
  return createHash("sha256").update(publicKeyPem).digest("hex").slice(0, 16);
}

// read a CLI option's value, treating a missing value or an option-shaped next token
// (starts with "-") as "not provided". Without this, `issue --anchor --verdict PASS`
// (or a shell that drops an empty --anchor "") would swallow the next flag as the
// anchor and smuggle a synthetic anchor past the rail. Mirrors verify-packet's --base guard.
export function optionValue(argv, flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  if (v === undefined || /^-/.test(v)) return undefined;
  return v;
}

// sign the canonical statement with an Ed25519 private key. Embeds the key_id, not the
// key itself, so verification requires a separately-trusted public key.
export function signReceipt(statement, privateKeyPem) {
  const key = createPrivateKey(privateKeyPem);
  const bytes = Buffer.from(JSON.stringify(canonical(statement)), "utf8");
  const sig = cryptoSign(null, bytes, key);
  const pub = createPublicKey(key).export({ type: "spki", format: "pem" }).toString();
  // signature.alg is cosmetic metadata only. verifyReceipt NEVER reads it to choose an
  // algorithm (the algorithm is fixed by the Ed25519 key type via cryptoVerify(null, ...)),
  // so it cannot enable algorithm confusion. Do NOT add a verify path that selects an
  // algorithm from this field, or you reintroduce the alg-substitution attack (FINDING 4).
  return { statement, signature: { alg: "ed25519", value: sig.toString("base64"), key_id: keyId(pub) } };
}

// verify a receipt against the evidence files and a TRUSTED public key.
export function verifyReceipt({ receipt, files, publicKeyPem }) {
  const problems = [];
  const statement = receipt && receipt.statement;
  const sig = receipt && receipt.signature;
  if (!statement || !sig) return { ok: false, problems: ["receipt is missing its statement or signature"] };

  // 1. deterministic: the evidence bundle re-hashes bit-identically to the subject.
  const recomputed = packetHash(files);
  const subject = statement.subject && statement.subject[0] && statement.subject[0].digest && statement.subject[0].digest.sha256;
  if (recomputed !== subject) {
    problems.push("evidence hash mismatch (tampered packet): recomputed " + recomputed.slice(0, 12) + " != subject " + String(subject).slice(0, 12));
  }

  // 2. deterministic: the signature is valid for the provided, trusted public key.
  let pub;
  try { pub = createPublicKey(publicKeyPem); }
  catch { return { ok: false, problems: ["public key could not be parsed"] }; }
  // fingerprint the canonical SPKI form of the parsed key, not the raw PEM string, so a
  // trailing newline or CRLF/LF difference across environments does not produce a false
  // key-id mismatch on the correct key (FINDING 2). The signature check below is the authority.
  const normalizedPubPem = pub.export({ type: "spki", format: "pem" }).toString();
  if (keyId(normalizedPubPem) !== sig.key_id) {
    problems.push("key id mismatch: this receipt was signed by a different key (" + sig.key_id + ")");
  }
  let sigOk = false;
  try {
    const bytes = Buffer.from(JSON.stringify(canonical(statement)), "utf8");
    sigOk = cryptoVerify(null, bytes, pub, Buffer.from(sig.value, "base64"));
  } catch { sigOk = false; }
  if (!sigOk) problems.push("signature does not verify (tampered statement or wrong key)");

  return {
    ok: problems.length === 0,
    problems,
    anchor: statement.predicate && statement.predicate.framework_anchor,
    verdict: statement.predicate && statement.predicate.verdict,
  };
}

// read the four files a verify-packet wrote (diff.patch, spec.md, rubric.md) for hashing,
// and the manifest for its declared content_hash.
function readPacket(dir) {
  const names = ["diff.patch", "spec.md", "rubric.md"];
  const files = names.map((name) => ({ name, content: existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : "" }));
  let manifest = null;
  const mp = join(dir, "manifest.json");
  if (existsSync(mp)) { try { manifest = JSON.parse(readFileSync(mp, "utf8")); } catch {} }
  return { files, manifest };
}

// CLI (only when this module is the entry point, never when imported)
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("review-receipt.mjs");
if (invokedDirectly) {
  const arg = (f) => optionValue(process.argv, f);
  const cmd = process.argv[2];
  try {
    if (cmd === "keygen") {
      const out = arg("--out") || "review-keys";
      mkdirSync(out, { recursive: true });
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");
      const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
      writeFileSync(join(out, "review-private.pem"), privateKey.export({ type: "pkcs8", format: "pem" }).toString());
      writeFileSync(join(out, "review-public.pem"), pub);
      console.log("PASS  keypair written to " + out + " (key id " + keyId(pub) + "). Share review-public.pem with whoever verifies; keep the private key private.");
      process.exit(0);
    }
    if (cmd === "issue") {
      const dir = arg("--packet");
      if (!dir || !existsSync(dir)) { console.error("FAIL  --packet DIR is required and must exist"); process.exit(1); }
      const keyPath = arg("--key");
      if (!keyPath || !existsSync(keyPath)) { console.error("FAIL  --key PRIV.pem is required (run keygen first)"); process.exit(1); }
      const { files, manifest } = readPacket(dir);
      if (!hasEvidence(files)) { console.error("FAIL  packet has no evidence (diff/spec/rubric all empty): no evidence, no receipt"); process.exit(1); }
      const subjectHash = resolveSubjectHash(files, manifest);
      const statement = buildReceipt({
        subjectHash, anchor: arg("--anchor"), verdict: arg("--verdict") || "PASS",
        judgeModel: arg("--model"), rubricUri: arg("--rubric"),
      });
      const receipt = signReceipt(statement, readFileSync(keyPath, "utf8"));
      const out = arg("--out") || join(dir, "review-receipt.json");
      writeFileSync(out, JSON.stringify(receipt, null, 2));
      console.log("PASS  receipt issued: " + out + " (anchor: " + statement.predicate.framework_anchor + ", verdict: " + statement.predicate.verdict + ").");
      process.exit(0);
    }
    if (cmd === "verify") {
      const receiptPath = arg("--receipt");
      const dir = arg("--packet");
      const pubPath = arg("--pubkey");
      if (!receiptPath || !existsSync(receiptPath)) { console.error("FAIL  --receipt FILE is required and must exist"); process.exit(1); }
      if (!dir || !existsSync(dir)) { console.error("FAIL  --packet DIR is required and must exist"); process.exit(1); }
      if (!pubPath || !existsSync(pubPath)) { console.error("FAIL  --pubkey PUB.pem is required: verify against a key you trust, never the one in the receipt"); process.exit(1); }
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      const { files } = readPacket(dir);
      const r = verifyReceipt({ receipt, files, publicKeyPem: readFileSync(pubPath, "utf8") });
      if (r.ok) {
        console.log("PASS  receipt verifies: signed by the trusted key, evidence intact. anchor: " + r.anchor + ", verdict: " + r.verdict + ".");
        console.log("      (Deterministic check only. The verdict is an AI judgment; re-judge in a cold context to confirm it within the agreement band.)");
        process.exit(0);
      }
      console.error("FAIL  receipt does not verify:\n  " + r.problems.join("\n  "));
      process.exit(1);
    }
    console.error("usage: review-receipt.mjs <keygen|issue|verify> ...  (see the header)");
    process.exit(1);
  } catch (e) {
    console.error("FAIL  " + e.message);
    process.exit(1);
  }
}
