# Repository instructions

Eidolon supports Claude Code and Codex. Keep policy logic shared; host adapters
must preserve blocks and explicitly report unsupported behavior.

- Run `node --test hooks/*.test.mjs scripts/*.test.mjs` before claiming tests pass.
- Run `node scripts/selfcheck.mjs` and `node scripts/eidolon-audit.mjs`.
- For Codex integration, read `codex/README.md` and `codex/SKILL.md`.
- Keep the original root `SKILL.md` as the Claude process specification.
- Never weaken a guard to make a compatibility test pass.
- Do not run installer writes without approval; preview first.
- Do not change visibility, rewrite history, merge or publish a release without authorization.
- Report what was executed separately from what was only inspected.
