import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkReadme } from "./hooks-readme-check.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(join(root, "hooks", "README.md"), "utf8");
const dropLine = (text, needle) => text.split("\n").filter((l) => !l.includes(needle)).join("\n");
// A Hearth bundle or an installed copy ships without the repo's .claude/settings.json; the wiring tests need it.
const wiringOnly = { skip: !existsSync(join(root, ".claude", "settings.json")) && "no .claude/settings.json in this copy" };

test("without .claude/settings.json (a bundle or an installed copy) the wiring part is skipped and the README still passes", (t) => {
  const copy = mkdtempSync(join(tmpdir(), "readme-check-"));
  t.after(() => rmSync(copy, { recursive: true, force: true }));
  cpSync(join(root, "hooks"), join(copy, "hooks"), { recursive: true });
  assert.deepEqual(checkReadme(copy, readme), []);
});

test("the committed README matches the code", () => {
  assert.deepEqual(checkReadme(root, readme), []);
});

test("a README with one evaluator row removed fails and names the evaluator", () => {
  const problems = checkReadme(root, dropLine(readme, "| `evalWavePlan` |"));
  assert.ok(problems.some((p) => p.includes("evalWavePlan")), problems.join("\n"));
});

test("a README with one wiring row removed fails", wiringOnly, () => {
  const problems = checkReadme(root, dropLine(readme, "| SubagentStop |"));
  assert.ok(problems.some((p) => p.startsWith("wiring:") && p.includes("SubagentStop")), problems.join("\n"));
});

test("a README with a hook file row removed fails", () => {
  const problems = checkReadme(root, dropLine(readme, "| mempalace-orient.mjs |"));
  assert.ok(problems.some((p) => p.includes("mempalace-orient.mjs")), problems.join("\n"));
});

test("two evaluator rows in the wrong order fail", () => {
  const lines = readme.split("\n");
  const a = lines.findIndex((l) => l.includes("| `evalVerification` |"));
  [lines[a], lines[a + 1]] = [lines[a + 1], lines[a]];
  const problems = checkReadme(root, lines.join("\n"));
  assert.ok(problems.some((p) => p.includes("order differs")), problems.join("\n"));
});

test("a README containing an em dash or an en dash fails", () => {
  for (const code of [0x2014, 0x2013]) {
    const problems = checkReadme(root, readme + "\nA note " + String.fromCharCode(code) + " here.\n");
    assert.ok(problems.some((p) => p.includes("em or en dash")), problems.join("\n"));
  }
});

test("a wiring row without the --project arg fails", wiringOnly, () => {
  const stripped = readme.split("\n").map((l) => (l.startsWith("| SubagentStop |") ? l.replace(/--project \$\{CLAUDE_PROJECT_DIR\}/, "") : l)).join("\n");
  const problems = checkReadme(root, stripped);
  assert.ok(problems.some((p) => p.includes("lacks the --project arg") && p.includes("SubagentStop")), problems.join("\n"));
});

test('a README with no "What asks" heading fails', () => {
  const problems = checkReadme(root, readme.replace(/^## What asks$/m, "## Questions"));
  assert.ok(problems.some((p) => p.includes("What asks")), problems.join("\n"));
});
