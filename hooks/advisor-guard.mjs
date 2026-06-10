// hooks/advisor-guard.mjs
//
// Eidolon hook suite - PreToolUse(any tool whose name contains "advisor").
// A dispatched subagent is FORBIDDEN from calling an advisor tool. The grounding
// incident (2026-06-09, recorded in the source project's fix log): four
// orchestrated agents each opened with an advisor call and produced zero file
// writes; the calls hung the agents silently, and the loss was caught from the
// filesystem, not from the agents' own reports. An advisor call inside a worker
// is the wrong shape twice over: it wastes or hangs the worker's turn, and it
// routes a judgment upward that the worker was dispatched to execute, not to
// re-deliberate. The controller (the Expediter, the main session) owns judgment
// routing; the worker owns its one bounded task.
//
// Scope, stated precisely: this guard blocks SUBAGENTS only. The main session is
// allowed through untouched (exit 0, no message). Subagent detection reads the
// harness's transcript_path, which places dispatched agents' transcripts under a
// "subagents" directory; an absent or unrecognized path fails open as the main
// session, so a harness that omits the field never bricks normal work.
//
// I/O contract mirrors the suite: fail open on bad input; block via stderr + exit 2.

import { runHook } from "./lib.mjs";

// Decide what to do for a proposed tool call.
//   null                          -> allow (exit 0)
//   { kind: "subagent-advisor" }  -> block: a subagent is calling an advisor tool
// Pure and harness-agnostic so the test exercises it directly.
export function evaluateAdvisor(toolName, ctx = {}) {
  if (!ctx.isSubagent) return null;
  if (!/advisor/i.test(String(toolName || ""))) return null;
  return { kind: "subagent-advisor" };
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("advisor-guard.mjs");
if (invokedDirectly) {
  runHook((j) => {
    const isSubagent = /[\\/]subagents[\\/]/i.test(String(j.transcript_path || ""));
    const verdict = evaluateAdvisor(j.tool_name, { isSubagent });
    if (!verdict) process.exit(0);

    process.stderr.write(
      "ADVISOR GUARD [BLOCKED - subagents do not call advisor]: you are a dispatched agent,\n" +
      "and advisor calls are reserved for the controller. Calling it from a worker wastes or\n" +
      "hangs your turn and routes a judgment upward that your dispatch already settled. Proceed\n" +
      "with YOUR bounded task using what your briefing gave you. If you are genuinely blocked,\n" +
      "STOP and report the blocker in your final message: name what you needed, why the briefing\n" +
      "did not cover it, and what you verified before stopping. The controller routes uncertainty\n" +
      "by type (factual to a research agent, fork-level to the decision tools); that routing is\n" +
      "not yours to perform.\n"
    );
    process.exit(2);
  });
}
