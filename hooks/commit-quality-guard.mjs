// hooks/commit-quality-guard.mjs
//
// Eidolon hook suite - PreToolUse(Bash). Blocks the bypasses that dodge the hook
// suite or rewrite history to hide it (design spec sections 10, 11). A wrong gate
// gets fixed in the open, not quietly routed around.
//
// Wire under PreToolUse matcher "Bash". I/O contract mirrors uncertainty-guard.mjs:
// fail open on bad input; block via stderr + exit 2.

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let j;
  try { j = JSON.parse((raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()); }
  catch { process.exit(0); }

  const ti = (j && j.tool_input) || {};
  const cmd = String(ti.command || "");
  if ((j.tool_name && j.tool_name !== "Bash") || !/\bgit\b/.test(cmd)) process.exit(0);

  const block = (why) => {
    process.stderr.write("COMMIT QUALITY GUARD [BLOCKED - fix and retry]: " + why + "\n");
    process.exit(2);
  };

  if (/git\s+commit\b[^]*--no-verify\b/.test(cmd))
    block("git commit --no-verify skips the hooks. Fix the underlying issue instead of bypassing the gate.");
  if (/--no-gpg-sign\b/.test(cmd))
    block("--no-gpg-sign bypasses signing. Do not skip it unless the user explicitly asked.");
  if (/git\s+push\b[^]*(?:--force\b|\s-f\b)/.test(cmd) && !/--force-with-lease\b/.test(cmd))
    block("git push --force can clobber remote history. Use --force-with-lease, and only with an independent backup.");
  if (/core\.hooksPath\s*=/.test(cmd))
    block("overriding core.hooksPath disables the hook suite. The hooks are not optional.");
  if (/git\s+(?:filter-branch\b|filter-repo\b)/.test(cmd))
    block("history surgery (filter-branch / filter-repo) rewrites the record. Do this only in the open, with a backup, when explicitly asked.");

  process.exit(0);
});
