# Skill selection

Eidolon should know when a specialist workflow is useful without turning every shared word into an invocation.

## Inputs

The controller builds a small routing record from current evidence:

- `task`: the user's requested outcome, preserving explicit named skills;
- `repoSignals`: concrete signals already observed in the repository, such as `package.json`, `supabase/config.toml`, React, Terraform, a fraud rules directory, or a PDF artifact;
- `riskTags`: consequential surfaces such as auth, secrets, PII, payments, destructive operations, deployment, or external publication;
- `candidates`: installed skills and their metadata.

Never infer a repo signal from memory when it can be inspected.

## Candidate metadata

Standard Agent Skills metadata remains valid. Eidolon may additionally read optional routing metadata without requiring hosts to understand it:

```yaml
name: example-skill
description: Narrow description of the work this skill performs.
triggers: ["exact phrase", "framework-specific task"]
signals: ["package-name", "path/pattern"]
risk: ["auth", "secrets"]
excludes: ["unrelated phrase"]
conflicts: ["other-skill"]
requires: ["tool-or-skill"]
```

`description` is the portable host-facing routing surface. The extra fields are Eidolon hints. A skill must still make sense when a host ignores those hints.

## Selection order

1. **Explicit user choice**. A named installed skill wins unless it is unavailable, out of scope, or conflicts with a higher-priority user instruction or safety rule.
2. **Narrow trigger match**. Phrase-level matches are strong evidence. Bare common tokens such as `api`, `auth`, `git`, `test`, `json`, `react`, or `python` are never enough by themselves.
3. **Repository evidence**. Concrete detected files, packages, frameworks, languages, or domain structures strengthen a candidate.
4. **Risk evidence**. A candidate that explicitly covers a detected risk receives extra weight. Risk never lowers governance requirements.
5. **Description fit**. Description overlap breaks ties and supports routing, but generic prose cannot rescue a skill with no concrete evidence.
6. **Negative constraints**. Exclusions, scope failures, missing prerequisites, and conflicts are applied before final selection.

## Minimal-set rule

Choose the smallest non-conflicting set that covers materially distinct needs. Additional skills must contribute evidence not already covered by a selected skill. Two skills that match only the same generic terms are not two independent reasons.

When no candidate clears the threshold, return `gap`. A gap means either work directly using repository instructions or invoke the existing skill-scout flow to discover a candidate. It does not mean fabricate a new skill mid-task.

## Inspectability

A routing result records:

- selected skill names;
- score and matched evidence for each;
- rejected candidates and reasons;
- uncovered evidence (`gap`);
- whether selection came from explicit user choice or automatic routing.

The record is evidence for orchestration, not proof that the selected skill's output is correct. The normal verification funnel still applies.

## Subagent interaction

Skill selection happens before deciding whether to delegate. Selecting a skill does not imply a subagent. Use the current platform contract: delegate when parallelism, isolated context, a specialist lens, or independent verification creates value. Simple sequential work can use the selected skill directly in the conductor.
