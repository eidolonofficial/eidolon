// Maintains known platform-sensitive doctrine. Run with --check in CI.
// Without --check, replaces stale clauses in-place on a review branch.
import { readFileSync, writeFileSync } from 'node:fs';

const checkOnly = process.argv.includes('--check');
const changes = [
  {
    path: 'SKILL.md',
    stale: `            RECORDS (CREDITS.md with license, decision-log row). Note to the\n            operator: the skill activates on the next session restart.`,
    fresh: `            RECORDS (CREDITS.md with license, decision-log row). Verify that the\n            current host discovers the skill after install; do not require a restart unless\n            that host/version or integration actually needs one.`
  },
  {
    path: 'references/conductor-standard.md',
    stale: `# why: the deep tier is for judgment the cheap tier cannot give; spend it where it pays\n# user-ratified dispatch tiers (swarm-model-cascade memory); model passed per agent() call\n# user-set 2026-06-13 (Fable retired); supersedes the swarm-model-cascade Fable-tier note\nconductor_tier:  the conductor runs inline on Opus 4.8 (1M) as the hivemind - holds the full\n                context and hands each context-less leg exactly the context it needs; synthesis\n                and all delicate/canonical/infra edits stay here, never delegated\nfan_out_top:     opus 4.7 for premium dispatched work - deep single-lens reviews, hard\n                implementation in worktrees, architecture+scale research synthesis,\n                what-if-oracle framing, security/trust-safety lenses\nfan_out_work:    sonnet for the workhorse - build chains, single-dimension reviews,\n                research-swarm breadth legs, test-runners, render/mockup builders\ndoc_edits_only:  haiku ONLY for small doc edits (CHANGELOG lines, comment fixes), never code,\n                review, or judgment\nescalation:      a broken opus-4.7 leg (its wave gate red after the bounded fix rounds, or it\n                cannot hold the scope) escalates THAT leg to an Opus 4.8 (1M) agent - the\n                headroom for hard cases; the failing leg only, never the whole wave; a 4.8\n                leg that still fails is a re-plan signal, not a re-spend\nnot_ambient:     the tier is passed per agent() call, never assumed; an unstated model is a defect\ndispatch_enum:   the harness dispatch enum is sonnet/opus/haiku (no version granularity); 'opus'\n                IS the premium fan-out tier, 4.7-vs-4.8 is not per-call selectable; escalation\n                pulls the failed leg INLINE to the 4.8 conductor (or re-dispatches 'opus' in a\n                worktree), there being no higher dispatchable opus (user-resolved 2026-06-13)`,
    fresh: `# why: model names drift faster than governance doctrine; route by capability and availability\n# current platform behavior is governed by references/current-platform-contract.md\nconductor_tier:  use the strongest suitable model actually available in the current host for\n                synthesis, delicate/canonical/infra edits, security/trust/safety judgment, and\n                orchestration decisions that require the full working context\nfan_out_top:     use the strongest dispatchable model available for premium independent work -\n                deep single-lens review, hard implementation, architecture/scale synthesis,\n                what-if framing, and security/trust/safety lenses\nfan_out_work:    use a capable general workhorse model for build chains, focused review, research\n                breadth, tests, renders, and other bounded implementation work\nfast_mechanical: use the fastest suitable model only for bounded low-risk mechanical edits;\n                never use a speed tier merely because a task touches few files\nescalation:      when a dispatched leg exhausts its bounded fix loop or cannot hold its scope,\n                escalate THAT leg to the strongest suitable available model; if that still fails,\n                re-plan instead of repeatedly spending the same shape\nnot_ambient:     record the chosen capability tier per dispatch; never assume a remembered point\n                release or context-window size is present\nresolver:        host aliases such as opus/sonnet/haiku are availability-resolved aliases when\n                the host exposes them, not promises about a specific version; inspect the current\n                host or first-party docs when identity/capability matters`
  }
];

let staleCount = 0;
for (const change of changes) {
  const before = readFileSync(change.path, 'utf8');
  if (before.includes(change.stale)) {
    staleCount += 1;
    if (!checkOnly) writeFileSync(change.path, before.replace(change.stale, change.fresh));
    continue;
  }
  if (!before.includes(change.fresh)) {
    console.error(`platform-refresh: neither stale nor expected fresh clause found in ${change.path}`);
    process.exit(2);
  }
}

if (checkOnly && staleCount) {
  console.error(`platform-refresh: ${staleCount} stale active clause(s) remain`);
  process.exit(1);
}
console.log(checkOnly ? 'platform-refresh: PASS' : `platform-refresh: updated ${staleCount} clause(s)`);
