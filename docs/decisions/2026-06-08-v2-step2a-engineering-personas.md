# Decision log: 2026-06-08 v2 step 2a (engineering swarm fully staffed)

Append-only. Records the increment that completes the engineering swarm's base
roster, and the workflow process used to build it.

## What was built

The five remaining engineering personas, each constructed from the template
(`references/persona-template.md`) and validated by `scripts/persona-lint.mjs`:

| Persona | Mandate | Named anchors (the anti-synthetic rail) |
|---|---|---|
| backend-data-engineer | data models, services, integrity of what is stored and moved | ACID + ANSI SQL isolation levels, BCNF, expand-contract migrations, idempotency, CAP/PACELC |
| frontend-engineer | the interface, its state, how it renders | WCAG 2.2, WAI-ARIA APG, WHATWG HTML, Core Web Vitals, unidirectional data flow |
| ux-interaction-designer | the flow a person actually moves through | Nielsen heuristics, WCAG 2.2, ISO 9241-110/210, WAI-ARIA APG |
| information-architect | how things are named, organized, found | ANSI/NISO Z39.19, ISO 25964, W3C SKOS, Cool URIs, schema.org |
| devx-engineer | the ergonomics of working in the codebase | DORA Four Keys, SPACE, Trunk-Based Development, Conventional Commits, SemVer, Twelve-Factor |

With the full-stack engineer from slice 1, the engineering swarm now carries six
personas, each seated by the tier and surface of the change.

## How it was built (the process record)

This increment was the first use of a background Workflow after a process
correction: background workflows are allowed, but must be actively minded, not
launched and abandoned. The five personas were drafted by a parallel workflow
(one agent per role), and it was minded the whole way: block-waited in windows,
with liveness checks against the transcript dir between windows (four agents
finished early; one laggard kept writing, confirming progress rather than a hang).
It completed in about eight minutes. Claude remained the sole filesystem writer:
the agents returned content, and the content was written, dash-scanned, and
persona-lint-validated here.

## Validation

```yaml
persona_lint:  all five PASS (front-matter rail: persona, title, swarm, >=1 anchor,
               anti_behaviors.floor + specific). No anchor would have been rejected.
dashes:        all five clean (no em or en dash)
scrub:         clean (the one TODO is the legitimate ship-stub anti-behavior phrasing)
selfcheck:     PASS (no regression to v1 invariants)
```

## Decision

The engineering swarm is staffed. Next v2 steps remain: the trust-and-safety and
code-review swarms with their personas, then the solutions architect synthesis and
disposition table (step 3), then ship-and-upload (step 4).
