// hooks/evolve-engine-guard.mjs
//
// Eidolon hook suite - PreToolUse(Bash). The CONSENT-tier gate for the vendored ASI-Evolve
// evolve engine (engine/asi-evolve/, the agent-driven toolbelt; see references/evolve-engine.md
// and CREDITS.md). The engine's own preflight rule is that nothing mutates files or runs the
// evaluator until the run spec is confirmed, via `evolve-brief normalize ... --confirmed true`.
// That confirmation flip is the SINGLE human-authorization moment of an evolve run: it unlocks
// the mutate/evaluate round loop on a real compute budget. So when a Bash command would flip
// preflight to confirmed, this gate ASKS the human - one ask per run, never per round - and the
// run spec's round budget bounds everything after. Like the security gate, it ASKS, it never
// hard-blocks (awareness is a soft layer; the operator legitimately wants the run).
//
// Drafting commands (`evolve-brief normalize` without the flip, `evolve-eval inspect`, cognition
// seeding) carry no flip and pass untouched. The engine launch is otherwise ordinary Bash, so
// this rides the guard-bash dispatcher - no own settings.json matcher (cf. dispatch-attestation-
// guard, which needs its own Task matcher because a Bash dispatcher never sees the Task tool).
//
// I/O contract in hooks/lib.mjs: fail open; ask via the documented permissionDecision JSON.
import { runHook, emitVerdict } from "./lib.mjs";

// A vendored evolve toolbelt brief invocation: the evolve-brief wrapper, by path under the
// engine's scripts dir or bare once that dir is on PATH. A mere substring in an echo/comment
// still needs the --confirmed true flip below to fire, so a doc that mentions it is not gated.
const EVOLVE_BRIEF = /\bevolve-brief\b/i;
// The preflight confirmation flip: --confirmed true | --confirmed=true | --confirmed True.
const CONFIRM_FLIP = /--confirmed[=\s]+true\b/i;

// Pure verdict for one payload.
export function evalEvolveEngine(j = {}) {
  if (j.tool_name && j.tool_name !== "Bash") return null;
  const cmd = String((j.tool_input || {}).command || "");
  if (EVOLVE_BRIEF.test(cmd) && CONFIRM_FLIP.test(cmd)) {
    return {
      kind: "ask",
      label: "EVOLVE ENGINE GATE",
      why:
        "this confirms an ASI-Evolve preflight run spec (evolve-brief --confirmed true), which " +
        "unlocks the mutate/evaluate round loop: from here the engine writes candidate code into " +
        "the approved mutation scope and runs the evaluator on a real compute budget. Confirm the " +
        "objective, core score, evaluator timeout, writable paths, and round budget are what you " +
        "approved (references/evolve-engine.md). One confirm per run; the run spec's budget bounds " +
        "the rest. The gate asks, it never blocks.",
    };
  }
  return null;
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("evolve-engine-guard.mjs");
if (invokedDirectly) runHook((j) => emitVerdict(evalEvolveEngine(j)));
