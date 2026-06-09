// hooks/hook-integrity-guard.mjs
//
// Eidolon hook suite - PreToolUse(Bash). Blocks disabling, moving, or chmod of any
// hook, or changing the hooks path (design spec sections 10, 11). A wrong gate is
// fixed in the open, never routed around; the hooks are not optional.
//
// Covers the suite as a whole: removing the entire hooks directory disables every
// gate at once, so `rm -rf hooks` is as blocked as `rm hooks/guard.mjs`. A hooks
// directory nested in the source tree (src/hooks/) is application code and is not
// this guard's business (lib.mjs touchesHookSuite draws that line).
//
// I/O contract lives in hooks/lib.mjs: fail open on bad input; block via
// stderr + exit 2.

import { runHook, touchesHookSuite, block } from "./lib.mjs";

runHook((j) => {
  if (j.tool_name && j.tool_name !== "Bash") return;
  const cmd = String((j.tool_input || {}).command || "");
  const B = (why) => block("HOOK INTEGRITY GUARD", why);

  if (/core\.hooksPath\s*=/.test(cmd) || /git\s+config\b[^|;&\n]*hooksPath/i.test(cmd))
    B("changing the hooks path disables the suite. The hooks are not optional.");
  if (/\bchmod\b/i.test(cmd) && touchesHookSuite(cmd))
    B("chmod on a hook changes how it runs. Do not alter hook permissions.");
  if (/\b(?:mv|rm|rmdir|del|Remove-Item)\b/i.test(cmd) && touchesHookSuite(cmd))
    B("moving or deleting a hook (or the hooks directory) disables it. Fix a wrong gate in the open, do not remove it.");
});
