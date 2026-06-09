// hooks/deletion-guard.mjs
//
// Eidolon hook suite - PreToolUse(Bash). Walls outright deletion of the append-only
// records (the fix, insight, and decision logs) via a shell command (design spec
// sections 10, 11). The records never retire, cap, or auto-archive; removal requires
// an explicit human decision, never a command. (The append-only-record-guard covers
// Write/Edit; this covers rm/del/Remove-Item.)
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

  const RECORD = /docs[\/\\](fixes|insights|decisions)\b|(^|[\/\\\s'"])DECISIONS?\.md\b/i;
  const DELETE = /\b(rm|del|Remove-Item)\b/i;

  if (DELETE.test(cmd) && RECORD.test(cmd)) {
    process.stderr.write(
      "DELETION GUARD [BLOCKED - fix and retry]: this deletes an append-only record " +
      "(a fix, insight, or decision log).\n" +
      "The records never retire, cap, or auto-archive. Removal requires an explicit " +
      "human decision, never a command.\n");
    process.exit(2);
  }
  process.exit(0);
});
