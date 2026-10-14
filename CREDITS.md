# Credits

Eidolon stands on open-source work by other people. Every project it builds on, folds in, or models on is named here, with its author, license, and link. This is the one place those names live, with thanks.

## Skills and harnesses

- **agent-skills**, by Addy Osmani. MIT. https://github.com/addyosmani/agent-skills
  The lifecycle agent-skills harness this whole pattern grows from: lifecycle commands and the reviewer, test-engineer, and security-auditor roles that the swarms are modeled on.
- **web-quality-skills**, by Addy Osmani. MIT. https://github.com/addyosmani/web-quality-skills
  Skills over 150-plus Lighthouse audits and Core Web Vitals.
- **agent-engineer**, by Addy Osmani. Apache-2.0. https://github.com/addyosmani/agent-engineer
  A practical AI-agents engineering course; reference material.
- **trust-but-verify**, by Jonah Butterbaugh. MIT. https://github.com/gmrmk/trust-but-verify
  The root-cause framework selection (5 Whys, Fishbone, Fault Tree, Bow-Tie, Kepner-Tregoe, Pareto, DMAIC) and the verification anti-behavior catalog that references/problem-solving-frameworks.md and the house persona's problem-solving section are adapted from.

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

## Token economy, memory and graphs

The vetted set in references/token-economy.md. None of it is bundled; each is offered at Stage 4 and installed only on the person's yes.

- **ponytail**, by Dietrich Gebert. MIT. https://github.com/DietrichGebert/ponytail
  The minimalism ladder; its doctrine is folded into the conductor standard, section 10.
- **caveman** and its **cavecrew** presets, by Julius Brussee. Apache-2.0. https://github.com/JuliusBrussee/caveman
  The compressed register for chat and reports, and the investigator, builder and reviewer presets for the fast mechanical tier.
- **rtk**, by rtk-ai. CLI Apache-2.0; engine and proxy BUSL-1.1. https://github.com/rtk-ai/rtk
  Compressed output for git, gh, npm, cargo, pytest and other everyday commands.
- **headroom**, by Headroom Labs. Apache-2.0. https://github.com/headroomlabs-ai/headroom
  Compression of tool outputs, logs, files and retrieval chunks, with the originals retrievable.
- **repomix**, by yamadashy. MIT. https://github.com/yamadashy/repomix
  A repo or subtree packed into one file, with a compressed mode.
- **LLMLingua**, by Microsoft. MIT. https://github.com/microsoft/LLMLingua
  Prompt compression by a small local model; optional and measured before trust.
- **mempalace**, by the MemPalace project, led by igorls. MIT. https://github.com/MemPalace/mempalace
  The prose memory Eidolon reads for a bounded prior.
- **codebase-memory-mcp**, by DeusData. MIT. https://github.com/DeusData/codebase-memory-mcp
  The local code graph that answers structure questions; the primary orient.
- **graphify**, by Graphify Labs. Apache-2.0 and MIT. https://github.com/Graphify-Labs/graphify
  The docs, schema and code graph; the fallback orient.

## The author

Eidolon and its sister, Setup, were built by Jonah Butterbaugh, alongside Claude.
