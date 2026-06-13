# Skill authoring (Eidolon self-authored skills)

When the cognition loop (or recon) surfaces a recurring, PROVEN capability gap that no
installed skill covers, Eidolon authors a skill for itself -- the way `expert-hiring.md`
authors a persona. Authoring is gated end to end: a skill never reaches a live directory
un-linted, un-tested, or un-consented. This is the skill analog of `expert-hiring.md`, run on
the same anti-synthetic rail as `references/skill-template.md`: no trigger, no eval, no skill.

The prior art is blunt about why the gates are load-bearing: one-shot, unverified skill
generation measures *worse than authoring nothing* (EvolveTool-Bench), self-written tests miss
the defects hidden tests catch, ~26% of real skills carry an injection vulnerability
(SkillAttack), and a skill that encodes one successful run's literals can regress a task
80% -> 20% (MUSE-Autoskill). Every step below answers one of those findings.

## When to author -- distill, never speculate

```yaml
trigger:    a pattern solved and OBSERVED >= N times across the loop's task-analysis records
            (loop-suite.md 2026-06-13 cognition-loop uplift), docs/fixes/, and mempalace, with
            no installed skill covering it; the cognition-audit wave / analyzer surfaces it
not_trigger: a guess about a future need. Speculative authoring is worse than nothing -- the
            frequency of a proven pattern is the trigger, never a hunch
```

## The flow (six gated steps)

```yaml
1_trigger:  the analyzer proposes a candidate gap with its evidence (the >= N occurrences)
2_author:   the skill-author persona (references/personas/skill-author.md) writes the SKILL.md
            against references/skill-template.md -- name, description, concrete-narrow triggers,
            least-privilege tool_scope, the steps, and >= 3 evals
3_lint:     node scripts/skill-lint.mjs <SKILL.md> must PASS (the rail). No pass, no proceed
4_test_gate: a SEPARATE cold-context verifier + grader run the skill's evals -- never the
            author's self-grade (hidden tests catch what self-tests miss). Register only on
            green; a red enters the bounded fix loop (max 2); a third red re-plans, never re-fixes
5_consent:  ONE AskUserQuestion at the controller (a subagent cannot pause the human --
            find-skills-reach.md). On yes, install to the target .claude/skills/<name>/ (or
            ~/.claude/skills/learned/ for user scope), record in CREDITS.md + the decision log;
            the skill goes live next session
6_govern:   the cognition-audit wave extends to the skill library -- merge duplicates, prune the
            consistently-unused, and flag a skill that encoded a single run's literals (file
            names, paths, magic numbers) as stale (the MUSE regression class)
```

## What does NOT transfer (the fence)

```yaml
embedding_retrieval: Claude routes on description + triggers, not vectors -- triggers must be
                     precise, not a similarity index (Voyager's retrieval does not port)
environment_oracle:  a delivery framework gets no free verification environment (Voyager's
                     simulator) -- step 4's test-gate must be DESIGNED, it is the safety crux
skill_signing:       ETDI-style signing is not in Claude Code yet -- compensate with
                     distilled-from-success + skill-lint (no-URL + secret-scrub) + human consent
full_autonomy:       the consent gate stays human (injection risk + a subagent cannot pause the
                     human); auto-install is NOT done -- v1 keeps the human in the loop
```

## Where this is grounded

The construction template + the rail are `references/skill-template.md`; the validator is
`scripts/skill-lint.mjs` (the skill analog of `scripts/persona-lint.mjs`); the maker is
`references/personas/skill-author.md`; the discover/decide/install/verify/attribute flow it
reuses is `references/find-skills-reach.md`; the frequency signal comes from the loop's
task-analysis records (`loop-suite.md`, 2026-06-13 cognition-loop uplift), governed by the
cognition-audit wave. Runtime auto-firing of an author-skill wave is a deferred v2; v1 ships
the machinery + the worked example at `references/example-skill/SKILL.md`.
