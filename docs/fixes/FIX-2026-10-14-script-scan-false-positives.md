# FIX: the script scan judged literal tokens, not resolved targets

Date: 2026-10-14. Found by the round-5 execution review before release; fixed in round 6.

## Failure and cause

Round 5 taught guard-bash to read a script named on the command line one level deep. The
first cut swept every string literal in a file that had any file-system write call and
turned each protected-looking token (docs, hooks, .git) into a write fact. Ordinary scripts
therefore blocked: `node gen-docs.js` writing `docs/api.md`, `npm run docs`,
`python clean_build.py` removing `docs/_build`, and from this repository
`node scripts/install.mjs --help` and `node hooks/lib.mjs`, all exit 2. A second gap: the
PowerShell call operator with a subexpression target, `& (Get-Command git) commit -n -m x`,
passed silently while the README said the call-operator gap was closed.

## Repair

Each literal target of a file call is resolved and judged by protectedKind with the call's
operation (delete, move, copy, write); literals consumed by a resolved target leave the
sweep; a protected token left over becomes a RUNTIME ask, and only when some file call's
target is not a literal. A `&` target that starts with `(`, `$(` or `@` is an opaque step
that asks. In the same round: concatenated literal paths are judged, config `[include]`
aliases are followed one level, `GIT_CONFIG_KEY_n` aliases are resolved, a whole-tree check
spawns git twice instead of four times, `~/.gitconfig` and `~/.config/git/config` are
outside shapes, and the raw U+FFFD and U+FEFF in the source are written as escapes.

## Verification

`hooks/review-round6-2026-10-14.test.mjs`: 8 red before the fix, 9 green after (T2b pins
that this repository's own gate commands stay silent). Full suite 326 pass, 0 fail;
selfcheck, audit and hooks-readme-check PASS. A controller probe on 2026-10-14 against the
real hooks: `node gen-docs.js` exit 0 and silent, `node clean.js` exit 2 DELETION GUARD,
`& (Get-Command git) commit -n -m x` an ask from RUNTIME INTEGRITY GUARD, `npm test`
silent. What remains is listed in hooks/README.md under Known gaps: script_reach,
outside_scripts and alias_includes.
