# Credits

Eidolon stands on open-source work by other people. Every project it builds on, folds in, or models on is named here, with its author, license, and link. This is the one place those names live, with thanks.

## Skills and harnesses

- **agent-skills**, by Addy Osmani. MIT. https://github.com/addyosmani/agent-skills
  The lifecycle agent-skills harness this whole pattern grows from: lifecycle commands and the reviewer, test-engineer, and security-auditor roles that the swarms are modeled on.
- **web-quality-skills**, by Addy Osmani. MIT. https://github.com/addyosmani/web-quality-skills
  Skills over 150-plus Lighthouse audits and Core Web Vitals.
- **agent-engineer**, by Addy Osmani. Apache-2.0. https://github.com/addyosmani/agent-engineer
  A practical AI-agents engineering course; reference material.

## Design patterns (reference)

- **learning-jsdp**, by Addy Osmani. MIT. https://github.com/addyosmani/learning-jsdp
  Current design-pattern examples.
- **essential-js-design-patterns**, by Addy Osmani. CC BY-NC-ND. https://github.com/addyosmani/essential-js-design-patterns
  Reference only: non-commercial, no-derivatives, so it is read, never adapted or redistributed.

## Web-performance toolkit

- By Addy Osmani: **critical** (Apache-2.0), **squish** (MIT), **timing.js** (MIT), **tmi** (Apache-2.0), **puppeteer-webperf** (Apache-2.0). https://github.com/addyosmani
- **loadCSS** (MIT, a fork). https://github.com/addyosmani/loadCSS
- **quicklink** (Apache-2.0), by GoogleChromeLabs. https://github.com/GoogleChromeLabs/quicklink
- Noted but archived or deprecated, not used for new work: psi, webpack-lighthouse-plugin.

## Standards Eidolon reviews against

- **OWASP**: Web Security Testing Guide, Top 10, ASVS, API Security Top 10, Proactive Controls, Cheat Sheet Series. https://owasp.org
- **MITRE**: ATT&CK and CWE. https://attack.mitre.org and https://cwe.mitre.org
- **NIST**: Secure Software Development Framework (SP 800-218). https://csrc.nist.gov/projects/ssdf
- **W3C**: WCAG 2.2 and WAI-ARIA. https://www.w3.org/WAI/

## Security tooling

- SAST: Semgrep (LGPL-2.1), Bandit, gosec, eslint-plugin-security, Brakeman (dual-license).
- Secret scanning: gitleaks (MIT), trufflehog (AGPL-3.0).
- Dependencies: osv-scanner, Trivy, grype, and the native npm, pip, and cargo audits.
- Dynamic and recon: OWASP ZAP, nuclei (MIT).
- Config and supply chain: Checkov, syft, OpenSSF Scorecard.

trufflehog (AGPL-3.0) and Brakeman (dual-license) are run as isolated subprocesses, never linked in, and their terms are honored.

## The author

Eidolon and its sister, Setup, were built by Jonah Butterbaugh, alongside Claude.
