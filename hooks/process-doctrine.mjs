// hooks/process-doctrine.mjs
//
// Eidolon hook suite - SessionStart. Surfaces Eidolon's process doctrine (the learned
// rules in references/process-doctrine.md) as context at the start of a session, so the
// run begins with them in view. Advisory only; never blocks. Fail open.

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  // input is ignored; this hook only injects context
  const doctrine = [
    "Eidolon process doctrine (calibrate effort to risk):",
    "- Verification weight follows risk. A cold-review subagent (and the three-layer",
    "  protocol) is for risky code: an attack surface, security-sensitive, or high blast",
    "  radius. For routine doc / wiring / config edits, lean on the fast deterministic",
    "  checks (selfcheck, eidolon-audit, persona-lint, dash scan, node --check, the test",
    "  suite). One review pass per logical unit, not per file edit.",
    "- Mind background work. A launched workflow or background task is minded until it is",
    "  confirmed done or confirmed hung: poll its status, check liveness between windows,",
    "  intervene on a hang. Never end a turn leaving one running unmonitored; do not",
    "  block-wait idly when you can keep working and check it at the dependency point.",
  ].join("\n");
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: doctrine },
  }));
  process.exit(0);
});
