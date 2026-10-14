# Engineering principles: loops, retrieval, DAGs and graphs

The design principles behind Eidolon's pipeline, taken from Anthropic's published
engineering guidance and the Claude Code docs, each tied to the mechanism that carries it.
Sources are cited by short name: BEA (Anthropic, "Building effective agents", 2024), CE
(Anthropic, "Effective context engineering for AI agents", 2025), MAR (Anthropic, "How we
built our multi-agent research system", 2025), CR (Anthropic, "Contextual retrieval", 2024),
and CC (the Claude Code docs: goal, scheduled-tasks, routines, sub-agents, hooks,
best-practices). The conductor reads this file when it designs a wave plan, a loop or a
retrieval step. It does not restate conductor-standard.md; it adds the engineering reasons.

## 1. Workflows before agents

```yaml
# why: BEA says to find the simplest solution and add complexity only when it demonstrably helps
quote_1:        "We recommend finding the simplest solution possible, and only increasing complexity when needed."  # BEA
quote_2:        "consider adding complexity only when it demonstrably improves outcomes."  # BEA
patterns:       [prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer]  # BEA
```

```yaml
# the five BEA patterns as Eidolon carries them
prompt_chaining:        the build pipeline: spec, plan, build, review, verify, close; each stage consumes the last stage's artifact
routing:                the CLAUDE.md skill map sends a request to the skill or command that owns it
parallelization:        waves: independent agents launch in one controller message (conductor-standard section 2)
orchestrator_workers:   the conductor dispatches persona-seated workers and merges their results (conductor-standard section 1)
evaluator_optimizer:    REVIEW plus the bounded fix loop: a reviewer scores, a builder fixes, two rounds at most
complexity_gate:        the ponytail ladder in conductor-standard section 10; climb it before adding an agent, a loop or an index
```

Rule: pick the lowest pattern that solves the task; one call with retrieval beats a chain, and a chain beats a swarm. Source: BEA. Carrier: ponytail ladder.
Rule: a new agent, loop or index needs a named failure it removes. Source: BEA. Carrier: ponytail ladder.

## 2. Loops

```yaml
# why: a loop with no evaluator, no stop condition and no budget is a runaway, not automation
evaluator_bound: every loop names the check that ends it, and the check is one Claude can run
stop_condition:  BEA: "stopping conditions (such as a maximum number of iterations)"
ground_truth:    BEA: "it's crucial for the agents to gain ground truth from the environment at each step"
human_gates:     BEA: "Agents can then pause for human feedback at checkpoints or when encountering blockers."
budget:          every loop carries a turn, time or attempt cap
checkpoints:     state is written to disk each iteration so a restart resumes instead of repeating
```

Rule: no loop without an evaluator, a stop condition and a budget. Source: BEA. Carrier: `/eidolon loop|goal|routine` (autopilot-guide.md).
Rule: each iteration reads real output (test exit, file state, git diff), never its own claim. Source: BEA. Carrier: conductor-standard section 6.
Rule: human gates sit at the edges of a loop: before it starts and where a decision needs a person. Source: BEA. Carrier: conductor-standard section 8.

```yaml
# carriers: where a loop can run (CC); pick by where the files live and who must be present
goal:           /goal sets a completion condition; the small fast model checks it after every turn; it clears when met or impossible
goal_bound:     add "or stop after N turns" to the condition
goal_limit:     the evaluator reads only what Claude surfaced, so the condition must be demonstrable in output
loop:           /loop runs a prompt every fixed interval (minimum 1 minute, seconds round up) or self-paced (1 minute to 1 hour); Esc stops it
loop_limits:    recurring tasks expire after 7 days; CronCreate takes 5-field cron; tasks fire only while the session is open and idle
routine:        runs in the cloud on a schedule (minimum 1 hour), an API call or a GitHub event; fresh clone, no local files, autonomous; created with /schedule
desktop_task:   runs on the machine with local files; the machine must be on
```

```yaml
# the loop-suite wave contract for grind loops (references/loop-suite.md); the queue file is the only memory
one_wave:       one bounded wave per invocation; the runtime re-invokes it
memory:         the queue file; every wave cold-reads it and reconciles against git history
lease:          25 minutes; an in-progress task with no state change past the lease is a crashed wave
attempts:       two attempts per task, then re-plan; a third red gets a new plan, not a third fix
halt_codes:     every stop maps to a queue status (halted_red, blocked, budget_exhausted, awaiting_human, done) with an exit and a next action
```

Rule: grind work runs as one wave per invocation with the queue as its only memory. Source: MAR ("resume from where the agent was"). Carrier: loop-suite.md.

## 3. Retrieval

```yaml
# why: context is a finite resource, so fetch what the step needs, when it needs it
finite:         CE: "Context, therefore, must be treated as a finite resource with diminishing marginal returns."
just_in_time:   CE: agents "maintain lightweight identifiers (file paths, stored queries, web links, etc.)" and load data on demand
hybrid:         CE: "the most effective agents might employ a hybrid strategy, retrieving some data up front for speed"
small_corpus:   CR: under about 200,000 tokens, "you can just include the entire knowledge base in the prompt", with prompt caching
indexed_corpus: CR: "prepending chunk-specific explanatory context to each chunk before embedding"; contextual embeddings plus contextual BM25 cut top-20 failures by 49%; reranking cut them to 1.9%
```

Rule: default to just-in-time retrieval (grep, read, graph queries); keep paths and queries, not file bodies. Source: CE. Carrier: Claude Code search tools.
Rule: pre-retrieve up front only for a stable corpus the step always needs (CLAUDE.md, the spec). Source: CE. Carrier: session-start load.
Rule: a corpus under about 200K tokens goes into context with caching; build no index. Source: CR. Carrier: ponytail rung 1.
Rule: where an index exists, use contextual chunks, BM25 and rerank. Source: CR. Carrier: mempalace, which already combines BM25 with vectors.
Rule: tag every retrieved claim EXTRACTED, INFERRED or AMBIGUOUS and carry the tag into the brief. Source: graphify audit trail. Carrier: conductor-standard section 6.
Rule: the conductor injects a bounded prior of 3 to 5 hits from mempalace and docs/fixes into each brief, not a history dump. Source: CE. Carrier: conductor-standard section 2.
Rule: keep memory fresh through the post-commit graph update and a read-only memory-audit wave. Source: CE ("regularly writes notes"). Carrier: git hook plus audit wave.

## 4. DAGs

```yaml
# why: a wave plan is a dependency graph; writing it as one makes ordering, ownership and resume explicit
plan_file:      .claude/waves/<date>-<slug>.md
node:           one worker with a disjoint write root
edge:           a dependency: the later node reads the earlier node's artifact
independent:    nodes with no edge launch together in one controller message
fan_out:        MAR: "Simple fact-finding requires just 1 agent with 3-10 tool calls"; "complex research might use more than 10 subagents with clearly divided responsibilities"
usual_shape:    MAR: "the lead agent spins up 3-5 subagents in parallel rather than serially"
node_brief:     MAR: "Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries."
durability:     MAR: "we built systems that can resume from where the agent was when the errors occurred"
cost:           MAR: "multi-agent systems use about 15× more tokens than chats"; fan out only when the task earns it
```

Rule: write every wave plan as a DAG with disjoint write roots per node. Source: MAR. Carrier: conductor-standard section 2.
Rule: size fan-out to coverage; 3 to 5 parallel is the usual research shape, 1 agent for a lookup. Source: MAR. Carrier: wave plan.
Rule: resume from the failed node using the journal and git state, not from node 1. Source: MAR. Carrier: fable-long-horizon journal.
Rule: commits of record happen only at CLOSE, authored by the conductor. Source: conductor-standard. Carrier: section 1 lanes.
Rule: overlapping scopes get worktrees. Source: CC sub-agents. Carrier: conductor-standard section 2.
Rule: when a pipeline repeats, the Workflow tool is the executor and the DAG file is its input. Source: CC. Carrier: Workflow tool.

## 5. Graphs

```yaml
# why: a structure question answered from a graph costs a query, not a re-read of the tree
code_graph:     graphify or codebase-memory-mcp answers "what calls X", "what depends on Y", "where does Z live"
memory_graph:   mempalace wings hold per-project memory; tunnels link projects that share a fact
status:         both optional, detected at setup, advisory; the build does not block on a missing graph
audit:          graph answers carry the EXTRACTED, INFERRED or AMBIGUOUS tag; INFERRED edges are checked in source before a decision rests on them
```

Rule: ask the code graph a structure question before reading files to answer it. Source: CE (just-in-time). Carrier: graphify or codebase-memory-mcp.
Rule: link projects through mempalace tunnels, not by copying notes between repos. Source: CE (memory outside the window). Carrier: mempalace.
Rule: a missing graph degrades to grep and read, and setup continues. Source: BEA (simplest solution). Carrier: setup detection.

## 6. Context discipline

```yaml
# why: workers that return their whole transcript burn the conductor's context
worker_return:  CE: each sub-agent "returns only a condensed, distilled summary of its work (often 1,000-2,000 tokens)."
tools:          CE: "tools should be self-contained, robust to error, and extremely clear with respect to their intended use."
notes:          CE: "the agent regularly writes notes persisted to memory outside of the context window."
spawn_depth:    CC: a sub-agent can spawn sub-agents up to three layers unless CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1
frontmatter:    CC: model (sonnet, opus, haiku, fable, inherit), effort (low to max) and a tools allowlist
hooks:          CC: SubagentStart can inject context into a worker; SubagentStop can hold a worker with a reason
```

Rule: workers return 1 to 2K token summaries with file paths for detail. Source: CE. Carrier: the brief contract in persona-template.md.
Rule: give each agent the minimum tools, with no two tools covering the same job. Source: CE. Carrier: agent frontmatter allowlist.
Rule: the task journal is the structured note store and survives compaction. Source: CE. Carrier: fable-long-horizon journal.
Rule: CLAUDE.md carries compaction instructions naming what to keep. Source: CC best-practices. Carrier: generated CLAUDE.md.
Rule: load references on demand through the skill map, not all at once. Source: CE (progressive disclosure). Carrier: references directory.
Rule: compress what a leg reads and returns with vetted local tools, and never treat compressed output as evidence. Source: owner doctrine (2026-10-14). Carrier: references/token-economy.md.

## 7. Evaluation

```yaml
# why: judge the outcome a user would see; process graders reject valid routes
end_state:      MAR: "Instead of judging whether the agent followed a specific process, evaluate whether it achieved the correct final state."
llm_judge:      MAR: "a single LLM call with a single prompt outputting scores from 0.0-1.0 and a pass-fail grade"
verifier:       CC best-practices: give Claude a check it can run; an adversarial reviewer in a fresh subagent sees only the diff and the criteria
plan_mode:      CC: plan mode separates exploration from execution
```

Rule: grade the end state, not the route. Source: MAR. Carrier: conductor-standard section 6.
Rule: each review swarm lens returns a 0 to 1 score and pass or fail, with evidence. Source: MAR. Carrier: review-swarms.md.
Rule: the verifier is a fresh agent told to refute the claim, given the diff and the criteria only. Source: CC. Carrier: cold-context VERIFY stage.
Rule: show evidence (command, output, diff); do not assert it. Source: CC best-practices. Carrier: conductor-standard section 6.

## Summary

| Principle | Source | Eidolon mechanism |
|---|---|---|
| Simplest pattern first, escalate on evidence | BEA | Five-pattern map and the ponytail ladder (conductor-standard sections 1, 2, 10) |
| Every loop has an evaluator, a stop and a budget | BEA, CC | `/goal`, `/loop`, routines, and the loop-suite wave contract |
| Retrieve just in time; index only when it earns it | CE, CR | grep, read and graph queries; mempalace hybrid search; bounded 3 to 5 hit prior |
| Plan waves as a DAG, resume from the failed node | MAR | `.claude/waves/<date>-<slug>.md`, journal plus git state, Workflow tool |
| Workers return distilled summaries | CE, MAR | 1 to 2K token returns, minimal tool allowlists, SubagentStart and SubagentStop hooks |
| Judge the end state with a fresh verifier | MAR, CC | REVIEW score, cold-context VERIFY, evidence shown at CLOSE |
