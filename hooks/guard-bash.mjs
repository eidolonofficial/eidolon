// hooks/guard-bash.mjs
//
// Eidolon hook suite - the single PreToolUse(Bash) entry. One spawn instead of
// eight: reads the hook JSON once and runs every Bash-path guard's exported
// evaluator in the previously wired order. Verdict precedence lives in
// lib.mjs runSuite: the first block halts the call, an ask escalates to the
// human, advisories accumulate and ride along together.
//
// Each guard file keeps its own standalone entry point, so the per-guard tests
// and a hand wiring both still work; this dispatcher changes the spawn count,
// never a verdict. advisor-guard stays on its own ".*advisor.*" matcher (it
// keys on the tool NAME, which a Bash dispatcher never sees).

import { runSuite } from "./lib.mjs";
import { evalVerification } from "./verification-guard.mjs";
import { evalCommitQuality } from "./commit-quality-guard.mjs";
import { evalPersonaConduct } from "./persona-conduct-guard.mjs";
import { evalHookIntegrity } from "./hook-integrity-guard.mjs";
import { evalDeletion } from "./deletion-guard.mjs";
import { evalProtectedPaths } from "./protected-paths-guard.mjs";
import { evalVisualEvidence } from "./visual-evidence-gate.mjs";
import { evalConduct } from "./conduct-guard.mjs";

// the order of the eight per-guard settings entries this dispatcher replaced
runSuite([
  evalVerification,
  evalCommitQuality,
  evalPersonaConduct,
  evalHookIntegrity,
  evalDeletion,
  evalProtectedPaths,
  evalVisualEvidence,
  evalConduct,
]);
