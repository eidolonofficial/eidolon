# The primary persona (Stage 2.5: the house agent, built by the same machine)

Eidolon staffs review swarms with grounded personas. The primary persona is the
recursion of that: the user's own day-to-day agent for this codebase, crafted
for this user and this repo, and held to the same anti-synthetic rail as every
review persona. Same template (references/persona-template.md), same lint
(scripts/persona-lint.mjs), same guard (hooks/persona-conduct-guard.mjs). The
user does not get an ungrounded "vibes" agent, because the rail forbids it the
same way it forbids a finding with no detection branch.

## When it runs

Stage 2.5, between plan approval (CHECKPOINT 1) and CLAUDE.md (Stage 3), so the
persona exists before the files that reference it. Setup's Interview Mode
discipline applies: one question at a time, reflect back what was heard, never
fill in a vague answer alone.

## The interview (one AskUserQuestion round, proposed from recon)

Recon (Stage 1) already detected the stack, so Eidolon proposes and the user
ratifies. Adapt the anchor and anti-behavior options to what recon actually
found; the shapes below are the contract, not a script to read verbatim.

```
Q1 (single-select) - register (reuse Setup's familiarity calibration):
  "How familiar are you with this codebase's stack?"
  [ New to it ] [ Some familiarity ] [ Comfortable, I work in it ] [ Expert ]

Q2 (single-select) - mandate:
  "What is your agent mainly on the hook for here?"
  [ Ship features safely ] [ Harden + review existing code ]
  [ Migrate / refactor ] [ Explore + prototype ]

Q3 (multi-select) - anchors (THIS is the rail, satisfied with consent):
  "I detected <stack from recon>. Which standards should your agent hold the
   code to?"
  [ <stack-matched standard 1> ] [ <stack-matched standard 2> ]
  [ <stack-matched standard 3> ] [ All of these ] [ Let me name another ]
  # e.g. a Python data pipeline + FastAPI proposes: PEP 8 + type checking,
  # ACID + expand-contract migrations, OWASP ASVS at the API boundary

Q4 (multi-select) - specific anti-behaviors (the blast-radius guardrail):
  "What should your agent never do on this codebase?"
  [ Run a migration with no rollback ] [ Commit a secret ]
  [ Touch prod config ] [ Ship a stub as done ] [ Let me add one ]

Q5 (single-select) - voice:
  "How should it talk to you?"
  [ Terse + technical ] [ Plain + explains as it goes ] [ Warm + collaborative ]
```

## Assemble, lint, ratify, seat

```
assemble -> references/personas/<project>-primary.md, from the ten-part template:
            mandate from Q2; anchors from Q3; the shared destructive floor
            VERBATIM (so the guard matches it identically) plus the specific
            layer from Q4; voice from Q5; register from Q1 shapes the
            swarm_and_voice section; an evidence contract is REQUIRED (the
            rail is anchor AND evidence contract)
lint     -> node scripts/persona-lint.mjs references/personas/<project>-primary.md
            # must PASS before anything else happens
ratify   -> AskUserQuestion: "Here is the persona your agent will embody:
            <plain-language summary>."  [ Seat it ] [ Edit ] [ Explain ]
            # Explain routes through Explain Mode at the Q1 register
seat     -> write .claude/active-persona.json (persona id, title, anchors, both
            anti-behavior layers), so the conduct guard enforces from message 1
```

## The rail, satisfied with consent (the load-bearing rule)

Q3 is where grounding lives. If the user picks "Let me name another" and offers
something that is not a real framework or standard, persona-lint fails and
Eidolon does NOT seat an ungrounded persona: it returns to Q3 and proposes
grounded options from the detected stack. The user's own house agent cannot
escape the grounding standard. That is the same rule applied to the user, which
is what "built by the same Eidolon framework" actually means.

```yaml
no_anchor_no_seat:  anchors: [] never reaches .claude/active-persona.json; the
                    interview re-prompts instead of seating
floor_verbatim:     the shared destructive floor is included word-for-word from
                    references/persona-template.md, never paraphrased
consent_to_ground:  the anchors are RATIFIED by the user, not imposed; recon
                    proposes, the human picks
```

## Fire drill

Feed the assembler an answer set with no anchors selected. persona-lint must
reject it ("no framework anchor") and the interview must re-prompt for anchors
rather than seat. An ungrounded primary persona reaching
.claude/active-persona.json is the exact failure the rail exists to prevent;
the seat-time gate (persona-conduct-guard, "no anchor, no seat") is the last
line if the first two miss.

## Where this is grounded

The template, the two anti-behavior layers, and the anti-synthetic rail are
references/persona-template.md (design spec section 19). The seat-time gate is
hooks/persona-conduct-guard.mjs. The interview discipline is Setup's Interview
Mode; the register calibration is Setup's familiarity question.
