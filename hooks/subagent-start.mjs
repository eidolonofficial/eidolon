// SubagentStart: hand the worker its lane, the brief contract and its dispatch record before its first prompt.
// Advisory; any failure leaves the worker uninformed, never blocked.
import {runHook} from './lib.mjs';
import {policyRoot} from './operation.mjs';
import {scopeOf} from './lanes.mjs';
import {readLog} from './dispatch-evaluators.mjs';

const roots = list => Array.isArray(list) && list.length ? list.join(', ') : '(none)';

runHook(j => {
  const root = policyRoot(j), type = j.agent_type, scope = scopeOf(root, type);
  const dispatched = readLog(root).findLast(l => l.kind === 'dispatch' && l.agent_type === type);
  const context = [
    scope ? `Your lane (${type}) - read: ${roots(scope.read)}; write: ${roots(scope.write)}. Writes outside it are blocked, except scratch files under the OS temp directory or /tmp/ (no exception when the project itself sits inside them).` : 'Your lane: no lane recorded.',
    'Brief contract: return a 1 to 2K token summary with evidence (command and output, or file and line) and the state you changed as paths.',
    'State what you did not do, and for your central claim give cause, falsifier, evidence.',
    dispatched && `Dispatch record: ${JSON.stringify(dispatched)}`,
  ].filter(Boolean).join('\n');
  process.stdout.write(JSON.stringify({hookSpecificOutput: {hookEventName: 'SubagentStart', additionalContext: context}}));
}, {enforcement: false});
