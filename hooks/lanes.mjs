// Per-agent write lanes from .claude/agent-scopes.json: { "<agent>": { "read": [...], "write": [...] } }.
// Roots are prefixes relative to the project root: "src/**" and "docs/" mean a subtree, "hooks/x.mjs" one file.
import {readFileSync} from 'node:fs';
import {isAbsolute, join, relative, resolve} from 'node:path';
import {actorIdentity, policyRoot, escapesRoot, fileTarget} from './operation.mjs';
import {inlineBodies, shellPathFacts, tolerant} from './shell-operation.mjs';

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

// ponytail: the shell lane sees redirects, the verbs shellPathFacts models (rm, mv, cp, ln, touch, mkdir, tee, sed -i,
// Set-Content, git checkout...) and the path-shaped string literals of an interpreter's inline body; a script file is
// opaque to it. Upgrade path: run workers in a sandbox with a read-only mount.
const PATH_LITERAL = /['"]([\w.\/\\-]*[\/\\.][\w.\/\\-]*)['"]/g;
export const evalLane = tolerant(j => {
  const lane = laneOf(j);
  if (!lane) return null;
  const root = policyRoot(j);
  const block = why => ({kind: 'block', label: 'WRITE LANE GUARD', why});
  const toRel = path => relative(root, path).replace(/\\/g, '/');
  const leaves = (rel) => rel === '..' || rel.startsWith('../') || isAbsolute(rel);
  const outside = (rel) => !inRoots(rel, lane.write) && block(
    `worker ${lane.type} may write only under ${lane.write.join(', ') || '(nothing)'}; ${rel} is outside its lane. Return the change to the controller.`);
  const outsideRootVerdict = block(`worker ${lane.type} may not write outside the project root. Return the change to the controller.`);
  if (j.tool_name === 'Write' || j.tool_name === 'Edit') {
    if (escapesRoot(j)) return outsideRootVerdict;
    return outside(toRel(fileTarget(j))) || null;
  }
  if (j.tool_name !== 'Bash') return null;
  const command = String(j.tool_input?.command || ''), cwd = j.cwd || root;
  for (const f of shellPathFacts(command, cwd, root, j.shell_language, true)) {
    // A link made in the lane must not point out of it: the lane would then write through it.
    const target = f.op === 'link' ? f.via ?? f.path : f.path;
    if (!target || !['write', 'append', 'delete', 'link'].includes(f.op)) continue;
    const rel = toRel(target);
    if (leaves(rel)) return outsideRootVerdict;
    const verdict = outside(rel);
    if (verdict) return verdict;
  }
  for (const body of inlineBodies(command, j.shell_language))
    for (const [, literal] of body.matchAll(PATH_LITERAL)) {
      const rel = toRel(resolve(cwd, literal.replace(/\\/g, '/')));
      const verdict = leaves(rel) ? outsideRootVerdict : outside(rel);
      if (verdict) return verdict;
    }
  return null;
});
