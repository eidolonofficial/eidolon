# Spec: eidolon selfcheck (v1 canary work item)

The small real change driven through the build pipeline to prove the spine.
This is also a genuine deliverable: the recursive-verification defense from the
design spec section 10 ("Eidolon's own release runs the pipeline against itself")
made into a runnable check.

## The six core areas

```yaml
objective: a script that verifies eidolon's own invariants in one command, so a
           regression in the repo's own hygiene is caught before release
commands:  node scripts/selfcheck.mjs        # checks the repo it lives in
structure: scripts/selfcheck.mjs (one file, no new dependencies, node built-ins only)
code_style: ES module, ASCII only, no em dashes, fail-loud with a non-zero exit on any failure
testing:   the script is self-validating - it runs against this repo and must report
           PASS on a clean tree; running it IS the acceptance check
boundaries:
  always:  use node built-ins only; exit non-zero on any failed invariant
  ask:     before adding any new dependency or new check category
  never:   pass a filename or path through a shell string; never auto-fix, only report
```

## What it checks

```yaml
hooks_parse:   every hooks/*.mjs passes `node --check`
settings_json: .claude/settings.json is valid JSON
no_em_dashes:  SKILL.md, references/*.md, hooks/*.md carry no em or en dash (U+2014 / U+2013)
```

## Done looks like

```yaml
runtime: `node scripts/selfcheck.mjs` prints a PASS line per invariant and exits 0
         on this clean repo; exits non-zero with the failing file when an invariant breaks
risk:    low. read-only over the repo. the one risk is the check tool itself running
         untrusted input through a shell, which the security swarm reviews for.
```
