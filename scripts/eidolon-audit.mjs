// scripts/eidolon-audit.mjs
//
// Audits the eidolon harness's own integrity: every reference SKILL.md names resolves
// to a real file, every persona passes the anti-synthetic rail, and every hook the
// settings file wires exists. Node built-ins only; read-only; reports, never fixes.
// Exits non-zero on any problem. This is the recursive-verification antibehavior
// defense (design spec section 10) applied to the whole harness, not just the records.
//
//   node scripts/eidolon-audit.mjs            # audit the repo it lives in
//   node scripts/eidolon-audit.mjs PATH       # audit another checkout

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePersona } from "./persona-lint.mjs";

// Repo-relative paths a doc names (references/, hooks/, scripts/ with a real extension).
// The negative lookbehind keeps it to repo-relative paths: a references/ that is a
// suffix of a longer external path (e.g. ~/.claude/skills/.../references/x.md) is not
// a repo reference and is skipped.
export function extractRefs(text) {
  const re = /(?<![A-Za-z0-9_.\/-])(references|hooks|scripts)\/[A-Za-z0-9_.\/-]+\.(md|mjs|cjs|sh|js)\b/g;
  return [...new Set(String(text).match(re) || [])];
}

export function auditRepo(root) {
  const problems = [];

  // 1. reference integrity: every path SKILL.md names must exist
  const skillPath = join(root, "SKILL.md");
  if (existsSync(skillPath)) {
    for (const ref of extractRefs(readFileSync(skillPath, "utf8"))) {
      if (!existsSync(join(root, ref))) problems.push("SKILL.md references a missing file: " + ref);
    }
  }

  // 2. persona rail: every persona file must pass the anti-synthetic rail
  const pdir = join(root, "references", "personas");
  if (existsSync(pdir)) {
    const files = readdirSync(pdir, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith(".md") && !/README/i.test(f));
    for (const f of files) {
      const r = validatePersona(readFileSync(join(pdir, f), "utf8"));
      if (!r.ok) problems.push("persona fails the rail (" + f + "): " + r.problems.join(", "));
    }
  }

  // 3. settings: every hook path the settings file wires must exist
  const settings = join(root, ".claude", "settings.json");
  if (existsSync(settings)) {
    try {
      const j = JSON.parse(readFileSync(settings, "utf8"));
      const wired = JSON.stringify(j).match(/\$\{CLAUDE_PROJECT_DIR\}\/[A-Za-z0-9_.\/-]+\.(mjs|cjs|js|sh)/g) || [];
      for (const a of [...new Set(wired)]) {
        const rel = a.replace(/\$\{CLAUDE_PROJECT_DIR\}\//, "");
        if (!existsSync(join(root, rel))) problems.push("settings.json wires a missing hook: " + rel);
      }
    } catch { problems.push("settings.json is not valid JSON"); }
  }

  return { ok: problems.length === 0, problems };
}

// CLI
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("eidolon-audit.mjs");
if (invokedDirectly) {
  const root = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), "..");
  const r = auditRepo(root);
  if (r.ok) {
    console.log("PASS  eidolon harness is coherent: references resolve, personas pass the rail, wired hooks exist.");
    process.exit(0);
  }
  console.error("FAIL  eidolon audit found " + r.problems.length + " problem(s):\n  " + r.problems.join("\n  "));
  process.exit(1);
}
