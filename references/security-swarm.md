# Security swarm (red and blue)

The first review swarm and the differentiator; from standard tier up it runs in
parallel with the trust-and-safety and code-review swarms. Red attacks the
work in parallel, one agent per attack surface. Blue hardens each layer red
probes. The pair is paired by contract: every red finding becomes a blue task,
and the pair closes only when blue's post-fix verify passes on a signal
independent of the one that detected it.

This swarm reviews the CODE under build. The agent-side comprehension layer that
precedes a sensitive dispatch (read the policy, take the quiz, get externally
graded, attest) is references/security-awareness.md; dispatching this red/blue
swarm itself is one of the sensitive dispatches its consent gate covers.

Every standard and tool here was verified against its primary source on
2026-06-08. Versions are pinned because these standards move. Re-fetch every
cited URL at CLOSE and require an exact match of the control identifier;
downgrade any citation whose URL is dead or moved.

## Red-team methodology (the attacker checklists)

```yaml
# why: a named coverage map means a skipped category is visible, not silent
wstg:        # OWASP Web Security Testing Guide - one red agent per category
  categories: [information-gathering, configuration-and-deployment, identity-management,
               authentication, authorization, session-management, input-validation,
               error-handling, weak-cryptography, business-logic, client-side, api]
  url: https://owasp.org/www-project-web-security-testing-guide/
owasp_top10: # tag every finding against BOTH lists during the transition
  note: 2025 is canonical now; SSRF folded into Broken Access Control; Software
        Supply Chain Failures is new at A03. Keep the 2021 tag too until settled.
  url: https://owasp.org/Top10/
mitre_attack: # the threat model; map each action to a tactic + technique (TA / T id)
  tactics: 14 Enterprise tactics, shared kill-chain coverage map
  url: https://attack.mitre.org/
api_top10:   # for API-heavy repos (broken object-level authorization and the rest)
  year: 2023
  url: https://owasp.org/API-Security/
```

## Blue-team methodology (the defender pass/fail rubric)

```yaml
asvs:        # OWASP ASVS v5.0.0 - 17 chapters (NOT the old V1-V14 layout)
  level: L1 | L2 | L3   # chosen by the risk tier of the change
  url: https://owasp.org/www-project-application-security-verification-standard/
ssdf:        # NIST SP 800-218 - maps the swarm onto a recognized secure-SDLC frame
  groups: [prepare-the-organization, protect-the-software,
           produce-well-secured-software, respond-to-vulnerabilities]
proactive_controls: # OWASP Proactive Controls 2024 + Cheat Sheet Series = the fix recipes
  use: per-finding remediation the blue agents apply
```

## Tooling (verified, current, licensed)

Real scanners, not described checks. Trivy and Checkov each span several
categories, so stages collapse onto them.

```yaml
sast:          [semgrep (LGPL-2.1, 30+ langs), bandit (python), gosec (go), eslint-plugin-security (js)]
sast_caution:  brakeman (rails) is dual commercial-split licensed; check terms before commercial use
secret_scan:   [gitleaks (MIT, feature-frozen), trufflehog (verifies live credentials)]
sca:           [osv-scanner, trivy, grype, npm audit, pip-audit, cargo-audit]
dast_recon:    [owasp-zap baseline (CI-safe spider + passive), nuclei (template-based)]
iac_container: [checkov, "trivy config"]   # tfsec is deprecated, superseded by Trivy; not used for new work
supply_chain:  [openssf-scorecard, syft (SBOM)]
```

```yaml
# License isolation rule (consistent with the project AGPL subprocess rule)
isolate:  trufflehog is AGPL-3.0; brakeman is dual-licensed. Invoke both as isolated
          subprocesses, never linked into the swarm. Check brakeman terms before commercial use.
# Static always, dynamic only with a target
static:   SAST, secret scan, SCA, IaC, supply chain run against the working tree; they always apply.
dynamic:  ZAP and nuclei need a running, reachable app. Run the dynamic pass only with a deployed
          target. With no target, record the dynamic categories as not-run in the coverage manifest,
          never skip them silently.
```

## The hardening pattern (red and blue each carry all five)

```yaml
red:
  handwaving_looks_like: synthetic findings; "looks vulnerable"; skipped categories
  evidence_it_hands_over: a reproducible proof-of-concept, or the exact line + exploit path per finding
  fire_drill: a planted vulnerability must be caught at the right file:line
  blocks_closeout: coverage manifest + a passed fire drill required; findings without evidence do not ship
blue:
  handwaving_looks_like: fix-without-fix (hardening the matched string, not the vulnerability)
  evidence_it_hands_over: post-fix verify passing on a signal independent of detect, plus the hardening diff
  fire_drill: a cosmetic fix (rename the matched variable) must still FAIL post-fix verify
  blocks_closeout: no fix counted unless post-fix verify passes; a failing fix is reopened
```

## The five anti-handwave gates

The security pass cannot reach closeout unless all five hold. A hook enforces the
last one, so the gate is a machine, not a promise.

1. **Coverage manifest.** Emit every WSTG category and every ASVS chapter the pass
   ran, what each found, what it confirmed clean, and what it did not run and why.
   Absence of a finding is never read as clean.
2. **Seeded-defect fire drill.** Before the real pass, plant a known defect (a SQL
   injection, a hardcoded secret). The red swarm must catch it at the right
   `file:line`. A miss halts the run; the swarm is not trusted until it proves it
   can detect.
3. **Literal evidence per finding.** A reproducible proof-of-concept, or the exact
   line plus the OWASP or CWE identifier and the exploit path. No "looks vulnerable."
4. **Independent post-fix verify.** Every blue fix re-runs the red detection and the
   ASVS check on a signal independent of the one that made it. A cosmetic fix that
   renames the matched variable must still fail; a fix that does not pass is reopened.
5. **Closeout hook.** The commit is blocked unless the manifest exists, the fire
   drill passed, every finding carries evidence, and every fix passed post-fix
   verify.

## How red and blue close a finding

```
red detects  ->  finding (file:line + OWASP/CWE id + exploit path + severity)
             ->  blue hardening task
             ->  blue fix
             ->  post-fix verify: re-run red's own detection on an independent signal
                   passes  ->  pair closed, counted
                   fails   ->  reopened, not counted   (fix-without-fix is caught here)
```

Severity is base times blast radius. Findings are surfaced one at a time via
AskUserQuestion with a liability line (who is harmed if this is wrong, and the
legal exposure), never a typed menu. A finding that has not cleared an
independent second signal is a claim, not a finding, and does not enter
disposition.

## Where this is grounded

The red/blue methodology, the five gates, and the pairing come from the design
spec sections 6, 17, and 18. The critical-issue decision tree (section 8) and the
swarm uncertainty protocol (section 9) govern how findings are sorted and how
each subagent's evidence is checked.
