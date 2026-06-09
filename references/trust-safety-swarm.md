# Trust and safety swarm

The swarm that checks who is harmed, excluded, or exposed. It reviews harm,
abuse, privacy and PII, accessibility, and fairness, with the person on the
steepest gradient as the design floor. Staffed by the trust-and-safety and
accessibility architect persona (references/personas/trust-safety-architect.md).

Like every swarm, it follows the two-signal rule, returns literal evidence, and
every finding carries `file:line`, the category, the standard it cites, and the
signal that caught it. Absence of a finding is never read as clean: the report
opens with what was checked.

## Methodology and anchors

```yaml
privacy:        GDPR and CCPA - lawful basis, data minimization, purpose limitation,
                the right to erasure; PII at rest and in motion, in logs, in errors
accessibility:  WCAG 2.2 Level AA - the keyboard path, focus, contrast, status
                messages, target size; the failing element and the exact criterion
harm_and_abuse: the trust-tree harm and abuse branches - who can be hurt, who can
                weaponize the feature, what the most vulnerable user meets first
fairness:       a recognized AI-risk or fairness frame (e.g. NIST AI RMF) when the
                change ranks, scores, filters, or decides about people
floor:          the zero-point user is the design floor; equity is not a value-add,
                it is the floor, and accessibility retrofitted costs far more than
                accessibility designed in
```

## The hardening pattern (the five parts, tuned to trust and safety)

```yaml
named_failure_mode:  survivorship bias - "no issues" with no coverage stated
evidence_it_hands_over: per category (PII, a11y, harm, abuse, fairness) the literal
                     check and its result; the WCAG criterion plus the failing element;
                     the PII field plus the file:line where it leaks
coverage_manifest:   the categories run, what each found, what was confirmed clean,
                     and what was not run and why. Absence of a finding is never clean.
fire_drill:          a seeded PII-in-logs line and an unlabeled input must be caught
                     before the real pass; a miss halts the run
closeout_gate:       the trust-and-safety manifest is required; a high-severity harm
                     or PII finding blocks (a hook enforces it)
```

## Evidence contract (per category)

```yaml
privacy:        the PII field and its file:line; whether it is logged, stored, or
                sent; the lawful basis or the absence of one
accessibility:  the exact WCAG criterion (number and name), the failing element, and
                the keyboard or assistive-tech path that breaks
harm_abuse:     the concrete actor and the concrete harm; who is excluded and what
                they meet first; not "this could be misused"
fairness:       the input that drives the decision, the group it disadvantages, and
                the measured or reasoned disparity
rejected:       "no privacy issues", "looks accessible", "seems fair", any clean
                claim with no coverage section
```

## What blocks closeout

```yaml
no_manifest:        the coverage manifest is missing or does not state what was not run
high_harm_or_pii:   a high-severity harm finding or a PII leak with no remediation
a11y_signoff_alone: conformance signed off from a linter alone, with no element-level
                    evidence or keyboard walk-through, on a change that needs an audit
```

A finding that exceeds self-assessment (a formal privacy assessment, an assistive
technology audit) is escalated to independent review, not faked. The swarm says so.

## Where it sits in the pipeline

Trust and safety runs in REVIEW at standard tier and above, in parallel with the
security swarm. Its findings flow to the solutions architect for one ordered
disposition (references/architect-synthesis.md). A high-severity harm or PII
finding is surfaced one at a time via AskUserQuestion with the liability line:
who is harmed if this is wrong, and the legal exposure.

## Installed-skill loadout

```yaml
from_installed: [a11y-architect, design-accessibility-review, trust-but-verify
                 (privacy and a11y branches), eu-ai-act-check, security-check,
                 whole-person-check, legal compliance-check, legal-risk-assessment]
```

## Where this is grounded

The role is design spec section 6; the hardening pattern and the per-swarm
instantiation are section 17; the loadout is section 16. The persona that staffs
it is built from references/persona-template.md (section 19).
