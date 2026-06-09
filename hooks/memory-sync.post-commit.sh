#!/bin/sh
# hooks/memory-sync.post-commit.sh
#
# Eidolon hook suite - a git post-commit template. On every commit, fan out a prose
# memory capture and a structural graph update, detached and resource-guarded so the
# rebuilds do not pile up (design spec section 11; mirrors the installer Stage 7
# dual-capture). It writes a synced-head sentinel so a later run can tell what was
# captured.
#
# Install: copy to .git/hooks/post-commit and `chmod +x`, or point the harness at it.
# Fill the two capture commands with the target repo's verified invocations (the
# MemPalace capture command and the Graphify CLI), confirmed with --help first.

# why: graph and memory rebuilds are CPU-heavy and can saturate; guard before firing.
_ok() {
  # Replace with a real check, e.g. load under half the cores, memory free, and no
  # capture already running (a pgrep dedup). Default: allow.
  return 0
}

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
HEAD_SHA=$(git rev-parse HEAD 2>/dev/null) || exit 0

if _ok; then
  (
    # structural view: cheap AST update, never --mode deep by default
    command -v graphify >/dev/null 2>&1 && graphify --update >/dev/null 2>&1 &

    # prose view: fill in the verified MemPalace capture command for this repo
    # <mempalace-capture-cmd> >/dev/null 2>&1 &

    # synced-head sentinel: record what was captured, so a later run can tell
    mkdir -p "$REPO_ROOT/.claude" 2>/dev/null
    printf '%s\n' "$HEAD_SHA" > "$REPO_ROOT/.claude/.memory-synced-head" 2>/dev/null
  ) &
fi

exit 0
