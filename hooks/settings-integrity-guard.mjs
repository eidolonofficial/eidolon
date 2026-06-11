// hooks/settings-integrity-guard.mjs
//
// Eidolon hook suite - PreToolUse(Write, Edit). Blocks a settings edit that
// silences the suite from inside: introducing "disableAllHooks": true into a
// Claude settings file, or dropping a manifest-wired hook entry from the wiring.
//
// This is the content half of a two-layer floor. The permissions.deny rules in
// .claude/settings.json are the other half: they are evaluated by Claude Code
// itself, so they survive disableAllHooks, but they match tool + path/command,
// never file content. "This write introduces disableAllHooks" is a content fact
// only a hook can see, so it lives here. (Layer split verified against the
// official permissions docs, 2026-06-11: deny rules outrank allow at every
// settings level, and hook decisions cannot bypass them.)
//
// The manifest cross-check closes the delete-the-entry variant of the same
// attack: the target's .claude/eidolon-manifest.yaml lists the wired hooks, so
// a settings write that drops a previously wired hook entry is refused.
// Unwiring a hook is an explicit human decision, made in the open by updating
// the manifest first. No manifest (this repo, a fresh target) means no
// cross-check: fail open, like the rest of the suite.
//
// I/O contract lives in hooks/lib.mjs: fail open on bad input; block via
// stderr + exit 2. Wire standalone or via hooks/guard-write.mjs.

import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { runHook, emitVerdict } from "./lib.mjs";

const SETTINGS = /(^|[\/\\])\.claude[\/\\]settings(\.local)?\.json$/i;

// The wired-hook list from the target's manifest: every hooks/<file> with a
// hook extension named anywhere in .claude/eidolon-manifest.yaml. An absent or
// unreadable manifest yields an empty list (no cross-check).
function manifestHooks(cwd) {
  try {
    const text = readFileSync(join(cwd, ".claude", "eidolon-manifest.yaml"), "utf8");
    const refs = text.match(/hooks[\/\\][A-Za-z0-9_.-]+\.(?:mjs|cjs|ps1|sh)\b/g) || [];
    return [...new Set(refs.map((p) => p.split(/[\/\\]/).pop()))];
  } catch { return []; }
}

// Pure verdict for one payload.
export function evalSettingsIntegrity(j) {
  const name = String(j.tool_name || "");
  if (name !== "Write" && name !== "Edit") return null;
  const ti = j.tool_input || {};
  const given = String(ti.file_path || ti.path || "");
  if (!SETTINGS.test(given)) return null;
  const next = String(ti.content != null ? ti.content : ti.new_string != null ? ti.new_string : "");
  const B = (why) => ({ kind: "block", label: "SETTINGS INTEGRITY GUARD", why });

  if (/"disableAllHooks"\s*:\s*true/.test(next))
    return B("this introduces disableAllHooks: true, which silences the entire hook suite. " +
      "The hooks are not optional; fix a wrong gate in the open instead of switching the suite off.");

  // For a Write the before-state is the file on disk; for an Edit it is the
  // span being replaced. A fresh or unreadable settings file has no wiring to drop.
  const cwd = String(j.cwd || process.cwd());
  const prev = name === "Edit"
    ? String(ti.old_string || "")
    : (() => { try { return readFileSync(resolve(cwd, given), "utf8"); } catch { return ""; } })();
  if (!prev) return null;

  for (const hook of manifestHooks(cwd)) {
    if (prev.includes(hook) && !next.includes(hook))
      return B("this drops the wired hook " + hook + " from the settings file, and the manifest " +
        "(.claude/eidolon-manifest.yaml) says it is part of the suite. Unwiring a hook is an " +
        "explicit human decision: update the manifest first, in the open.");
  }
  return null;
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("settings-integrity-guard.mjs");
if (invokedDirectly) runHook((j) => emitVerdict(evalSettingsIntegrity(j)));
