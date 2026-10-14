// SubagentStop: log the outcome, and send a worker that reports no evidence back once.
// Advisory; stop_hook_active true (already sent back) or any failure lets the worker stop.
import {existsSync} from 'node:fs';
import {isAbsolute, relative, resolve} from 'node:path';
import {runHook} from './lib.mjs';
import {policyRoot} from './operation.mjs';
import {appendLog} from './dispatch-evaluators.mjs';

// Evidence is a backtick-quoted command, an "Evidence:" line with text (markdown emphasis and list markers around the
// label are ignored, so "**Evidence:** x" and "- Evidence: x" count), or a path that exists under the project root.
// ponytail: it proves the report names something real, not that the done-check passed; upgrade path is re-running the named command.
const NAMED = /`[^`\n]+`|^[ \t]*(?:[-*>][ \t]+)?evidence[ \t]*:[ \t]*\S/im;
const PATH = /[\w.-]+(?:[\/\\][\w.-]+)+/g;
const hasEvidence = (message, root) => NAMED.test(message.replace(/[*_]+/g, '')) || (message.match(PATH) ?? []).some(p => {
  const file = resolve(root, p.replace(/[.-]+$/, '').replace(/\\/g, '/')), rel = relative(root, file);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && existsSync(file);
});

runHook(j => {
  const message = typeof j.last_assistant_message === 'string' ? j.last_assistant_message : '';
  const root = policyRoot(j), evidence = hasEvidence(message, root);
  appendLog(root, {kind: 'outcome', ts: new Date().toISOString(), agent_id: j.agent_id ?? null, agent_type: j.agent_type ?? null, evidence});
  if (!evidence && j.stop_hook_active !== true) {
    process.stdout.write(JSON.stringify({decision: 'block', reason: 'Before you finish: name the command or file that proves your done-check, the paths you changed, and what you did not do.'}));
    return;
  }
  process.stdout.write(JSON.stringify({hookSpecificOutput: {hookEventName: 'SubagentStop',
    additionalContext: `worker ${j.agent_type ?? 'unknown'} stopped; verify its done-check by state before accepting its report`}}));
}, {enforcement: false});
