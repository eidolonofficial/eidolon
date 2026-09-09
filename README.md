<p align="center">
  <img src="assets/brand/hero.svg" alt="Eidolon — safe AI, brighter possibilities" width="100%" />
</p>

# Eidolon

**A cross-host agentic system that understands a repository, chooses the smallest useful toolset, preserves context, and keeps consequential actions behind explicit human consent.**

Eidolon is the intelligence at the center of the family. **Hearth** is the installer and threshold. **Setup** prepares a working session. Eidolon reads the codebase, forms a grounded plan, selects skills from evidence instead of keywords, coordinates specialist work when it helps, verifies claims before closure, and remembers what matters without pretending memory is certainty.

> **Same heart. More possibility.** The goal is not a more theatrical agent. It is a more capable one that remains legible to the person using it.

## Quick start

Requires Node.js 18+ and Git. Preview first; approve writes separately.

```sh
node scripts/install.mjs --host codex --project /path/to/project
node scripts/install.mjs --host codex --project /path/to/project --yes
```

Use `--host claude` for Claude Code or `--host both` for both clients. Existing skill replacement requires `--replace` and retains a backup. Copying the skill does **not** activate hooks automatically.

Invoke `$eidolon` in Codex or `/eidolon` in Claude Code.

## What Eidolon actually does

| Stage | Purpose | Human boundary |
| --- | --- | --- |
| **Understand** | Reads repository structure, languages, tools, instructions, and current evidence. | No writes. |
| **Select** | Chooses the smallest sufficient skill set from task + repo + risk signals. | New skills require explicit approval. |
| **Plan** | Builds a concrete execution plan and identifies verification steps. | You approve before consequential changes. |
| **Build** | Creates host instructions, skills, subagents, governance, memory wiring, and supporting configuration. | Irreversible or sensitive work remains gated. |
| **Verify** | Checks generated commands and completion claims against independent evidence. | A failed check is not reported as success. |
| **Remember** | Carries forward useful context as evidence-backed working memory. | Memory stays revisable, not authoritative. |

## Designed for Claude Code and Codex

The shared doctrine is host-independent; the adapters are not. Eidolon maps the same workflow onto each client without inventing parity where the hosts differ.

- **Claude Code:** native Claude skill/instruction paths and supported hook behavior.
- **Codex:** `.agents/skills`, explicit host mappings, and conservative handling of ask-tier operations.
- **Both:** one reviewed workflow with host-specific transport and no silent capability assumptions.

See [`codex/README.md`](codex/README.md) for current Codex limits and trust assumptions.

## Consent is part of the architecture

Eidolon pauses at consequential edges: installing or replacing a skill, seating a persona, deployment, irreversible actions, destructive or sensitive delegated work without a valid security attestation, and evolve runs. A generated command must pass verification before it is treated as ready to execute.

The system is deliberately progressive: optional services can enrich the experience, but a missing optional service should not turn a routine task into a false success or a broken install.

## The family

- **Eidolon** — understands, selects, coordinates, verifies, and remembers.
- **Setup** — begins a session with the right context, boundaries, and skills.
- **Hearth** — installs the system through a review-first graphical experience.

## Verification

The repository includes compatibility, routing, installer, policy, and regression tests. Run the repository suite before claiming a change is ready:

```sh
node --test
```

Platform-specific workflows in `.github/workflows/` provide the cross-platform evidence used for release decisions.

## Status

Early, actively developed, and intentionally conservative about what it claims. Built by Jonah Butterbaugh, alongside Claude, with cross-host compatibility work for Claude Code and Codex.

## License

MIT. See [`CREDITS.md`](CREDITS.md) for retained acknowledgements and upstream work.
## Persona selection and reviewed dispatch

`node scripts/orchestrate.mjs --project /path/to/project --host codex` accepts a
JSON request on stdin. Its `deploy-plan` action selects grounded personas, checks
required coverage and file scopes, orders dependency waves, and prepares bounded
context for native agent tools. It does not spawn agents or grant permissions.
See `references/orchestration-contract.md` and `examples/persona-pipeline.json`.

The current repair adds full-state settings and record checks, managed wiring,
PowerShell and Agent coverage, successful-outcome drift accounting, and preview-
bound installation. An interrupted installation keeps its journal and lock for
operator recovery; automatic crash recovery is not claimed.
