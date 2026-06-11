// hooks/guard-write.mjs
//
// Eidolon hook suite - the single PreToolUse(Write|Edit) entry. One spawn
// instead of five: reads the hook JSON once and runs every Write/Edit-path
// guard's exported evaluator in the previously wired order. Verdict precedence
// lives in lib.mjs runSuite: the first block halts the call, an ask escalates
// to the human, advisories accumulate and ride along together.
//
// Each guard file keeps its own standalone entry point, so the per-guard tests
// and a hand wiring both still work; this dispatcher changes the spawn count,
// never a verdict. drift-guard is stateful (the consecutive-scaffold counter),
// so it must be wired here OR standalone, never both.

import { runSuite } from "./lib.mjs";
import { evalAppendOnlyRecord } from "./append-only-record-guard.mjs";
import { evalPersonaConduct } from "./persona-conduct-guard.mjs";
import { evalDrift } from "./drift-guard.mjs";
import { evalConduct } from "./conduct-guard.mjs";
import { evalSettingsIntegrity } from "./settings-integrity-guard.mjs";

// the order of the per-guard settings entries this dispatcher replaced
runSuite([
  evalAppendOnlyRecord,
  evalPersonaConduct,
  evalDrift,
  evalConduct,
  evalSettingsIntegrity,
]);
