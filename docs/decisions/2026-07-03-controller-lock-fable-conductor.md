# 2026-07-03 - Controller lock extended to fable-conductor (cooperate with Opus 4.8 under the Fable pack)

Status: ADOPTED — operator-ordered same day as the Fable behavior pack ("Refactor
Eidolon to cooperate with the newly Fableized Opus 4.8"); the order is the ask-first
consent the hook-authority rule requires for a guard change.

## Context

ADR 2026-07-03-fable-behavior-pack shipped the fable-conductor persona
(CONTROLLER-ONLY) as the long-horizon controller for Opus 4.8 running under the Fable
pack, and its consequences section named the open gap: this skill-tree's
persona-conduct-guard locked only the Expediter, so seating fable-conductor as a
controller depended on each project extending its own guard copy (the FFR pattern).
Probe before the change (by execution, not by reading): `evaluateSeat` with a
fable-conductor seat and `isSubagent: true` returned `null` — a dispatched subagent
seated as the new conductor was ALLOWED to act.

## Decision

1. **`hooks/persona-conduct-guard.mjs` — `isExpediterSeat` extended.** It now returns
   true for the Expediter (unchanged, any plain spelling), for the persona id
   `fable-conductor`, and for any seat whose title carries the `[CONTROLLER-ONLY]`
   marker — the tag both built controller personas already carry in their title line,
   so future controller personas that declare themselves are locked without another
   guard fork. The exported name `isExpediterSeat` and the verdict kind
   `subagent-expediter` are kept: persona docs, SKILL.md, tests, and project guard
   copies cite both by name.
2. **The hard-stop message generalized** to name controller-only personas (Expediter,
   fable-conductor) instead of the Expediter alone, matching FFR's wording pattern.
3. **Doc touchpoints aligned** (each previously asserted the Expediter-only lock):
   SKILL.md `orchestration.lock`, hooks/README.md (guard table row + exit-code
   summary), references/personas/fable-conductor.md (header lock note + the
   Controller-only section), references/security-policy.md `subagent_out_of_lane`.
4. **Tests extended** (`hooks/persona-conduct-guard.test.mjs`): recognition by id and
   by `[CONTROLLER-ONLY]` title (and NOT by the bare word "controller"); subagent
   hard-stop on any action; the lock preceding the seat-repair carve-out; main-session
   use unaffected with the persona's declared teeth still enforced.

5. **Hardened after an adversarial verify panel** (three lenses; the evasion lens ran
   its candidate seats through the real `evaluateSeat`): fable-conductor gets the same
   id spelling tolerance as the Expediter (`fable_conductor`, `fable conductor`,
   `the-fable-conductor` all lock); `ffr-cascade` is recognized by id or a
   "cascade controller" title — the recognition its persona contract in
   references/personas/fraud-forensic-replay-cascade.md already promised, previously
   implemented only in FFR's project copy; and the `[CONTROLLER-ONLY]` marker match
   tolerates internal whitespace and Unicode dashes. The false-catch lens confirmed no
   worker persona in references/personas/ matches any branch.

This change only ADDS true catches; no existing catch is removed (the beneficial-only
rule for guard changes). Evidence: the pre-change suite was green before the edit, the
extended suite is green after it, and the live hook (child process, harness-shaped
stdin with a `subagents` transcript_path) exits 2 and clears the seat file for a
fable-conductor seat — recorded in the session that shipped this ADR.

Accepted limitation (pre-existing, unchanged): subagent detection rests on the single
`transcript_path`-contains-`subagents` signal and fails open as the main session. That
fail-open is deliberate (a harness that omits or reshapes the field must not brick
normal work), but it means a harness path-convention change would silently disable the
lock; the tradeoff is documented in the guard and hooks/README.md.

## Consequences

- Eidolon-guarded projects lock fable-conductor from this version of the template
  onward; the persona no longer needs a per-project guard extension. Guard copies
  installed BEFORE this date (e.g. FFR's, which already extends for its own Cascade)
  still lock only what they recognize — re-copying the template or extending per the
  FFR pattern remains the upgrade path, ask-first and controller-direct.
- references/security-policy.md changed, so its hash changes: any standing security
  attestation goes policy-stale and the dispatch-attestation-guard will ASK on the
  next sensitive dispatch until re-attested. Intended behavior, not a regression.
- The FFR Cascade's `[CONTROLLER-ONLY]` title is now also caught by this template
  guard via the tag rule — a strict tightening, consistent with its own persona doc.
- Supersedes consequence 3 of ADR 2026-07-03-fable-behavior-pack for new installs
  (that ADR is a record and stands unedited).
