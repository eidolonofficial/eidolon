// SubagentStop: log the outcome, and send a worker that reports no evidence back once.
// Advisory; stop_hook_active true (already sent back) or any failure lets the worker stop.
import {runHook} from './lib.mjs';
import {policyRoot} from './operation.mjs';
import {appendLog} from './dispatch-evaluators.mjs';

// ponytail: evidence is a keyword or a path or backtick token in the last message; upgrade path is checking the named file exists.
const EVIDENCE = /evidence|[\w.-]+\/[\w.-]+|`[^`\n]+`/i;

runHook(j => {
  const message = typeof j.last_assistant_message === 'string' ? j.last_assistant_message : '';
  const evidence = EVIDENCE.test(message);
  appendLog(policyRoot(j), {kind: 'outcome', ts: new Date().toISOString(), agent_id: j.agent_id ?? null, agent_type: j.agent_type ?? null, evidence});
  if (!evidence && j.stop_hook_active !== true) {
    process.stdout.write(JSON.stringify({decision: 'block', reason: 'Before you finish: name the command or file that proves your done-check, the paths you changed, and what you did not do.'}));
    return;
  }
  process.stdout.write(JSON.stringify({hookSpecificOutput: {hookEventName: 'SubagentStop',
    additionalContext: `worker ${j.agent_type ?? 'unknown'} stopped; verify its done-check by state before accepting its report`}}));
}, {enforcement: false});
