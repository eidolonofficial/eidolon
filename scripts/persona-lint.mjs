// scripts/persona-lint.mjs
//
// Validates a persona file against the construction template
// (references/persona-template.md). Enforces the anti-synthetic rail: a persona
// with no framework anchor is rejected, the same way a finding with no detection
// branch is rejected. Node built-ins only; read-only; reports, never fixes.
//
//   node scripts/persona-lint.mjs references/personas/<name>.md

import { readFileSync } from "node:fs";

// Returns { ok, problems } for a persona file's text.
export function validatePersona(text) {
  const problems = [];
  const require_ = (re, label) => { if (!re.test(text)) problems.push("missing " + label); };

  require_(/(^|\n)\s*persona:\s*\S/, "persona id");
  require_(/(^|\n)\s*title:\s*\S/, "title");
  require_(/(^|\n)\s*swarm:\s*\S/, "swarm");

  // the anti-synthetic rail: anchors must exist and carry at least one entry
  const anchors = text.match(/(^|\n)\s*anchors:\s*\[([^\]]*)\]/);
  if (!anchors || !anchors[2].trim()) {
    problems.push("no framework anchor (the anti-synthetic rail: no anchor, no seat)");
  }

  require_(/(^|\n)\s*anti_behaviors:/, "anti_behaviors block");
  require_(/(^|\n)\s*floor:/, "anti_behaviors.floor");
  require_(/(^|\n)\s*specific:/, "anti_behaviors.specific");

  // the rail is anchor AND evidence contract (design spec section 19): require both
  require_(/(^|\n)#{1,6}\s*evidence contract\b/i, "Evidence contract section (the rail: anchor and evidence contract)");

  return { ok: problems.length === 0, problems };
}

// CLI
const path = process.argv[2];
if (path) {
  try {
    const r = validatePersona(readFileSync(path, "utf8"));
    if (r.ok) { console.log("PASS  persona is well-formed: " + path); process.exit(0); }
    console.error("FAIL  " + path + "\n  " + r.problems.join("\n  ")); process.exit(1);
  } catch (e) {
    console.error("FAIL  could not read " + path + ": " + e.message); process.exit(1);
  }
}
