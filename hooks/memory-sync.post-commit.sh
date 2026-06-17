#!/bin/sh
# hooks/memory-sync.post-commit.sh
#
# Eidolon hook suite - the memory-sync AUTO-MINER. On every commit it fans out a
# prose memory capture (MemPalace) and a structural graph update (Graphify),
# detached so the commit returns immediately. ONE portable script, safe to wire
# on BOTH trigger legs at once (the dedup below makes a double-fire a no-op).
#
# === WHY git-native is the FOUNDATION, not a co-equal of the PostToolUse leg ===
# A Claude Code PostToolUse(Bash) hook fires only when the commit ran THROUGH the
# agent's tool call - and even then the harness is not guaranteed to invoke it
# (verified 2026-06-11 by a probe: a wired PostToolUse capture entry went
# uninvoked across multiple commits, while this same script ran clean when driven
# directly). A commit made by a human, a script, or a subagent never reaches that
# hook at all. THIS git-native post-commit fires on EVERY commit from ANY source.
# Wire it first; treat any PostToolUse leg as a convenience second trigger.
#
# === DEDUP: why two legs can't double-mine (concurrent capture corrupts) ===
# Two captures running at once against one prose store / graph can corrupt the
# vector index (an HNSW segment desync is the classic failure). Two guards keep
# the legs safe no matter which fires, or if both fire sub-seconds apart:
#   1. already-synced: sentinel's synced-head == HEAD -> already captured -> skip.
#   2. atomic lock: `mkdir` is atomic on every POSIX fs AND Windows git-bash, so
#      exactly one racer creates the lock dir and proceeds; the other skips. A
#      stale lock (>15 min, a killed run) is removed and the create retried once.
#
# === OBSERVABILITY: never silence the cascade ===
# Every decision logs to .claude/.memory-sync.log. A cascade silenced into
# /dev/null once hid a non-firing trigger for 13 commits (2026-06-11 fix log);
# the silence is what cost the time, not the bug. Log the fire, the skip, and
# each stage's exit so a miss is visible at a glance.
#
# === INSTALL (the installer / Stage 7 fills these) ===
# 1. Copy to the repo's git hook path:
#      - simplest: .git/hooks/post-commit  (chmod +x); OR
#      - clone-portable: a tracked dir wired via `git config core.hooksPath <dir>`
#        (the tracked copy survives clones; .git/hooks/ never does).
# 2. Fill <CAPTURE_CMD> + <WING> with the repo's VERIFIED MemPalace invocation
#    (confirm with `--help` first); graphify auto-detects on PATH.
# 3. Optional second leg: also wire a PostToolUse(Bash, git commit) hook that
#    runs this same script. The dedup makes the overlap safe.

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
HEAD_SHA=$(git rev-parse HEAD 2>/dev/null) || exit 0
CLAUDE_DIR="$REPO_ROOT/.claude"
LOG="$CLAUDE_DIR/.memory-sync.log"
SENTINEL="$CLAUDE_DIR/.memory-synced-head"
LOCK="$CLAUDE_DIR/.memory-sync.lock"   # a DIR: mkdir is the atomic lock primitive
mkdir -p "$CLAUDE_DIR" 2>/dev/null
log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$LOG" 2>/dev/null; }

# Dedup leg 1: this exact HEAD was already captured.
if [ -f "$SENTINEL" ] && [ "$(cat "$SENTINEL" 2>/dev/null)" = "$HEAD_SHA" ]; then
  log "SKIP already-synced $HEAD_SHA"
  exit 0
fi

# Dedup leg 2: atomic lock. mkdir succeeds for exactly one racer; the loser skips.
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -prune -mmin +15 2>/dev/null)" ]; then
    log "STALE lock -> removing and retrying once"
    rm -rf "$LOCK" 2>/dev/null
    mkdir "$LOCK" 2>/dev/null || { log "SKIP locked (lost the retry race)"; exit 0; }
  else
    log "SKIP locked (cascade in flight on the other leg)"
    exit 0
  fi
fi

# Detached so the commit returns now; the lock is released inside the subshell.
log "MINING $HEAD_SHA"
(
  # structural view: cheap AST update, never --mode deep by default.
  if command -v graphify >/dev/null 2>&1; then
    graphify --update >/dev/null 2>&1
    log "graphified exit=$?"
  fi

  # primary structural view: refresh the codebase-memory-mcp index when this repo is
  # configured for it (.claude/codebase-memory.json present, binary on PATH). Local C
  # indexer, no LLM/token cost. persistence:false refreshes only the ~/.cache DB the
  # codebase-memory-orient hook reads; the .codebase-memory/graph.db.zst team artifact is
  # gitignored, so it is not re-churned on every commit. A repo without it is unaffected.
  if [ -f "$CLAUDE_DIR/codebase-memory.json" ] && command -v codebase-memory-mcp >/dev/null 2>&1; then
    codebase-memory-mcp cli index_repository "{\"repo_path\":\"$REPO_ROOT\",\"persistence\":false}" >/dev/null 2>&1
    log "cbm-reindexed exit=$?"
  fi

  # prose view: the repo's verified MemPalace capture command. Leave the line
  # commented until <CAPTURE_CMD>/<WING> are filled, so a fresh install does not
  # fail on a placeholder.
  # <CAPTURE_CMD> --wing <WING> >/dev/null 2>&1; log "mined exit=$?"

  # record the synced head so the next commit's dedup leg 1 can short-circuit
  printf '%s\n' "$HEAD_SHA" > "$SENTINEL" 2>/dev/null
  rm -rf "$LOCK" 2>/dev/null
  log "DONE $HEAD_SHA"
) &

exit 0
