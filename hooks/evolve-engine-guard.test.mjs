// hooks/evolve-engine-guard.test.mjs
//
// Unit + end-to-end tests for the consent-tier evolve engine gate. The pure evaluator is
// exercised directly; the hook is also run the way Claude Code runs it (a child process, the
// hook JSON on stdin), asserting the ask/allow verdict. The single consent moment is the
// preflight confirmation flip (evolve-brief --confirmed true); drafting and per-round commands
// carry no flip and pass untouched.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { evalEvolveEngine } from "./evolve-engine-guard.mjs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "evolve-engine-guard.mjs");
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const PY = "engine/.venv/bin/python engine/asi-evolve/scripts/evolve-brief";

function run(payload) {
  return spawnSync(process.execPath, [HOOK], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
  });
}
const asked = (r, label) => {
  assert.equal(r.status, 0, "ask is exit 0; got " + r.status + "\n" + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, new RegExp(label));
};
const silent = (r) => { assert.equal(r.status, 0); assert.equal(r.stdout, ""); };

// --------------------------------------------------------------- pure evaluator

test("evalEvolveEngine: the preflight confirmation flip asks; drafting and unrelated work do not", () => {
  // the confirmation flip -> ask (both spellings)
  const v = evalEvolveEngine(bash(PY + " normalize --run-dir .evolve_runs/x --confirmed true"));
  assert.equal(v.kind, "ask");
  assert.match(v.label, /EVOLVE ENGINE GATE/);
  assert.equal(evalEvolveEngine(bash(PY + " normalize --confirmed=true")).kind, "ask");
  // drafting (no flip) -> allow
  assert.equal(evalEvolveEngine(bash(PY + " normalize --run-dir .evolve_runs/x")), null);
  assert.equal(evalEvolveEngine(bash(PY + " normalize --confirmed false")), null);
  // per-round commands carry no flip -> allow (one ask per run, not per round)
  assert.equal(evalEvolveEngine(bash("engine/.venv/bin/python engine/asi-evolve/scripts/evolve-eval run --run-dir .evolve_runs/x")), null);
  assert.equal(evalEvolveEngine(bash("engine/.venv/bin/python engine/asi-evolve/scripts/evolve-db record --run-dir .evolve_runs/x")), null);
  // unrelated bash / non-Bash tool -> allow
  assert.equal(evalEvolveEngine(bash("git status")), null);
  assert.equal(evalEvolveEngine({ tool_name: "Write", tool_input: { command: PY + " --confirmed true" } }), null);
});

// --------------------------------------------------------------- end to end

test("end-to-end: a confirmation flip asks the human; everything else passes silently", () => {
  asked(run(bash(PY + " normalize --run-dir .evolve_runs/x --confirmed true")), "EVOLVE ENGINE GATE");
  silent(run(bash(PY + " normalize --run-dir .evolve_runs/x")));
  silent(run(bash("npm test")));
  assert.equal(run("not json at all").status,2);
});
