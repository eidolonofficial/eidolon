# FIX-2026-06-16 — touchesHookSuite false-positive on the vendored evolve engine

Append-only. Records a **beneficial** change to a governance guard (fewer false catches, never
fewer true ones), as the SKILL.md INVARIANTS `orchestration.authority` clause requires: the
changed logic was executed against the exact cases at stake, before and after, and the result is
disclosed here.

## The defect

`hooks/lib.mjs` `touchesHookSuite(cmd)` decides whether a Bash command touches Eidolon's
governance hook suite; `protected-paths-guard.mjs` and `hook-integrity-guard.mjs` both call it and
hard-block (exit 2) when it is true. Its matcher fires on a `hooks/` path segment or a
`hooks/<file>.(mjs|cjs|ps1|sh|py)` anywhere in the command.

Vendoring the ASI-Evolve engine (`engine/asi-evolve/`) and its on-demand venv (`engine/.venv/`)
introduced third-party `hooks/` paths that are **not** Eidolon's suite. pip alone vendors
`pyproject_hooks/` and `requests/hooks.py`; faiss / sentence-transformers bring more. So a routine
cleanup inside the engine venv was hard-blocked as if it were tampering with the governance suite.

Observed BEFORE the fix (executed):

```
TRIP  rm engine/.venv/lib/python3.11/site-packages/pip/_vendor/pyproject_hooks/_impl.py
TRIP  cp hooks/guard-bash.mjs engine/asi-evolve/x        (correctly trips: names a real hook)
TRIP  rm hooks/guard-bash.mjs                            (correctly trips)
```

## The fix

Neutralize ONLY `engine/`-prefixed path tokens before testing, then run the existing matcher on
the remainder. A command that also names a real governance hook outside `engine/` keeps that
token and still trips — only the vendored-tree false positive is removed.

```js
const ENGINE_TOKEN = /(^|[\s'"=:;&|(])(?:\.[\/\\])?engine[\/\\][^\s;&|]*/gi;
export function touchesHookSuite(cmd) {
  const scrubbed = String(cmd).replace(ENGINE_TOKEN, "$1 ");
  return HOOKS_SEGMENT.test(scrubbed) || HOOKS_GOV_FILE.test(scrubbed);
}
```

## Proof (executed AFTER the fix)

```
pass  rm -rf engine/.venv
pass  rm engine/.venv/lib/python3.11/site-packages/pip/_vendor/pyproject_hooks/_impl.py
pass  rm engine/asi-evolve/scripts/evolve-db
pass  find engine/.venv -path '*/hooks/*' -delete
TRIP  rm hooks/guard-bash.mjs            (true catch preserved)
TRIP  chmod -x hooks/lib.mjs             (true catch preserved)
TRIP  cp hooks/guard-bash.mjs engine/asi-evolve/x   (true catch preserved: real-hook token survives)
TRIP  rm engine/x; rm hooks/real.mjs     (true catch preserved across a separator)
```

Pinned as a regression in `hooks/hooks.test.mjs` ("touchesHookSuite exempts the vendored evolve
engine tree and its venv, but keeps the true catch"). The disabling/loosening of enforcement is
NOT what happened here: every real governance-hook catch still blocks; only a vendored-tree
false positive was removed.
