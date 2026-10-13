// Per-agent write lanes from .claude/agent-scopes.json: { "<agent>": { "read": [...], "write": [...] } }.
// Roots are prefixes relative to the project root: "src/**" and "docs/" mean a subtree, "hooks/x.mjs" one file.
import {readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {actorIdentity, policyRoot, outsideRoot, fileTarget} from './operation.mjs';
import {shellPathFacts, tolerant} from './shell-operation.mjs';

export function scopeOf(root, agentType) {
  try {
    const scopes = JSON.parse(readFileSync(join(root, '.claude', 'agent-scopes.json'), 'utf8'));
    const entry = typeof agentType === 'string' && Object.hasOwn(scopes, agentType) ? scopes[agentType] : null;
    return entry && typeof entry === 'object' ? entry : null;
  } catch { return null; }
}

const norm = p => (process.platform === 'win32' ? p.toLowerCase() : p);
export function inRoots(rel, roots) {
  const path = norm(rel.replace(/\\/g, '/'));
  return (roots || []).some(root => {
    const base = norm(String(root).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/?\*\*$/, '').replace(/\/$/, ''));
    return base === '' || path === base || path.startsWith(base + '/');
  });
}

// The lane a worker is held to, or null when it has none: the controller, a worker whose
// input carries no agent_type, and an agent with no entry are all unconstrained.
function laneOf(j) {
  if (!actorIdentity(j).worker || typeof j.agent_type !== 'string') return null;
  const scope = scopeOf(policyRoot(j), j.agent_type);
  return scope ? {type: j.agent_type, write: Array.isArray(scope.write) ? scope.write : []} : null;
}

// ponytail: the shell lane sees redirects and the verbs shellPathFacts knows (rm, mv, cp, tee, sed -i, Set-Content...);
// an interpreter body (node -e) is opaque to it. Upgrade path: run workers in a sandbox with a read-only mount.
export const evalLane = tolerant(j => {
  const lane = laneOf(j);
  if (!lane) return null;
  const root = policyRoot(j);
  const outside = (rel) => !inRoots(rel, lane.write) && {kind: 'block', label: 'WRITE LANE GUARD', why:
    `worker ${lane.type} may write only under ${lane.write.join(', ') || '(nothing)'}; ${rel} is outside its lane. Return the change to the controller.`};
  if (j.tool_name === 'Write' || j.tool_name === 'Edit') {
    if (outsideRoot(j)) return null;
    return outside(relative(root, fileTarget(j)).replace(/\\/g, '/')) || null;
  }
  if (j.tool_name !== 'Bash') return null;
  const facts = shellPathFacts(String(j.tool_input?.command || ''), j.cwd || root, root, j.shell_language, true);
  for (const f of facts) {
    if (!['write', 'append', 'delete'].includes(f.op) || !f.path) continue;
    const rel = relative(root, f.path).replace(/\\/g, '/');
    if (rel.startsWith('..') || /^[a-z]:/i.test(rel)) continue;
    const verdict = outside(rel);
    if (verdict) return verdict;
  }
  return null;
});
