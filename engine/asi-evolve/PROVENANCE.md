# Provenance — vendored ASI-Evolve evolve toolbelt

- **Upstream**: https://github.com/GAIR-NLP/ASI-Evolve
- **Pinned commit**: `fb8a67e552e25cf8b7144d4e7f1a17f665055130`
- **Fetched**: 2026-06-16
- **License**: Apache-2.0 (see `./LICENSE`, `./NOTICE`)
- **Paper**: ASI-Evolve: AI Accelerates AI — arXiv:2603.29640

## Why a partial vendor

Eidolon's `evolve` mode drives the **agent-driven** evolve skill (Claude is the engineer; the
toolbelt does the cognition/experiment-DB/sampling bookkeeping). Upstream's own
`skills/evolve/SKILL.md` is explicit that this is the intended path and that the autonomous
runtime must not be used for it:

> Do not run `python main.py`. Do not import or rely on `pipeline/` agents for orchestration.

So only the agent-driven layer is vendored. The autonomous multi-agent runtime would add a hard
dependency on an external OpenAI-compatible LLM endpoint and heavier packages, and is contrary to
Eidolon's model (Claude does the reasoning, not an external API loop).

## Included (verbatim, unmodified)

```
SKILL.md                         # upstream's evolve skill policy (kept as engine-internal doc)
agents/openai.yaml               # upstream agent config
references/                      # architecture, operating_model, preflight, run_spec, toolbelt
scripts/evolve-*                 # the six CLI wrappers (brief, cognition, db, eval, files, summary)
scripts/evolve_core/             # the Python engine: cognition, database, samplers, run_state, ...
experiments/circle_packing_demo/ # a runnable smoke fixture (problem + evaluator + baseline)
LICENSE                          # upstream root Apache-2.0, copied unmodified
```

## Excluded

```
main.py, pipeline/, utils/llm.py, cognition/, database/   # the autonomous runtime (see above)
assets/paper.pdf (3.3 MB), assets/Overview.png            # docs, not needed to run
experiments/best/                                          # evolved-solution snapshots (~74 KB)
__pycache__/, *.pyc                                        # caches
```

## Runtime dependencies

`evolve_core` requires **numpy** and **pyyaml**. `faiss` and `sentence-transformers` are
**optional**, guarded by `try/except` with graceful local fallbacks (hash-token embeddings,
non-FAISS vector index). No `openai` / LLM-API key is needed. Eidolon installs these into an
on-demand, gitignored venv at `engine/.venv/` on first use; the skill itself stays pure
Markdown + `.mjs`.

## Re-syncing from upstream

See `../README.md`. The integration is kept outside this directory so this subtree stays a clean
mirror; only `NOTICE` and `PROVENANCE.md` are Eidolon-authored additions inside the prefix.
