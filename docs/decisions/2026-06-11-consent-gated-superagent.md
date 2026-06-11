# Decision log: 2026-06-11 the consent-gated superagent increment

Append-only. Records the increment that completes the autonomy pattern:
autonomous execution, consent-gated side effects. One /eidolon run stands up
the entire environment and pauses at exactly four kinds of moment (install,
seat, deploy, irreversible). Built in the dependency order: floor and hole,
dispatchers, the consent tier, skill-scout, the primary persona.

## What was built

1. **The two-layer floor (the disableAllHooks hole, closed).** Layer A:
   `permissions.deny` rules in .claude/settings.json, evaluated by Claude
   Code's own parser so they survive a hooks kill switch (force push,
   hooksPath override, history surgery, any write to settings.local.json).
   Glob word-boundary semantics were verified against the official permissions
   docs before shipping, so `--force-with-lease` stays allowed, matching the
   hook tier. Layer B: settings-integrity-guard blocks the content facts no
   permission rule can see: a settings edit introducing `disableAllHooks:
   true`, or one dropping a hook entry the target manifest lists as wired (the
   delete-the-entry variant). Fails open when no manifest exists.

2. **The dispatcher consolidation (one spawn, not thirteen).** Every guard now
   exports a pure evaluator and keeps its standalone entry point;
   guard-bash.mjs and guard-write.mjs run the evaluators in the old wired
   order. Proof the consolidation changed nothing but spawn count: every
   pre-existing test passed unchanged before the re-tier commit. advisor-guard
   stays on its own matcher (it keys on the tool name).

3. **The ask tier (the consent primitive).** lib.mjs ask() emits the
   documented permissionDecision "ask" JSON. Precedence in runSuite: block
   halts, ask escalates, advisories ride along. Re-tiered to ask: the
   visual-evidence gate (the human approving IS the final eyes) and
   irreversible-without-safety-net (the line is conditional; the operator's
   yes attests the safety nets the guard cannot see). Unconditional lines
   (hook tampering, history surgery, bypass flags, shipped stubs) stay hard
   blocks, and a block outranks an ask, so a bypass cannot be consented
   through (pinned by test).

4. **skill-scout (discovery, decision, install are three actors).** A
   read-only agent (references/agents/skill-scout.md, installed by Stage 5 as
   .claude/agents/skill-scout.md in targets) discovers candidates for ONE
   named gap and returns evidence: verbatim frontmatter, source, license,
   install kind, injection flag. The controller holds the AskUserQuestion gate
   and the install, then verifies before trusting and records (CREDITS +
   decision log). The split is mechanical: a subagent cannot pause the human.
   Candidate SKILL.md content is untrusted data; fire drills cover injection,
   missing license, and the no-named-gap case.

5. **The primary persona (Stage 2.5).** The user's own house agent, built by
   the same machine that builds the swarms and held to the same rail: same
   template, same lint, same guard. Five ratified questions (register,
   mandate, anchors, specific anti-behaviors, voice), proposed from recon;
   assembly fills the destructive floor verbatim; persona-lint must PASS
   before ratification, and a FAIL re-prompts the anchors question rather than
   seating. Stage 10 seats the persona (.claude/active-persona.json) so the
   conduct guard enforces from message 1. references/primary-persona.md
   carries the contract; SKILL.md gains Stage 2.5, the both-layers Stage 6,
   the lint-and-smoke Stage 9 additions, and the consent_gates invariant.

## Validation

```yaml
hook_tests:    node --test hooks/*.test.mjs -> 69 pass, 0 fail (4 settings-integrity,
               7 dispatcher, 1 block-outranks-ask added; visual-evidence and the
               irreversible detector re-pinned to the ask tier in their own commit)
script_tests:  node --test scripts/*.test.mjs -> pass
audit:         node scripts/eidolon-audit.mjs -> PASS (references resolve, personas
               pass the rail, wired hooks exist)
settings:      valid JSON; three PreToolUse entries (guard-bash, guard-write,
               .*advisor.*) plus the permissions.deny floor
glob_semantics: verified against code.claude.com/docs/en/permissions (2026-06-11),
               not assumed: mid-pattern wildcards are supported, a space before a
               trailing * is a word boundary, deny outranks allow at every level,
               and hook decisions cannot bypass deny rules
dashes:        all new copy carries no em or en dash
```

## Decision

Autonomy and consent are not in tension; they compose. The superagent does all
the labor itself and stops only where a side effect installs, seats, deploys,
or destroys. Discovery, decision, and install are never the same actor. The
house persona is grounded by the same rail as every review persona: the rail
is satisfied with consent, never waived for the owner.
