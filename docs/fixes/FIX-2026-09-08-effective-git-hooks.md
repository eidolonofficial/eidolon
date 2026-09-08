# FIX: Inspect the effective Git capture hook, not a superseded default

Issue: https://github.com/eidolonofficial/eidolon/issues/4

## Failure and cause

Stage 1 listed only `.git/hooks`, even when `core.hooksPath` selected a tracked
hook directory. Stage 9 reported a valid post-commit path from Git repository
membership alone, including when no capture hook existed. Stage 7 installation
instructions and Stage 10's manifest also encouraged the assumed default.

A disposable repository reproduced both defects: a tracked `.githooks/post-commit`
actually fired on a Git commit while the original inventory returned nothing;
after removal, the original verification command still reported a valid path.

## Repair

Add a read-only inspector that reads effective configuration first and asks Git
for its hooks path. Use it consistently in reconnaissance, capture wiring,
verification, the manifest, the Codex adapter, and capture installation guidance.
Distinguish missing, disabled, inaccessible and invalid states. Preserve existing
hooks and dispatchers; never silently reset config or redirect installation.
Path/readability/executable checks are not proof of capture: require independent
commit/cascade and output evidence before reporting the feature healthy.

No policy guard, permission floor or hook execution behavior is weakened. The
shell capture template changes only its installation comments. No existing user
project or installed capture hook is modified by this fix.

## Verification

`node --test scripts/inspect-git-hooks.test.mjs` covers configured/default paths,
tracked hooks firing via real commits, nested calls, spaces, absolute/shared
paths, global and included config, tilde expansion, linked worktrees and their
local overrides, missing/disabled/invalid hooks and unsupported bare capture.
The documentation regression fails on the original Stage 1 instructions.
The existing three-platform CI now includes this suite. The full suite,
selfcheck and repository audit remain required; no live Claude/Codex session
certification is inferred from these tests.
