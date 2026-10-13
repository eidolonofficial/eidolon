# Skill authoring (Eidolon self-authored skills)

When the cognition loop (or recon) surfaces a recurring, PROVEN capability gap that no
installed skill covers, Eidolon authors a skill for itself -- the way expert hiring
(`find-skills-reach.md`) authors a persona. Authoring is gated end to end: a skill never
reaches a live directory un-linted, un-tested, or un-consented. This is the skill analog of
the expert-hiring flow, run on the anti-synthetic rail defined below: no trigger, no eval,
no skill.

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
            against the construction template below -- name, description, concrete-narrow
            triggers, least-privilege tool_scope, the steps, and >= 3 evals
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

## The construction template

Eidolon authors its own skills the way it hires experts: to a fixed depth, behind a
rail, distilled from proven work -- never conjured to look capable. This is the skill
analog of `references/persona-template.md`. A skill that cannot fill the parts below, or
that names no concrete trigger, or that ships no eval, is rejected the same way a persona
with no framework anchor is rejected.

### The parts (every self-authored skill carries all of them)

```yaml
name:          short kebab-case id; also the skill directory name
description:   one line -- the ROUTING signal. Claude selects the skill on this string,
               so it states WHEN the skill applies and WHAT it does, concretely
triggers:      the auto-injection signal: concrete, narrow strings (error substrings,
               library+version, file-shape patterns, project-scoped symbols). NOT a bare
               globally-common token (redis, jwt, auth) -- that contaminates unrelated work
scope:         project | global (default project). global only when provably language-level
tool_scope:    the least-privilege toolkit the skill needs (Read, Edit, Bash, ...). Declared
               so the skill cannot quietly reach beyond its job. NO external-URL fetch
when_to_invoke: the precondition(s) under which the skill should fire, and when it should NOT
steps:         the numbered, no-skip body -- the actual procedure, imperative, KISS
evals:         >= 3 scenarios, each {given, when, then} -- the test-gate precondition. A skill
               with no eval cannot be registered (there is nothing to verify it against)
provenance:    source: authored | extracted ; authored: <YYYY-MM-DD> ;
               session_evidence: file:line / doc URL / scrubbed error (the sourcing rail)
```

### The anti-synthetic rail

A skill with no concrete trigger, or no eval, or any embedded secret, is rejected -- the
skill-level version of "no anchor, no seat." Eidolon grows skills to fit recurring,
*proven* need; it never speculates a skill to look capable. One-shot speculative skill
generation is measurably worse than authoring nothing (EvolveTool-Bench), so the trigger to
author is a pattern already solved >= N times, not a guess about a future need.

### Safety constraints (grounded in the self-generating-skill literature)

```yaml
distilled_from_success: author only from a pattern solved and observed in real work,
                        never speculatively (the trigger is frequency, not a hunch)
least_privilege:        tool_scope names the minimal tools; the skill cannot reach beyond it
no_external_url:        the body never fetches an external URL (WebFetch / curl http / fetch /
                        requests.get of a URL) -- skill files are a top prompt-injection vector,
                        and fetched content can carry instructions vetted content did not
independent_test_gate:  the evals are run by a SEPARATE verifier, never self-graded; a skill
                        registers only when an independent run of its evals is green
secret_free:            no secret in any field or the body (non-bypassable; redact or reject)
governed:               the library is merged/pruned/audited; a skill that encodes a single
                        run's literals (file names, paths, magic numbers) is flagged stale
```

### The skill file format

A skill is `SKILL.md` under `.claude/skills/<name>/` (project) or
`~/.claude/skills/learned/<name>.md` (user-scope), opening with the frontmatter block the
registrar and `scripts/skill-lint.mjs` read, then the body (when-to-invoke, the numbered
steps, and an `## Evals` section with >= 3 scenarios).

```yaml
# front matter block every authored skill opens with
name:        <kebab-id>
description: <one line: when it applies + what it does>
triggers:    [<concrete-narrow-1>, <concrete-narrow-2>, ...]   # >= 1, or the skill is rejected
scope:       project | global
project:     <slug>                  # required when scope: project
tool_scope:  [Read, Edit, Bash, ...] # least-privilege; no external-URL fetch
source:      authored
authored:    <YYYY-MM-DD>
session_evidence: <file:line | doc URL | scrubbed error>
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

The construction template and the rail live above in this doc; the depth-not-optional
discipline and the file-format block mirror `references/persona-template.md`. The validator is
`scripts/skill-lint.mjs` (the skill analog of `scripts/persona-lint.mjs`); the maker is
`references/personas/skill-author.md`; the discover/decide/install/verify/attribute flow it
reuses is `references/find-skills-reach.md`; the frequency signal comes from the loop's
task-analysis records (`loop-suite.md`, 2026-06-13 cognition-loop uplift), governed by the
cognition-audit wave. The safety constraints are grounded in the self-generating-skill prior
art (Voyager's verified library, MUSE-Autoskill's test-gated registration, EvolveTool-Bench's
one-shot-is-worse finding, SkillAttack's injection survey, and Anthropic's eval-driven Agent
Skills guidance). Runtime auto-firing of an author-skill wave is a deferred v2; v1 ships the
machinery + the worked example at `references/example-skill/SKILL.md`.
