// scripts/verify-packet.mjs
//
// Assembles a self-contained cold-context verify packet: the diff, the spec, the
// rubric, and a manifest (base SHA + file list + content hash). A separate session
// (cross-session) or a fresh subagent verifies from this packet alone, with no
// conversation inheritance (references/cross-session.md). Node built-ins only.
//
//   node scripts/verify-packet.mjs --base <ref> --spec <path> [--rubric <path>] [--out <dir>]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";

// pure: a reconstructable, tamper-evident manifest for the packet contents.
export function buildManifest(baseSha, files) {
  const h = createHash("sha256");
  for (const f of files) h.update(f.name + "\0" + f.content + "\0");
  return {
    purpose: "cold-context verify packet",
    base_sha: baseSha,
    files: files.map((f) => f.name),
    content_hash: h.digest("hex"),
  };
}

const DEFAULT_RUBRIC = [
  "# Verify rubric (cold-context)",
  "",
  "Re-derive the verdict from this packet alone. For each item: PASS or RED with file:line.",
  "1. SECURITY: no argv or input reaches a shell or an unconfined path; no secret staged.",
  "2. FUNCTIONAL: the change meets the spec's acceptance criteria.",
  "3. ENCODING: ASCII source, no em or en dash (U+2014 / U+2013).",
  "4. SPEC CONFORMANCE: the change matches the spec; no drift, no over-claim.",
  "End with one line: VERDICT: PASS, or VERDICT: RED with the failing item numbers.",
  "",
].join("\n");

// CLI (only when this module is the entry point, never when imported).
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("verify-packet.mjs");
if (invokedDirectly) {
  const arg = (flag) => { const i = process.argv.indexOf(flag); return i !== -1 ? process.argv[i + 1] : undefined; };
  const base = arg("--base") || "HEAD";
  const specPath = arg("--spec");
  const rubricPath = arg("--rubric");
  const out = arg("--out") || "verify-packet";
  if (/^-/.test(base)) { console.error("FAIL  --base must be a git ref, not an option: " + base); process.exit(1); }
  try {
    const diff = execFileSync("git", ["diff", base, "--"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const baseSha = execFileSync("git", ["rev-parse", base], { encoding: "utf8" }).trim();
    const spec = specPath && existsSync(specPath) ? readFileSync(specPath, "utf8") : "(no spec provided)";
    const rubric = rubricPath && existsSync(rubricPath) ? readFileSync(rubricPath, "utf8") : DEFAULT_RUBRIC;
    const files = [
      { name: "diff.patch", content: diff },
      { name: "spec.md", content: spec },
      { name: "rubric.md", content: rubric },
    ];
    const manifest = buildManifest(baseSha, files);
    mkdirSync(out, { recursive: true });
    for (const f of files) writeFileSync(join(out, f.name), f.content);
    writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
    console.log("PASS  verify packet assembled at " + out + " (" + files.length +
      " files + manifest, base " + baseSha.slice(0, 7) + ").");
    process.exit(0);
  } catch (e) {
    console.error("FAIL  could not assemble verify packet: " + e.message);
    process.exit(1);
  }
}
