# engine/ — the vendored evolve engine

Eidolon's `evolve` mode (SKILL.md; `references/evolve-engine.md`) runs the **agent-driven**
ASI-Evolve toolbelt vendored under `engine/asi-evolve/`. Claude is the engineer; the toolbelt is
deterministic bookkeeping (a cognition store, an experiment database, samplers, run state).

## Isolation — the skill stays pure

- `engine/asi-evolve/` is **inert vendored source**. Nothing imports it at skill-install time, so
  Eidolon still installs into `~/.claude/skills/eidolon/` with no Python present.
- Its dependencies (numpy, pyyaml; faiss + sentence-transformers optional, with fallbacks) live in
  an **on-demand venv** created the first time `evolve` runs, at `engine/.venv/` — **gitignored**,
  never committed. The skill footprint stays Markdown + `.mjs`.
- Run state (`.evolve_runs/`, model cache, run artifacts) is gitignored; only the distilled result
  of a run is routed back into the working tree and Eidolon's memory.

## First-run provisioning (what the evolve mode does, once, consent-gated)

```bash
python3 -m venv engine/.venv
engine/.venv/bin/pip install numpy pyyaml          # core; faiss-cpu + sentence-transformers optional
engine/.venv/bin/python engine/asi-evolve/scripts/evolve-db --help   # smoke
```

The evolve toolbelt is then driven per `engine/asi-evolve/SKILL.md` and
`references/evolve-engine.md` (preflight → cognition init → round loop → summary). The single
human-consent moment — the preflight `--confirmed true` flip — is gated by
`hooks/evolve-engine-guard.mjs`.

## Updating the vendored copy from upstream

The integration (the guard, the reference doc, the venv) lives OUTSIDE `engine/asi-evolve/`, so
that directory stays a clean mirror. To re-sync:

1. Fetch the new upstream `skills/evolve/` (and any needed `experiments/`) at the desired commit
   from https://github.com/GAIR-NLP/ASI-Evolve.
2. Replace the contents of `engine/asi-evolve/` (keeping the Eidolon-authored `NOTICE` and
   `PROVENANCE.md`), update the pinned commit SHA + fetch date in both files, and re-run the
   verification (`node --test 'hooks/*.test.mjs'`, the toolbelt smoke above).
3. Record the bump in a dated `docs/decisions/` entry if behavior changed.
