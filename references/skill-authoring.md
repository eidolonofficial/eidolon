# Skill authoring (Eidolon self-authored skills)

When the loop's task-analysis records or recon surface a recurring, PROVEN capability gap
that no installed skill covers, Eidolon authors a skill for itself, the way it hires a
persona (references/find-skills-reach.md, "Hiring an expert persona"). Authoring is gated
end to end: a skill never reaches a live directory un-linted, un-tested, or un-consented.
The rail is "no trigger, no eval, no skill."

The prior art is blunt about why the gates are load-bearing: one-shot, unverified skill
generation measures *worse than authoring nothing* (EvolveTool-Bench), self-written tests miss
the defects hidden tests catch, ~26% of real skills carry an injection vulnerability
(SkillAttack), and a skill that encodes one successful run's literals can regress a task
80% -> 20% (MUSE-Autoskill). Every step below answers one of those findings.

## When to author: distill, never speculate

```yaml
# why: the frequency of a proven pattern is the trigger, never a hunch
trigger:     a pattern solved and OBSERVED >= N times across the loop's task-analysis records
             (loop-suite.md, cognition-loop uplift), docs/fixes/, and mempalace, with no
             installed skill covering it
not_trigger: a guess about a future need; speculative authoring is worse than nothing
```

## The flow (six gated steps)

```yaml
# why: each gate answers one named failure of unverified skill generation
1_trigger:   the candidate gap arrives with its evidence (the >= N occurrences)
2_author:    the skill-author persona (references/personas/skill-author.md) writes the SKILL.md
             against the construction template below
3_lint:      node scripts/skill-lint.mjs <SKILL.md> must PASS (the rail). No pass, no proceed
4_test_gate: a SEPARATE cold-context verifier + grader run the skill's evals, never the
             author's self-grade. Register only on green; a red enters the bounded fix loop
             (max 2); a third red re-plans, never re-fixes
5_consent:   ONE AskUserQuestion at the controller (a subagent cannot pause the human). On yes,
             install to the target .claude/skills/<name>/ (or ~/.claude/skills/learned/ for user
             scope), record in CREDITS.md and the decision log; verify the host discovers it
6_govern:    the memory-audit wave (loop-suite.md) extends to the skill library: merge
             duplicates, prune the consistently-unused, flag a skill that encoded a single run's
             literals (file names, paths, magic numbers) as stale
```

## The construction template

Eidolon authors its own skills to a fixed depth, behind a rail, distilled from proven work.
A skill that cannot fill the parts below, names no concrete trigger, or ships no eval is
rejected the way a persona with no framework anchor is rejected.

```yaml
# why: every part is a routing, safety, or verification signal; a missing part is a rejected skill
name:           short kebab-case id; also the skill directory name
description:    one line, the ROUTING signal: WHEN the skill applies and WHAT it does, concretely
triggers:       concrete, narrow strings (error substrings, library+version, file-shape patterns,
                project-scoped symbols); NOT a bare globally-common token (redis, jwt, auth)
scope:          project | global (default project); global only when provably language-level
tool_scope:     the least-privilege toolkit (Read, Edit, Bash, ...); NO external-URL fetch
when_to_invoke: the precondition(s) under which the skill fires, and when it should NOT
steps:          the numbered, no-skip body; imperative, minimal
evals:          >= 3 scenarios, each {given, when, then}; a skill with no eval cannot register
provenance:     source: authored | extracted ; authored: <YYYY-MM-DD> ;
                session_evidence: file:line / doc URL / scrubbed error
```

```yaml
# why: skill files are a top prompt-injection vector; these constraints are the safety floor
distilled_from_success: author only from a pattern solved and observed in real work
least_privilege:        tool_scope names the minimal tools; the skill cannot reach beyond it
no_external_url:        the body never fetches an external URL (WebFetch, curl http, fetch,
                        requests.get of a URL); fetched content can carry instructions
independent_test_gate:  the evals are run by a SEPARATE verifier; a skill registers only when
                        an independent run of its evals is green
secret_free:            no secret in any field or the body (non-bypassable; redact or reject)
governed:               the library is merged, pruned, and audited; a skill that encodes a single
                        run's literals is flagged stale
```

A skill is `SKILL.md` under `.claude/skills/<name>/` (project) or
`~/.claude/skills/learned/<name>.md` (user scope), opening with this front matter, then the
body (when-to-invoke, the numbered steps, and an `## Evals` section with >= 3 scenarios).

```yaml
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

## What does not transfer

```yaml
# why: three pieces of the prior art assume infrastructure Claude Code does not have
embedding_retrieval: Claude routes on description + triggers, not vectors; triggers must be precise
environment_oracle:  a delivery framework gets no free verification environment; step 4's test gate
                     must be designed, it is the safety crux
skill_signing:       signing is not in Claude Code; compensate with distilled-from-success,
                     skill-lint (no-URL + secret-scrub), and human consent
full_autonomy:       the consent gate stays human; auto-install is not done
```

## Where this is grounded

The validator is `scripts/skill-lint.mjs` (the skill analog of `scripts/persona-lint.mjs`);
the maker is `references/personas/skill-author.md`; the discover, decide, install, verify,
attribute flow it reuses is `references/find-skills-reach.md`; the frequency signal comes
from the loop's task-analysis records (`references/loop-suite.md`). The worked example is
`references/example-skill/SKILL.md`. The safety constraints are grounded in the
self-generating-skill prior art (Voyager's verified library, MUSE-Autoskill's test-gated
registration, EvolveTool-Bench's one-shot-is-worse finding, SkillAttack's injection survey,
and Anthropic's eval-driven Agent Skills guidance).
