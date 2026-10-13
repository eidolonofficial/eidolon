# Eidolon

**An agentic system that understands a repository, chooses the smallest useful toolset, preserves context, and keeps consequential actions behind explicit human consent.**

Eidolon is the intelligence at the center of the family. **Hearth** is the installer and threshold. **Setup** prepares a working session. Eidolon reads the codebase, forms a grounded plan, selects skills from evidence instead of keywords, coordinates specialist work when it helps, verifies claims before closure, and remembers what matters without pretending memory is certainty.

> **Same heart. More possibility.** The goal is not a more theatrical agent. It is a more capable one that remains legible to the person using it.

## Quick start

Requires Node.js 18+ and Git. Preview first; approve writes separately.

```sh
node scripts/install.mjs --project /path/to/project
node scripts/install.mjs --project /path/to/project --yes
```

Existing skill replacement requires `--replace` and retains a backup. Copying the skill does **not** activate hooks automatically.

Invoke `/eidolon` in Claude Code.

## What Eidolon actually does

| Stage | Purpose | Human boundary |
| --- | --- | --- |
| **Understand** | Reads repository structure, languages, tools, instructions, and current evidence. | No writes. |
| **Select** | Chooses the smallest sufficient skill set from task + repo + risk signals. | New skills require explicit approval. |
| **Plan** | Builds a concrete execution plan and identifies verification steps. | You approve before consequential changes. |
| **Build** | Creates host instructions, skills, subagents, governance, memory wiring, and supporting configuration. | Irreversible or sensitive work remains gated. |
| **Verify** | Checks generated commands and completion claims against independent evidence. | A failed check is not reported as success. |
| **Remember** | Carries forward useful context as evidence-backed working memory. | Memory stays revisable, not authoritative. |

## Consent is part of the architecture

Eidolon pauses at consequential edges: installing or replacing a skill, seating a persona, deployment, irreversible actions, and destructive or sensitive delegated work. A generated command must pass verification before it is treated as ready to execute.

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

Early, actively developed, and intentionally conservative about what it claims. Built by Jonah Butterbaugh, alongside Claude.

## License

MIT. See [`CREDITS.md`](CREDITS.md) for retained acknowledgements and upstream work.
