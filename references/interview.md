# Interview Me: the question bank and the brain dump

Shared by Setup's opening, Eidolon's SPECIFY stage and the autopilot guide
(references/autopilot-guide.md). One file holds the design rules, the brain-dump
invitation, the extraction schema, the reflect-back format and the chip questions, so
every stage asks the same way. The conductor reads this file before it asks the person
anything beyond a yes or no.

## Design rules

```yaml
# why: the interview is built for a neurodivergent mind: low load, no pressure, nothing held in the head
one_question:    one question per screen
chips_first:     answer by picking a chip; typing is optional
escape_hatches:  every question offers skip and other
no_wrong_answers: any answer, including skip, moves forward and can be changed later
no_clock:        no time pressure, no countdowns, no "quick question"
messy_ok:        the dump may be long, messy and nonlinear; the conductor sorts it
reflect_first:   Claude reflects back what it heard and the person confirms before anything is built
less_deciding:   the default is marked Recommended and listed first, to cut decision fatigue
on_disk:         every answer is written to a file, so nothing has to be remembered
register:        a coworker's: plain, warm, short sentences; no jargon without a gloss
```

Rule: ask one thing at a time and wait. Source: Claude Code best-practices (interview before building). Carrier: AskUserQuestion.
Rule: every AskUserQuestion carries 2 to 4 options plus skip, with the recommended option first and marked "(Recommended)". Source: Claude Code AskUserQuestion limits. Carrier: this file.
Rule: the dump is the first screen; answers found in it are never re-asked. Source: BEA (gather ground truth before acting). Carrier: the extraction pass below.
Rule: when AskUserQuestion is unavailable, ask the same question in plain text with lettered options. Source: CLAUDE.md consent rules. Carrier: conductor.
Rule: do not act on a guess; an unanswered gap becomes an open question in the file, not an assumption. Source: conductor-standard section 9. Carrier: `open_questions`.

## The brain dump

```yaml
# why: people who think in bursts are slower to answer a form than to talk; talk first, structure second
step: 1
optional: true
encouraged: true
invitation: "Tell me about it the way you would tell a coworker. Rant, infodump, jump around. I will sort it."
chips: [Start talking, Ask me questions instead, Skip]
```

```yaml
# extraction schema: fill from the dump; leave a field null when the dump did not say
outcome:             # in the user's own words, quoted
who_for:             # who uses or receives the result
done_signal:         # the check that proves done
trigger_or_cadence:  # when it runs: once, on an event, on an interval
stop_conditions:     # when to stop, including a turn, time or attempt cap
must_never:          # hard no-go actions
budget:              # turns, hours or spend
inputs_and_sources:  # files, repos, tools, accounts it reads
frustrating:         # what annoys the person about the current way
open_questions:      # what the dump did not answer
```

Rule: store the user's own words for `outcome` and `frustrating`; do not paraphrase them into jargon. Source: Claude Code best-practices. Carrier: `.claude/session.yaml`.
Rule: a null field becomes a chip question later, permission_posture included; it is never defaulted from the session state. A filled field is shown in the reflect-back and not asked again. Source: this file. Carrier: gap pass.

## Reflect-back format

```yaml
# why: the person confirms the sorted version in one click instead of re-explaining
shape:   a short bullet list, one line per filled field, in the person's words
header:  "Here is what I heard."
chips:   ["That's it (Recommended)", "Fix something", "Add more"]
fix:     "Fix something" opens one chip question per wrong line, not a full redo
add:     "Add more" returns to the dump box, then re-runs the extraction
```

Rule: reflect back before the first question and before anything is written to the repo. Source: BEA (checkpoints). Carrier: conductor.
Rule: keep the reflect-back under 10 lines. Source: CE (finite context). Carrier: conductor.

## Question bank by stage

Ask only the questions whose fields are still null after the dump. Options below are
chips; each also carries skip and other. The first option is the recommended one.

```yaml
# session start (Setup's four opening questions plus familiarity, asked once per session)
parts_wanted:
  question: "Which parts do you want this session?"
  options: ["Both (Recommended)", "Remember", "Check my work"]
treat_go_ahead:
  question: "How should I treat your go ahead?"
  options: ["Do cheap steps, then pause (Recommended)", "You checked it", "You trust a second look"]
how_far:
  question: "How far should I run before checking?"
  options: ["Until tests pass (Recommended)", "One step", "The whole plan"]
kind_of_work:
  question: "What kind of work is this?"
  options: ["Routine (Recommended)", "A judgment call", "Wrapping up"]
familiarity:
  question: "How familiar are you with coding and engineering? There is no wrong answer."
  options: ["New to this", "Some familiarity", "Comfortable, I code", "Expert"]
```

```yaml
# SPECIFY stage: feeds the spec; skip any the dump already answered
what_for:      "What is this for, in your own words?"          # free text with chips: [Type it, Skip]
who_uses:      "Who uses it?"                                  # chips: [Just me, My team, Customers, Other systems]
must_never:    "What must it never do?"                        # chips: [Delete data, Send anything outward, Touch production, Nothing special beyond the normal gates (Recommended)]
done_looks:    "What does done look like, in a way you could check?"  # chips: [A command exits 0, A file or screen matches a description I give, A count or queue hits a number, Describe it]
risk_lives:    "Where does the risk live?"                     # chips: [Data, Security or auth, Money, Reliability, Not sure (Recommended)]
standing:      "What should I always do, ask first about, or never do?"  # three short chip rounds: Always, Ask first, Never
```

```yaml
# autopilot: the questions live in references/autopilot-guide.md step 2
autopilot: [shape, done_signal, cadence, stop_and_budget, must_never, permission_posture]
```

Rule: SPECIFY asks `done_looks` before any technical question; a spec without a checkable done is not ready. Source: Claude Code best-practices (give Claude a check). Carrier: SPECIFY gate.
Rule: `must_never` answers become hard constraints in the spec and in any emitted prompt. Source: conductor-standard section 8. Carrier: spec, `.claude/autopilot/<slug>.md`.
Rule: `risk_lives` selects the review lenses for the build; a person who picks "Not sure" gets the default swarm. Source: conductor-standard section 2. Carrier: REVIEW stage.

## Where answers land

```yaml
# why: nothing lives only in the conversation, so a restart or a bad day loses nothing
session_answers:   .claude/session.yaml                 # session start answers and the extraction record
spec:              the SPECIFY output file for the work item (what_for through standing rules)
autopilot_record:  .claude/autopilot/<slug>.md          # what was created, why, how to stop it
```

Rule: write each answer to disk when it is given, not at the end of the interview. Source: CE (notes outside the context window). Carrier: `.claude/session.yaml`.
Rule: a later stage reads these files first and asks only for what is missing. Source: CE. Carrier: conductor.
