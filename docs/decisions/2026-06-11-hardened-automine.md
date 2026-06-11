# Decision log: 2026-06-11 the memory-sync auto-miner, hardened to a standard

Append-only. Stage 7's dual-capture fan-out was a sound idea wired naively. A
session that built, broke, and repaired the same auto-miner in a live repo
(fraud-forensic-replay) surfaced three failure modes the template walked into.
This folds those fixes back into the eidolon framework so every repo it sets up
gets the hardened version, not the one that has to be re-learned.

## What the framework shipped before

`hooks/memory-sync.post-commit.sh` was detached and resource-guarded with a stub
`_ok()`, fired `graphify --update` + a `<mempalace-capture-cmd>` placeholder, and
wrote a synced-head sentinel. Stage 7 described two legs (plain-git post-commit
and a Claude Code PostToolUse hook) as co-equal paths that "fire the SAME two
captures." Correct in spirit; missing the three guards that keep it honest under
real conditions.

## The three failure modes (each field-proven, not theorized)

```yaml
1_invocation:  the PostToolUse leg is NOT a reliable trigger. A probe wired an
               unconditional log line into the cascade and watched it stay silent
               across multiple real commits while the same script ran clean when
               driven by hand. The harness did not invoke the hook. And a commit
               made by a human, a script, or a subagent never reaches a PostToolUse
               hook at all. => git-native .git/hooks/post-commit is the FOUNDATION;
               the PostToolUse leg is a convenience, never the load-bearing one.
2_double_mine: two legs firing sub-seconds apart both passed a Test-Path/started a
               capture; concurrent captures against one prose store corrupted the
               vector index (an HNSW segment desynced from sqlite; the palace
               needed a full 30k-drawer rebuild). A check-then-write lock is a
               TOCTOU race, not a lock. => an ATOMIC lock (mkdir on POSIX/git-bash,
               New-Item CreateNew on PowerShell) plus an already-synced sentinel
               check: a double-fire is a logged no-op.
3_silence:     the cascade was originally silenced end-to-end into /dev/null. A
               `git -C <path> commit` matcher bug then left the sync un-fired for
               13 commits before a session-start drift alarm caught it. The silence
               cost the time, not the bug. => log the fire, the skip, and each
               stage exit to .claude/.memory-sync.log.
```

## The decision

One portable `hooks/memory-sync.post-commit.sh`, safe to wire on both legs at
once, embodying all three guards. `mkdir` as the atomic-lock primitive keeps it
portable across every platform git runs on (Linux, macOS, Windows git-bash) -
cleaner than the Windows-specific two-mode PowerShell original it generalizes.
The installer fills only the two capture placeholders (`<CAPTURE_CMD>`, `<WING>`);
the lock, dedup, logging, and sentinel ship pre-wired. Stage 7 in SKILL.md now
teaches foundation / dedup / observability as the pattern, not a footnote.

## Provenance

The lessons were paid for in fraud-forensic-replay, recorded there in
`docs/fixes/FIX-2026-06-11-postcommit-cascade-not-invoked.md` (the invocation +
git-native-foundation lesson) and the palace-rebuild repair (the concurrent-write
corruption). This decision graduates them from one repo's scar tissue to the
framework's default.
