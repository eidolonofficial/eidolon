// hooks/orient-gate.mjs
//
// PreToolUse(Write|Edit|Task|Agent) -- the ORIENT-GATE. Hard-blocks (exit 2) an agent
// dispatch or a source-code edit until BOTH graphify and mempalace have been read this
// session (recorded by orient-gate-sensor into .claude/.orient-gate.json). Everything
// else passes untouched: reads, non-source edits, docs / mockups / .claude / build
// edits, and any markdown or config. Fail-open via runHook. See orient-gate-core.mjs
// for the why and the exact gate decision. Wire on both the Write|Edit and Task|Agent
// matchers (it self-distinguishes by tool name); the sensor wires on PostToolUse.
import { runHook, emitVerdict } from "./lib.mjs";
import { evalGate } from "./orient-gate-core.mjs";

runHook((j) => emitVerdict(evalGate(j)));
