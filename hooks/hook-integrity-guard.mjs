// hooks/hook-integrity-guard.mjs
//
// Eidolon hook suite - PreToolUse(Bash). Blocks disabling, moving, or chmod of any
// hook, or changing the hooks path (design spec sections 10, 11). A wrong gate is
// fixed in the open, never routed around; the hooks are not optional.
//
// I/O contract mirrors the lineage uncertainty-guard.mjs: fail open on bad input;
// block via stderr + exit 2.

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let j;
  try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()); }
  catch { process.exit(0); }
  if (j.tool_name && j.tool_name !== "Bash") process.exit(0);
  const cmd = String((j.tool_input || {}).command || "");
  const block = (why) => {
    process.stderr.write("HOOK INTEGRITY GUARD [BLOCKED - fix and retry]: " + why + "\n");
    process.exit(2);
  };

  if (/core\.hooksPath\s*=/.test(cmd) || /git\s+config\b[^]*hooksPath/i.test(cmd))
    block("changing the hooks path disables the suite. The hooks are not optional.");
  if (/\bchmod\b[^]*hooks[\/\\]/i.test(cmd))
    block("chmod on a hook changes how it runs. Do not alter hook permissions.");
  if (/\b(mv|rm|Remove-Item|del)\b[^]*hooks[\/\\]\S*\.(mjs|cjs|ps1|sh|py)\b/i.test(cmd))
    block("moving or deleting a hook disables it. Fix a wrong gate in the open, do not remove it.");

  process.exit(0);
});
