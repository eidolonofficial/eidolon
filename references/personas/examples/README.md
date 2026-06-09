# Example hired experts

These are NOT base-roster members. They demonstrate per-persona generation
(references/expert-hiring.md): an expert generated at runtime to fit a hypothetical
codebase need, drafted to the same depth as a hand-built persona by the
construction template, anchored to real named standards, and passing the
anti-synthetic rail (scripts/persona-lint.mjs).

| Example | Generated for | Anchors |
|---|---|---|
| payments-cardholder-data-engineer | a codebase that stores or moves card data | PCI-DSS v4.0, PCI DSS Req 3, CDE scope-minimization, tokenization, OWASP ASVS |
| clinical-safety-health-data-engineer | a codebase handling PHI / clinical decision support | IEC 62304, ISO 14971, HL7 FHIR R4, HIPAA |

A real hire is generated per project at PLAN, gated by the user, and recorded in
the coverage manifest (who, against which standard) and the decision log (which
detection signal produced it). A hire that cannot name its framework anchor is
rejected by the rail: no anchor, no seat.
