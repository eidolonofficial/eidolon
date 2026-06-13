// scripts/skill-lint.mjs
//
// Validates a self-authored skill file against references/skill-template.md. Enforces the
// skill-level anti-synthetic rail (no trigger / no eval / a secret -> rejected) the same way
// scripts/persona-lint.mjs enforces "no anchor, no seat". Node built-ins only; read-only;
// reports, never fixes.
//
//   node scripts/skill-lint.mjs path/to/SKILL.md

import { readFileSync } from "node:fs";

// Bare, globally-common tokens that ALONE contaminate unrelated work (the /learn Gate 3
// narrowness rule). A trigger is too-broad only when it is one of these with no extra
// anchor: no separator, no digit, just the bare common word.
const COMMON_TOKENS = new Set([
  "redis", "jwt", "auth", "api", "db", "sql", "http", "https", "json", "git", "node",
  "python", "react", "test", "error", "build", "cache", "token", "login", "user", "skill",
]);

// A trigger is concrete enough if it is multi-word, carries a separator/path/digit anchor,
// or is a bare single word that is NOT a common token.
function isConcreteTrigger(raw) {
  const s = String(raw).trim().replace(/^["']|["']$/g, "");
  if (!s) return false;
  if (/[\s./:\\_-]/.test(s) || /\d/.test(s)) return true;
  return !COMMON_TOKENS.has(s.toLowerCase());
}

// Returns { ok, problems } for a skill file's text.
export function validateSkill(text) {
  const problems = [];
  const require_ = (re, label) => { if (!re.test(text)) problems.push("missing " + label); };

  require_(/(^|\n)\s*name:\s*\S/, "name");
  require_(/(^|\n)\s*description:\s*\S/, "description");

  // rail 1/2: triggers must exist and carry at least one CONCRETE-NARROW entry
  const trig = text.match(/(^|\n)\s*triggers:\s*\[([^\]]*)\]/);
  if (!trig || !trig[2].trim()) {
    problems.push("no triggers (the rail: no trigger, no skill)");
  } else if (!trig[2].split(",").map((s) => s.trim()).filter(Boolean).some(isConcreteTrigger)) {
    problems.push("triggers are all too-broad bare tokens (Gate 3: triggers must be concrete and narrow)");
  }

  // scope + project slug
  const scope = text.match(/(^|\n)\s*scope:\s*(project|global)\b/);
  if (!scope) problems.push("missing scope (project|global)");
  else if (scope[2] === "project" && !/(^|\n)\s*project:\s*\S/.test(text)) {
    problems.push("scope is project but no project slug");
  }

  // least-privilege tool_scope
  require_(/(^|\n)\s*tool_scope:\s*\[/, "tool_scope (least-privilege declaration)");

  // no external-URL fetch (the SkillAttack injection class), unless an explicit allow-marker
  if (!/skill-lint:\s*allow-url/.test(text)) {
    if (/\b(WebFetch|curl|fetch|requests\.get|urlopen|axios\.get|http\.get)\b[^\n]*https?:\/\//i.test(text)) {
      problems.push("external-URL fetch in the body (injection class); add a 'skill-lint: allow-url' marker only with cause");
    }
  }

  // rail 2/2: an Evals section with >= 3 scenarios (no test, no register)
  const evalsIdx = text.search(/(^|\n)#{1,6}\s*evals\b/i);
  if (evalsIdx < 0) {
    problems.push("no Evals section (no test, no register)");
  } else {
    const after = text.slice(evalsIdx);
    const firstNL = after.indexOf("\n", 1);
    const body = firstNL < 0 ? "" : after.slice(firstNL);
    const nextHead = body.search(/\n#{1,6}\s/);
    const section = nextHead < 0 ? body : body.slice(0, nextHead);
    const scenarios = (section.match(/(^|\n)\s*(?:[-*]|\d+[.)])\s+\S/g) || []).length;
    if (scenarios < 3) problems.push("Evals has fewer than 3 scenarios (need >= 3 to test-gate)");
  }

  // secret-free (NON-BYPASSABLE; /learn Gate 6)
  const secret =
    /\bghp_[A-Za-z0-9]{20,}|\bsk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}|password\s*=\s*\S|(?:postgres(?:ql)?|mysql|mongodb):\/\/\S+|(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{40,}={0,2}(?![A-Za-z0-9+/])/i;
  if (secret.test(text)) problems.push("possible secret in the skill (NON-BYPASSABLE: redact or reject)");

  return { ok: problems.length === 0, problems };
}

// CLI (only when this module is the entry point, never when imported by a test)
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("skill-lint.mjs");
const path = invokedDirectly ? process.argv[2] : undefined;
if (path) {
  try {
    const r = validateSkill(readFileSync(path, "utf8"));
    if (r.ok) { console.log("PASS  skill is well-formed: " + path); process.exit(0); }
    console.error("FAIL  " + path + "\n  " + r.problems.join("\n  ")); process.exit(1);
  } catch (e) {
    console.error("FAIL  could not read " + path + ": " + e.message); process.exit(1);
  }
}
