// hooks/hook-integrity-guard.mjs
//
// Eidolon hook suite - PreToolUse(Bash, Write, Edit). Blocks disabling, moving, chmod
// of any hook and changing the hooks path (design spec sections 10, 11). Overwriting a hook
// asks the human when the controller does it and blocks a worker. A wrong gate is fixed in
// the open, never routed around; the hooks are not optional.
//
// Covers the suite as a whole: removing the entire hooks directory disables every
// gate at once, so `rm -rf hooks` is as blocked as `rm hooks/guard.mjs`. Replacing
// a hook is the ask/block case: `cp x hooks/lib.mjs`, `> hooks/lib.mjs`, `sed -i`, or a Write/Edit whose path is
// under hooks/ or inside any directory named hooks that holds a wired guard. A hooks
// directory nested in the source tree (src/hooks/) is application code and is not
// this guard's business (shell-operation.mjs protectedKind draws that line).
//
// I/O contract lives in hooks/lib.mjs: fail open on bad input; block via
// stderr + exit 2. Wire standalone or via hooks/guard-bash.mjs. guard-write.mjs reaches the
// Write/Edit branch through runtime-integrity-guard.mjs.

import { existsSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { runHook, emitVerdict, withoutMessage } from "./lib.mjs";
import { actorIdentity, fileTarget, policyRoot } from "./operation.mjs";
import { gitOperations, overridesHooksPath, shellPathFacts, tolerant } from "./shell-operation.mjs";

// The proposed path is a hook file: under the project hooks/ (or .git/hooks/), or inside a
// directory named hooks that holds a wired guard. The cwd comes from the event, never the process.
function writesHookFile(j) {
  let root, path;
  try { root = policyRoot(j); path = fileTarget(j); } catch { return false; } // runtime-integrity-guard owns path escapes
  if (/^(?:\.git\/)?hooks\//i.test(relative(root, path).replace(/\\/g, "/"))) return true;
  for (let dir = dirname(path); dir !== root && dir !== dirname(dir); dir = dirname(dir))
    if (basename(dir).toLowerCase() === "hooks" && ["guard-bash.mjs", "guard-write.mjs"].some((f) => existsSync(join(dir, f)))) return true;
  return false;
}

// Pure verdict for one payload; first matching check wins.
export const evalHookIntegrity = tolerant((j) => {
  const B = (why) => ({ kind: "block", label: "HOOK INTEGRITY GUARD", why });
  // Editing a hook is the controller's call, made with the human watching; a worker never edits a gate.
  const E = (why) => actorIdentity(j).worker ? B(why) : { kind: "ask", label: "HOOK INTEGRITY GUARD", why: "editing the governance hooks; confirm" };
  if (j.tool_name === "Write" || j.tool_name === "Edit")
    return writesHookFile(j) ? E("a hook file cannot be rewritten by a worker. Return the change to the controller; do not edit the gates.") : null;
  if (j.tool_name && j.tool_name !== "Bash") return null;
  const cmd = String((j.tool_input || {}).command || "");
  const facts = shellPathFacts(cmd, j.cwd || process.cwd(), policyRoot(j), j.shell_language);
  const suite = facts.some((f) => f.kind === "hooks" || f.kind === "authority");
  const bare = withoutMessage(cmd); // the raw nets below must not read a commit message

  if (/core\.hooksPath\s*=/.test(bare) || /git\s+config\b[^|;&\n]*hooksPath/i.test(bare) || gitOperations(cmd, j.cwd, j.shell_language).some(overridesHooksPath))
    return B("changing the hooks path disables the suite. The hooks are not optional.");
  if ((/\bchmod\b/i.test(bare) && suite) || facts.some((f) => f.op === "attr" && (f.kind === "hooks" || f.kind === "authority")))
    return B("chmod on a hook changes how it runs. Do not alter hook permissions.");
  if ((/\b(?:mv|rm|rmdir|del|Remove-Item|Move-Item|Rename-Item|mi|rni)\b/i.test(bare) && suite) || facts.some((f) => f.kind === "hooks" && f.op === "delete"))
    return B("moving or deleting a hook (or the hooks directory) disables it. Fix a wrong gate in the open, do not remove it.");
  if (facts.some((f) => f.kind === "hooks" && f.op))
    return E("this shell operation overwrites, appends to or re-permissions a hook file. A worker cannot edit the gates; return the change to the controller.");
  return null;
});

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("hook-integrity-guard.mjs");
if (invokedDirectly) runHook((j) => emitVerdict(evalHookIntegrity(j)));
