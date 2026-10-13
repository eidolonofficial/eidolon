// scripts/hooks-readme-check.mjs
//
// Fails when hooks/README.md drifts from the code: the wiring table against .claude/settings.json,
// the three evaluator tables against suite-evaluators.mjs and guard-dispatch.mjs (same names, same
// order), a hook file with no README row, and any em or en dash. Read-only; reports, never fixes.
//
//   node scripts/hooks-readme-check.mjs          # check the repo it lives in
//   node scripts/hooks-readme-check.mjs PATH     # check another checkout

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SHARED = ["lib.mjs", "operation.mjs", "shell-operation.mjs", "confined-path.mjs",
  "suite-evaluators.mjs", "dispatch-evaluators.mjs", "lanes.mjs", "policy-manifest.mjs"];
const DASH = /[\u2013\u2014]/;

// Cells of the first table after the heading that starts with `title`; \| inside a cell is a literal pipe.
function table(readme, title) {
  const lines = readme.split(/\r?\n/);
  const at = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.replace(/^#+\s*/, "").startsWith(title));
  if (at < 0) return null;
  const rows = [];
  for (let i = at + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) break;
    if (!lines[i].startsWith("|")) { if (rows.length) break; continue; }
    const cells = lines[i].replace(/^\||\|\s*$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    rows.push(cells);
  }
  return rows.slice(1); // drop the header row
}
const bare = (cell) => cell.replace(/`/g, "").trim();

function wiredFromSettings(settings) {
  const out = [];
  for (const [event, groups] of Object.entries(settings.hooks || {}))
    for (const group of groups) for (const h of group.hooks || []) {
      const file = [h.command, ...(h.args || [])].map(String).find((s) => /\.mjs$/.test(s));
      out.push(`${event} | ${group.matcher || "(empty)"} | hooks/${basename(file || "?")}`);
    }
  return out;
}

function names(source, pattern) {
  const m = source.match(pattern);
  return m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : null;
}

function compareList(label, expected, actual, problems) {
  if (!actual) { problems.push(`${label}: no table found in hooks/README.md`); return; }
  for (const e of expected) if (!actual.includes(e)) problems.push(`${label}: README is missing ${e}`);
  for (const a of actual) if (!expected.includes(a)) problems.push(`${label}: README lists ${a}, which the code does not run`);
  if (!problems.some((p) => p.startsWith(label + ":")) && expected.join() !== actual.join())
    problems.push(`${label}: order differs. code: ${expected.join(", ")}. README: ${actual.join(", ")}`);
}

export function checkReadme(root, readme) {
  const problems = [];
  const hooks = join(root, "hooks");

  // (a) wiring
  const wired = wiredFromSettings(JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8")));
  const wiring = table(readme, "Wiring");
  const listed = wiring && wiring.map((r) => `${bare(r[0])} | ${bare(r[1])} | ${bare(r[2])}`);
  if (!listed) problems.push("wiring: no table found in hooks/README.md");
  else {
    for (const w of wired) if (!listed.includes(w)) problems.push(`wiring: README is missing ${w}`);
    for (const l of listed) if (!wired.includes(l)) problems.push(`wiring: README lists ${l}, which .claude/settings.json does not wire`);
  }

  // (b) evaluators, in code order
  const suite = readFileSync(join(hooks, "suite-evaluators.mjs"), "utf8");
  const dispatch = readFileSync(join(hooks, "guard-dispatch.mjs"), "utf8");
  for (const [label, title, expected] of [
    ["bash evaluators", "Bash and PowerShell evaluators", names(suite, /export const bashEvaluators = \[([^\]]*)\]/)],
    ["write evaluators", "Write and Edit evaluators", names(suite, /export const writeEvaluators = \[([^\]]*)\]/)],
    ["dispatch evaluators", "Dispatch evaluators", names(dispatch, /runSuite\(\[([^\]]*)\]\)/)],
  ]) {
    if (!expected) { problems.push(`${label}: cannot read the evaluator list from the code`); continue; }
    const rows = table(readme, title);
    compareList(label, expected, rows && rows.map((r) => bare(r[1])), problems);
  }

  // (c) every hook file has a row; shared modules are named on the "Shared modules" line
  const rowLines = readme.split(/\r?\n/).filter((l) => l.startsWith("|"));
  const sharedLine = readme.split(/\r?\n/).find((l) => l.startsWith("Shared modules:")) || "";
  for (const f of readdirSync(hooks).filter((n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs")).sort()) {
    if (SHARED.includes(f)) { if (!sharedLine.includes(f)) problems.push(`shared module ${f} is not on the "Shared modules" line`); }
    else if (!rowLines.some((l) => l.includes(f))) problems.push(`hook ${f} has no row in hooks/README.md`);
  }

  // (d) dashes
  readme.split(/\r?\n/).forEach((l, i) => { if (DASH.test(l)) problems.push(`hooks/README.md line ${i + 1}: em or en dash`); });

  return problems;
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("hooks-readme-check.mjs");
if (invokedDirectly) {
  const root = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), "..");
  const path = join(root, "hooks", "README.md");
  if (!existsSync(path)) { console.error("FAIL  hooks/README.md not found"); process.exit(1); }
  const problems = checkReadme(root, readFileSync(path, "utf8"));
  if (problems.length) { console.error(problems.map((p) => "FAIL  " + p).join("\n")); process.exit(1); }
  console.log("PASS  hooks/README.md matches the code: wiring, evaluator order, hook rows, no dashes.");
}
