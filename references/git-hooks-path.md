# Effective Git hook paths

Applies to Stage 1 reconnaissance, Stage 7 capture wiring, Stage 9 verification,
and the Stage 10 manifest, in both Claude Code and Codex. These are Git-native
hooks, not the host's lifecycle hooks. This contract covers working-tree capture;
receive-side push hooks run in the Git directory and need separate analysis.

## Read-only discovery

Resolve the installed skill directory and target project explicitly, then run:

```sh
node "<eidolon-skill>/scripts/inspect-git-hooks.mjs" "<repo>"
```

The inspector reads `git config --path --null --get core.hooksPath` first using
Git's effective configuration, not only local config. An unset key is distinct
from an error or empty value. It anchors discovery at the working-tree root
(or Git directory for a bare repository), then uses
`git rev-parse --path-format=absolute --git-path hooks`. Let Git handle relative
and absolute paths, tilde expansion, included/global/worktree configuration and
the common directory of linked worktrees. A `.git` file is not a missing repo.

Inventory only the returned `hooksPath`, excluding `.sample` files. Record the
configured value, effective directory and `postCommit` result. Never infer that
capture is missing from the absence of `.git/hooks/post-commit`. Do not execute
any discovered hook while reading or enumerating it.

## Preserve intent when wiring

Re-run discovery immediately before proposing changes. If the path differs from
reconnaissance, reconcile it and obtain approval for the actual destination.
Never overwrite an existing hook: read any dispatcher, preserve its existing
commands and order, and propose a minimal chained change for explicit approval.
A path outside the project or shared by worktrees may affect other repositories;
inspect it read-only and obtain approval for that scope before changing it.
Do not silently reset `core.hooksPath`, replace a hook manager, or write dead
code into `.git/hooks` as a fallback. A missing configured directory, `/dev/null`,
an unreadable directory or a config/query error needs a distinct finding, not an
automatic repair. Do not bypass host tool permissions to run discovery.

## Verification is two separate signals

```sh
node "<eidolon-skill>/scripts/inspect-git-hooks.mjs" "<repo>" --check-post-commit
```

This read-only check exits nonzero for missing, disabled, unreadable,
non-file or non-executable capture hooks and for unsupported bare capture repos.
It does not execute the hook, verify its contents, or prove the capture sinks
are healthy. A bare repo may be inventoried, but the supplied capture template
requires a working tree. Windows execution needs a real Git invocation as well
as the platform's file-access check.

Then inspect the effective dispatcher and match a recent commit to the cascade
log (`.claude/.memory-sync.log`) and the resulting output mutation. Alternatively
use an explicitly approved isolated test commit. A direct script run does not
prove Git wiring, and merely being inside a Git repository proves neither path
nor execution. No evidence means AMBIGUOUS. Record the exact verified
`postCommit.path` in the manifest, not an assumed default.

## Sources

- [Git hooks](https://git-scm.com/docs/githooks): effective path and hook working directory.
- [Git configuration](https://git-scm.com/docs/git-config#Documentation/git-config.txt-corehooksPath): overrides and relative paths.
- [Git rev-parse](https://git-scm.com/docs/git-rev-parse): Git path resolution and linked worktrees.
