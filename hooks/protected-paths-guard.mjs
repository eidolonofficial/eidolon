// hooks/protected-paths-guard.mjs
//
// Eidolon hook suite - PreToolUse(Bash). Blocks a destructive op on a protected path
// (design spec sections 10, 11). Protected by default: the git dir, the three records,
// the hooks, the settings file, and the persona template. State an independent backup,
// a rollback path, and a post-op verify, or do not run it.
//
// I/O contract mirrors uncertainty-guard.mjs: fail open; block via stderr + exit 2.

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let j;
  try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()); }
  catch { process.exit(0); }
  if (j.tool_name && j.tool_name !== "Bash") process.exit(0);
  const cmd = String((j.tool_input || {}).command || "");

  const PROTECTED = /(^|[\/\\\s'"])\.git(\b|[\/\\])|docs[\/\\](fixes|insights|decisions)\b|hooks[\/\\]|\.claude[\/\\]settings\.json|references[\/\\]persona-template\.md/i;
  const DESTRUCTIVE = /\b(rm|del|Remove-Item|truncate)\b/i;

  if (DESTRUCTIVE.test(cmd) && PROTECTED.test(cmd)) {
    process.stderr.write(
      "PROTECTED PATHS GUARD [BLOCKED - fix and retry]: a destructive op on a protected " +
      "path (.git, a record, a hook, settings.json, or the persona template).\n" +
      "State an independent backup, a rollback path before it runs, and a post-op " +
      "verify, or do not run it.\n");
    process.exit(2);
  }
  process.exit(0);
});
