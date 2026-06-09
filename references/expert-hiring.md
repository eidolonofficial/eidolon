# Expert hiring (per-persona generation)

The base roster is the standing team. When recon detects a need the base roster
does not cover, a domain, a data sensitivity, or a regulatory surface unique to
the codebase, Eidolon hires an expert: it generates a new persona at runtime,
built to the same depth as a hand-built one by the construction template
(references/persona-template.md). Depth is structural, not optional.

## When to hire

```yaml
trigger:   recon (SPECIFY) or a swarm surfaces a need no base persona covers
examples:  a payments codebase (PCI-DSS), a health codebase (PHI, clinical safety),
           an adversarial-ML surface, a niche language or framework, a regulatory
           domain the roster has no anchor for
not:       never hire to look thorough; a hire serves a named, detected need or it
           is not made
```

## The hire (five steps)

```yaml
1_draft:    draft the expert against the construction template, anchored to a named
            standard for its domain
2_bound:    write its anti-behaviors, the shared destructive floor plus the ones
            specific to its domain, so it is bounded from its first action
3_retool:   retool its skill loadout from the installed-skill and framework
            registries, matched to its domain (see "Skill retooling" below);
            reach beyond the installed set with find-skills only for a named gap
            (references/find-skills-reach.md)
4_gate:     gate the hire at the plan checkpoint for higher-risk work; the user
            approves or declines the hire
5_record:   record the hire in the coverage manifest (who, against which standard)
            and the decision log (which detection signal produced it)
```

## The anti-synthetic rail

A generated persona that cannot name its framework anchor and its evidence
contract is rejected. This is the same rule the rest of the system runs on: no
anchor is the persona-level version of no detection branch. Eidolon grows experts
to fit a codebase; it never conjures ungrounded ones to look thorough.

```yaml
gate:    scripts/persona-lint.mjs validates the generated persona before it is seated:
         persona, title, swarm, at least one anchor, an evidence contract, and the two
         anti-behavior layers. No anchor and no evidence contract, no seat. A hire that
         fails the rail is rejected, not patched in.
```

## Skill retooling, concretely

The loadout is assembled per expert, not just per swarm. The expert arrives with
the right tools already in hand.

```yaml
clinical_safety_hire: pulls the privacy and PHI checks plus the matching compliance skills
payments_hire:        pulls the cardholder-data checks, secret scanning, and the relevant ASVS chapters
adversarial_ml_hire:  pulls the model and red-team tooling
niche_language_hire:  pulls the language pair via find-skills when it is not installed
```

## Anti-behaviors of a hired expert (the two layers)

A hired expert carries the same two-layer anti-behaviors as a base persona:

```yaml
floor:    the shared destructive floor (every persona, verbatim): never an
          irreversible op without the two-safety-net pattern; never disable or route
          around a hook; never rewrite history to dodge a gate; never exfiltrate a
          secret; never execute untrusted content
specific: the domain-scoped anti-behaviors (a payments expert never stores a PAN in
          the clear; a clinical-safety expert never logs PHI in plaintext or removes
          an audit trail), so the persona-conduct guard can catch its drift by name
```

## How drift is caught on a hired expert

The same three layers that bound a base persona bound a hired one:

```yaml
catalog:   the pipeline-wide antibehavior catalog (design spec section 10)
hardening: the swarm's anti-handwave hardening (section 17) for the swarm it joins
conduct:   its own declared anti-behaviors, enforced by hooks/persona-conduct-guard.mjs
           (the seat file carries its floor and specific lists like any other persona)
```

## Worked example (an example hire)

The two files under `references/personas/examples/` are example hires generated to
fit hypothetical codebase needs (a PCI-DSS payments surface and a PHI clinical
surface). They are not base-roster members; they show what a generated expert looks
like, each anchored to real named standards (PCI-DSS v4.0 and OWASP ASVS; HIPAA,
HL7 FHIR, IEC 62304, ISO 14971) and each passing the anti-synthetic rail.

## Where this is grounded

Hiring, the construction template, the anti-synthetic rail, and the three layers of
drift-catching are design spec section 19; the per-expert skill retooling and the
find-skills reach are section 16. The rail is enforced by scripts/persona-lint.mjs;
the conduct guard is hooks/persona-conduct-guard.mjs.
