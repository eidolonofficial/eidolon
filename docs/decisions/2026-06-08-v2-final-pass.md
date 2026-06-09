# Decision log: 2026-06-08 v2 final end-to-end pass

Append-only. The capstone run: a real change driven through the now-complete
pipeline, whose deliverable audits that the whole v2 build coheres.

## The work item

`scripts/eidolon-audit.mjs` (with `.test.mjs`): a harness-integrity checker. It is
the recursive-verification antibehavior defense (design spec section 10) applied to
the whole harness, and a lasting asset:

```yaml
checks:
  reference_integrity: every references/, hooks/, and scripts/ path SKILL.md names exists
  persona_rail:        every persona file passes the anti-synthetic rail (anchor + evidence contract)
  settings_refs:       every hook path .claude/settings.json wires exists
runtime: node scripts/eidolon-audit.mjs -> PASS when the harness is coherent, non-zero with the problem
```

## How it ran (the assembled pipeline)

```yaml
specify_plan:  a spec for the audit; tier standard; the full-stack engineer persona seated
build_tdd:     test written first, RED before the impl existed (ERR_MODULE_NOT_FOUND),
               then implemented to green, with the engineering persona seated so the
               conduct guard would catch a stub
review_verify: the audit's own integration test ("auditRepo reports the build as
               coherent") IS the cold check: it runs the deliverable against the real
               repo, and it caught two real bugs (below)
fix_loop:      two fix iterations, both behavioral bugs caught at build time
close:         this entry; the audit confirms the complete v2 build coheres
```

## Two real bugs the audit found in itself, both fixed

```yaml
extractRefs_overmatch: the reference extractor matched references/PARTNER-NOTES-template.md
                       as a substring of an external path (~/.claude/skills/.../references/...)
                       in a Stage 3 `test -f && cp` snippet, flagging an intentionally external,
                       guarded file as a missing repo reference. Fixed with a negative lookbehind
                       so it only matches repo-relative paths.
persona_lint_cli_leak: persona-lint.mjs ran its CLI on import, so invoking eidolon-audit (which
                       imports validatePersona) with a path argument made persona-lint try to read
                       the repo directory as a file (EISDIR). Fixed by guarding the CLI behind an
                       invoked-directly check, so an imported module never runs its CLI.
```

Neither was a syntax error; both were behavioral, surfaced only by running the
deliverable against the real artifact. This is the fix-loop working at build time.

## Outcome

```yaml
tests:    persona-lint 3/3, eidolon-audit 2/2
audit:    PASS both invocation forms; the complete v2 build is coherent
personas: all 14 (12 base + 2 example hires) pass the rail
selfcheck: PASS (no regression)
```

## Decision

v2 is built, validated step by step, and now confirmed coherent end to end by a
runnable audit. The eidolon-audit checker ships as a standing integrity gate. The
only thing beyond v2 remains the cross-session swarm graduation, decided per run.
