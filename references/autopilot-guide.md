# Autopilot: loops, goals and routines, guided

The conductor reads this file when the person wants something to run on its own:
`/eidolon loop`, `/eidolon goal`, `/eidolon routine`, or plain words such as "keep
doing this" or "check it every morning". The principles behind loops are in
references/engineering-principles.md section 2. The design rules, the brain-dump
invitation, the extraction schema and the reflect-back format are in
references/interview.md and are not repeated here.

## How this is built

```yaml
# why: built for a neurodivergent mind; the guide removes load instead of adding steps
rules:  [one question per screen, chips first and typing optional, skip and other on every question,
         no wrong answers, no time pressure, messy nonlinear input accepted, reflect back before acting,
         Recommended default on every chip question, everything written to disk, coworker register]
shared: references/interview.md
```

## Step 1: brain dump

```yaml
# why: the person usually knows the outcome and the annoyance before they know the cadence
invitation: "Tell me about it the way you would tell a coworker. Rant, infodump, jump around. I will sort it."
schema:     references/interview.md, "extraction schema" (outcome, who_for, done_signal, trigger_or_cadence,
            stop_conditions, must_never, budget, inputs_and_sources, frustrating, open_questions)
reflect:    references/interview.md, "reflect-back format"; chips: That's it / Fix something / Add more
```

Rule: offer the dump first, optional and encouraged. Source: this guide. Carrier: references/interview.md.
Rule: never re-ask a field the dump filled. Source: this guide. Carrier: gap pass in step 2.

## Step 2: chips interview for the gaps

Ask only the questions whose fields are null after the dump, through AskUserQuestion, one per screen. Each carries skip and other; the first option is Recommended.

```yaml
shape:
  question: "Which shape fits?"
  options:
    - "Goal (Recommended when there is a clear finish line)"
    - "Loop"
    - "Routine"
    - "Desktop task"
done_signal:
  question: "How will we know it is done?"
  options: ["A test command exits 0", "A file or count condition", "An empty queue", "Describe it"]
cadence:
  question: "How often should it run?"
  options: ["Every 5 minutes", "Every 30 minutes", "Hourly", "Daily at 9:07", "Self-paced"]
stop_and_budget:
  question: "When should it stop?"
  options: ["After N turns (Recommended)", "After N hours", "Until done"]
must_never:
  question: "What must it never do?"
  options: ["Push", "Delete", "Touch a path I name", "None beyond the normal gates (Recommended)"]
permission_posture:
  question: "How should it handle permission prompts when no one is watching?"
  options: ["Auto mode", "An allowlist of the commands it needs (Recommended)"]
```

```yaml
# decision table for the shape question; show it beside the chips
goal:          condition-driven; session-scoped; a fresh small model evaluates the condition after every turn
loop:          interval or self-paced; session-scoped; 1 minute minimum; expires after 7 days
routine:       cloud; unattended; 1 hour minimum; fresh clone with no local files
desktop_task:  runs on this machine with local files; the machine must be on
```

Rule: `cadence` offers "Daily at 9:07" because a time off the hour dodges the on-the-hour jitter. Source: CC scheduled-tasks. Carrier: emitted cron or `/schedule` text.
Rule: ask `cadence` only for loop, routine and desktop task; a goal has no cadence. Source: CC goal. Carrier: shape branch.
Rule: a routine cannot read local files; if the inputs are local, steer to goal, loop or desktop task. Source: CC routines. Carrier: shape branch.
Rule: an unattended run gets an allowlist or auto mode chosen up front, not discovered by a stalled prompt. Source: CC best-practices. Carrier: `permission_posture`.

## Step 3: emit and verify

```yaml
# why: the emitted text is the whole spec of the run; the run cannot ask a question back
goal:         the exact /goal text: one measurable end state, the stated check, constraints, a turn cap; run only on the owner's yes
loop:         "/loop <interval> <prompt>", or a project .claude/loop.md under 25KB
routine:      "/schedule <description>" with a self-contained prompt stating success, scoped repos, minimal connectors
desktop_task: the steps, written for the scheduled-task form
record:       .claude/autopilot/<slug>.md holds what was created, why, and how to stop it
answers:      .claude/session.yaml
stop_with:    {goal: "/goal clear", loop: "Esc or CronDelete", routine: "/schedule update", desktop_task: "disable in the scheduled-tasks list"}
```

Rule: show the emitted text and the stop instruction, then wait for a yes before creating anything. Source: CLAUDE.md consent rules. Carrier: conductor.
Rule: write the record file before the run starts, so the stop instruction exists on disk. Source: CE (notes outside the context window). Carrier: `.claude/autopilot/<slug>.md`.
Rule: read the created goal, task or routine back (`/goal` status, task list, `/schedule` list) and show it. Source: conductor-standard section 6. Carrier: conductor.

## Effective-prompt rules

```yaml
# why: an unattended prompt is read cold; whatever it needs must be in it
self_contained:   the prompt states the task, paths and tools; it assumes no conversation
one_end_state:    one measurable end state, not a list of wishes
stated_check:     a check the transcript can show (a command and its expected output)
constraints:      what must not change, named
bounded:          a turn cap, time cap or attempt cap
routine_extras:   success stated; fire payloads (API or GitHub event text) referenced only if intended
loop_extras:      explain the 1 minute minimum, the jitter and the 7-day expiry to the person
goal_extras:      the evaluator reads only what Claude surfaces, so the check's output must appear in the transcript
```

Rule: one measurable end state per run. Source: CC goal. Carrier: emitted prompt.
Rule: every emitted prompt names a stop (cap) and a check. Source: BEA stopping conditions. Carrier: emitted prompt.
Rule: for a grind queue, emit a loop-suite wave command (references/loop-suite.md), not a free-form loop. Source: loop-suite.md. Carrier: queue file.

## Worked examples

A goal, as Eidolon would emit it:

```text
/goal All tests in `npm test` pass and `npm run lint` exits 0. After each change,
run both and print the last 5 lines of output. Do not edit files under
`migrations/`. Stop after 20 turns.
```

A loop:

```text
/loop 30m Run `git fetch` and `gh pr list --state open --json number,title,mergeable`.
Write any PR with mergeable=CONFLICTING to .claude/autopilot/pr-watch.md as one line
(number, title). Do not push, comment or close anything. Print "no change" when the
list matches the file.
```

Eidolon adds: "Minimum interval is 1 minute, firing can shift by a few minutes, and this stops on its own after 7 days. Esc or CronDelete stops it now."

A routine:

```text
/schedule Every weekday at 9:07, on a fresh clone of github.com/OWNER/REPO, run
`npm audit --json`. Success: a markdown summary of high and critical advisories is
posted as a draft issue titled "Audit YYYY-MM-DD". If there are none, create nothing.
Use only the GitHub connector. Do not change any file or open a pull request.
```

Eidolon adds: "This runs in the cloud on a clone with no local files, and the smallest interval is 1 hour. `/schedule update` changes it."
