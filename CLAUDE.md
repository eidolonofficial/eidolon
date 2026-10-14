# Eidolon maintenance guide for Claude Code

This repository is the Eidolon skill. Read the existing code before changing it, keep its working
parts, and change only the requested scope. Loading this file is not an installation request: do not
launch setup or seat a persona because it loaded.

## Read before changing

```yaml
# why: each area has one owning file; reading it first stops a second, drifting copy of a rule
router:         SKILL.md (modes, invariants, "Read next" lists every reference)
hooks:          hooks/README.md, hooks/lib.mjs (the verdict contract), references/antibehavior-catalog.md
host_behavior:  references/current-platform-contract.md wins over dated claims elsewhere
dispatch_rules: references/conductor-standard.md sections 2 to 4; references/persona-template.md for agent files
installer:      scripts/install.mjs and its tests
```

## Gates

```yaml
# why: run these fresh after the last edit and quote the output; an earlier green proves nothing about it
tests:     node --test "hooks/*.test.mjs" "scripts/*.test.mjs"
selfcheck: node scripts/selfcheck.mjs
audit:     node scripts/eidolon-audit.mjs
readme:    node scripts/hooks-readme-check.mjs
personas:  node scripts/persona-lint.mjs references/personas/*.md
dashes:    node -e 'process.exit(/[\u2013\u2014]/.test(require("fs").readFileSync(process.argv[1],"utf8"))?1:0)' FILE
```

- Treat `hooks/README.md` as generated from the code: when a hook, evaluator or wiring entry changes, run `node scripts/hooks-readme-check.mjs` and fix the code or the README. Never silence the check.
- Never weaken a guard to make a test pass; fix a wrong gate in the open.
- Write no em or en dash in any file; selfcheck fails on one in SKILL.md, references and hooks docs.
- Bundles ship through Hearth from tagged commits. Do not hand-edit a bundle.
- Do not run installer writes without approval; preview first.
- Do not change visibility or rewrite history without authorization. Merge, release and publication follow the operator's current explicit instruction.
- Report what was executed separately from what was only inspected.

## Consent and boundaries

- Reuse the person's existing answers and explicit authorization; do not reopen settled scope.
- Preview installation paths and changes before writing; approval belongs to that exact plan.
- Require separate replacement consent and preserve the prior installation in backups.
- Keep Claude's native permission decisions intact; use `AskUserQuestion` when available, not as a substitute for host permission.
- If a native question control is unavailable, ask plainly; never invent a tool call or approval.
- Never weaken a guard, erase an approval boundary, or retry a denied action through another tool.
- Keep the controller's identity separate from every worker; a worker's failure must not clear another actor's state.
- Use subagents when parallel work, isolated context, specialist work, or independent verification adds evidence; work directly otherwise.
- Give each dispatched worker bounded scope and context; verify the returned state rather than repeating its report.
- Keep the Expediter controller-only; a prepared dispatch plan is not a launched worker.

## Memory and closeout

Write what broke to `docs/fixes` and what worked to `docs/insights`. Correct history with new superseding entries, not deletion. Retire guidance through an active index. Use only observed, approved memory integrations. Optional models and services need separate dependency and data-access approval.

The person makes the final call. Report the observed result, the checks that ran, and what remains unsure. A clean gate next to a broken result is not done.
