# Skill construction template

Eidolon authors its own skills the way it hires experts: to a fixed depth, behind a
rail, distilled from proven work -- never conjured to look capable. This is the skill
analog of `references/persona-template.md`. A skill that cannot fill the parts below, or
that names no concrete trigger, or that ships no eval, is rejected the same way a persona
with no framework anchor is rejected. The rail here is "no trigger, no eval, no skill."

## The parts (every self-authored skill carries all of them)

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

## The anti-synthetic rail

A skill with no concrete trigger, or no eval, or any embedded secret, is rejected -- the
skill-level version of "no anchor, no seat." Eidolon grows skills to fit recurring,
*proven* need; it never speculates a skill to look capable. One-shot speculative skill
generation is measurably worse than authoring nothing (EvolveTool-Bench), so the trigger to
author is a pattern already solved >= N times, not a guess about a future need.

## Safety constraints (grounded in the self-generating-skill literature)

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

## The skill file format

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

## Where this is grounded

The depth-not-optional discipline, the anti-synthetic rail, and the file-format block mirror
`references/persona-template.md`. The authoring flow (distill -> lint -> independent test-gate
-> human consent -> install -> govern) is `references/skill-authoring.md`. The validator is
`scripts/skill-lint.mjs` (the skill analog of `scripts/persona-lint.mjs`). The safety
constraints are grounded in the self-generating-skill prior art (Voyager's verified library,
MUSE-Autoskill's test-gated registration, EvolveTool-Bench's one-shot-is-worse finding,
SkillAttack's injection survey, and Anthropic's eval-driven Agent Skills guidance).
