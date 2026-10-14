// Per-agent write lanes from .claude/agent-scopes.json: { "<agent>": { "read": [...], "write": [...] } }.
// Roots are prefixes relative to the project root: "src/**" and "docs/" mean a subtree, "hooks/x.mjs" one file.
import {existsSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {isAbsolute, join, posix, relative, resolve, sep} from 'node:path';
import {canonicalPath} from './confined-path.mjs';
import {actorIdentity, policyRoot, escapesRoot, fileTarget} from './operation.mjs';
import {gitOperations, inlineBodies, inlineOperands, shellPathFacts, tolerant} from './shell-operation.mjs';

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

// Scratch space a worker may write: the OS temp directory, the literal /tmp/ prefix, and the $TMPDIR, $TEMP and $TMP
// variable forms (never resolved, so the shell parser reports them as tempVariable facts). Every scratch root that
// contains the project root is dropped, or the project's own siblings would count as scratch (on Linux the fixtures and
// many real checkouts sit under /tmp); the variable forms go when the root sits inside either directory, since the
// variable may name the directory that holds it.
const lc = p => process.platform === 'win32' ? p.toLowerCase() : p;
const holds = (dir, root) => (lc(canonicalPath(root)) + sep).startsWith(lc(canonicalPath(dir)) + sep);
export function scratchPolicy(root, osTemp = tmpdir(), literal = '/tmp') {
  const inOs = holds(osTemp, root), inLiteral = holds(literal, root);
  return {osTemp: !inOs, literal: !inLiteral, variables: !inOs && !inLiteral};
}
// The two scratch roots every project gives its workers, always allowed: one inside the project, one in the OS temp directory
// named for the project. Neither contains the project root, so a project that sits inside the temp directory still has both.
export function scratchRoots(root) {
  const canonical = canonicalPath(root);
  return {project: join(canonical, '.eidolon', 'scratch'), temp: join(tmpdir(), 'eidolon-scratch-' + createHash('sha256').update(canonical).digest('hex').slice(0, 12))};
}
const SCRATCH_REL = /^\.eidolon\/scratch(?:\/|$)/i;
function scratch(given, absolute, root) {
  const own = lc(canonicalPath(scratchRoots(root).temp)) + sep;
  if (lc(absolute).startsWith(own) || lc(canonicalPath(absolute)).startsWith(own)) return true;
  const keep = scratchPolicy(root);
  if (keep.literal && /^\/tmp\//.test(posix.normalize(String(given).replace(/\\/g, '/')))) return true;
  return keep.osTemp && lc(absolute).startsWith(lc(canonicalPath(tmpdir())) + sep);
}
// A git command that rewrites the whole worktree or its index. No lane covers the whole tree.
const TREE_REWRITE = /^(?:switch|merge|pull|rebase|am|cherry-pick|revert|read-tree|checkout-index)$/;
function rewritesTree(op) {
  const {subcommand, args} = op;
  if (subcommand === 'stash') return !/^(?:list|show)$/.test(args[0] ?? '');
  if (TREE_REWRITE.test(subcommand)) return true;
  if (subcommand === 'reset') return op.flags.some(f => /^--(?:hard|merge|keep)$/.test(f));
  if (subcommand !== 'checkout' || args.includes('--')) return false;
  // checkout <rev> with no pathspec switches the tree; checkout -b <name> alone does not.
  const revs = []; for (let k = 0; k < args.length; k++) {
    if (/^(?:-b|-B|--orphan|--conflict)$/.test(args[k])) k++;
    else if (args[k] === '-' || !args[k].startsWith('-')) revs.push(args[k]);
  }
  return revs.some(r => r === '-' || !existsSync(resolve(op.cwd, r)));
}
// ponytail: the shell lane sees redirects, the verbs shellPathFacts models (rm, mv, cp, ln, touch, mkdir, tee, sed -i,
// Set-Content, git checkout...) and the path-shaped string literals of an interpreter's inline body; a script file is
// opaque to it. Upgrade path: run workers in a sandbox with a read-only mount.
// Which verdicts a fact kind carries in the lane check: glob (a mutating operand with a glob or variable), bare (an inline body that changes a
// file whose path is not a literal), outside-script (a script file outside the project root).
const PATH_LITERAL = /['"]([\w.\/\\-]*[\/\\.][\w.\/\\-]*)['"]/g;
export const evalLane = tolerant(j => {
  const lane = laneOf(j);
  if (!lane) return null;
  const root = policyRoot(j);
  const block = why => ({kind: 'block', label: 'WRITE LANE GUARD', why});
  const toRel = path => relative(root, path).replace(/\\/g, '/');
  const leaves = (rel) => rel === '..' || rel.startsWith('../') || isAbsolute(rel);
  const outside = (rel) => !inRoots(rel, lane.write) && !SCRATCH_REL.test(rel) && block(
    `worker ${lane.type} may write only under ${lane.write.join(', ') || '(nothing)'}; ${rel} is outside its lane. Return the change to the controller.`);
  const outsideRootVerdict = block(`worker ${lane.type} may not write outside the project root. Return the change to the controller.`);
  if (j.tool_name === 'Write' || j.tool_name === 'Edit') {
    if (escapesRoot(j)) {
      const given = j.tool_input?.file_path ?? j.tool_input?.path;
      if (typeof given === 'string' && given && scratch(given, canonicalPath(resolve(j.eidolon_path_cwd || j.cwd || root, given)), root)) return null;
      return outsideRootVerdict;
    }
    return outside(toRel(fileTarget(j))) || null;
  }
  if (j.tool_name !== 'Bash') return null;
  const command = String(j.tool_input?.command || ''), cwd = j.cwd || root;
  let consent = null; // an ask is returned only when nothing blocks
  for (const f of shellPathFacts(command, cwd, root, j.shell_language, true)) {
    if (f.kind === 'bare') return block(`worker ${lane.type}: an inline body changes a file whose path is not a literal in the command, so its target cannot be checked against the lane (${lane.write.join(', ') || 'nothing'}). Use the Write tool, or name the path in the command.`);
    if (f.kind === 'outside-script') { consent ??= {kind: 'ask', label: 'WRITE LANE GUARD', why: `worker ${lane.type} is running a script outside the project root (${f.path}); its contents cannot be judged against the lane. Approve only after reading it.`}; continue; }
    if (f.kind === 'glob') {
      // A worker's target must be literal: the part of the operand before its first glob character or variable has to sit inside the lane.
      const rel = toRel(f.prefix);
      if (leaves(rel) ? !scratch(f.value, f.prefix, root) : !inRoots(rel, lane.write) && !SCRATCH_REL.test(rel))
        return block(`worker ${lane.type}: a worker's target must be a literal path inside its lane (${lane.write.join(', ') || 'nothing'}); "${f.value}" is a glob or variable operand whose literal prefix is outside it. Name the exact files.`);
      continue;
    }
    // A link made in the lane must not point out of it: the lane would then write through it.
    if (f.tempVariable) { if (scratchPolicy(root).variables || !['write', 'append', 'delete', 'link'].includes(f.op)) continue; return outsideRootVerdict; }
    const target = f.op === 'link' ? f.via ?? f.path : f.path;
    if (!target || !['write', 'append', 'delete', 'link'].includes(f.op)) continue;
    const rel = toRel(target);
    if (leaves(rel) && f.op !== 'link' && scratch(f.value, target, root)) continue;
    if (leaves(rel)) return outsideRootVerdict;
    const verdict = outside(rel);
    if (verdict) return verdict;
  }
  for (const op of gitOperations(command, cwd, j.shell_language, root))
    if (rewritesTree(op)) return block(`worker ${lane.type} may not rewrite the whole worktree (git ${op.subcommand}); no lane covers the whole tree. Return the change to the controller.`);
  // The argv of an inline interpreter body can name the path it writes (node -e "...argv[1]..." docs/y.md).
  for (const operand of inlineOperands(command, j.shell_language)) {
    const abs = resolve(cwd, operand.replace(/\\/g, '/')), rel = toRel(abs);
    if (leaves(rel) && scratch(operand, abs, root)) continue;
    const verdict = leaves(rel) ? outsideRootVerdict : outside(rel);
    if (verdict) return verdict;
  }
  for (const body of inlineBodies(command, j.shell_language))
    for (const [, literal] of body.matchAll(PATH_LITERAL)) {
      const abs = resolve(cwd, literal.replace(/\\/g, '/')), rel = toRel(abs);
      if (leaves(rel) && scratch(literal, abs, root)) continue;
      const verdict = leaves(rel) ? outsideRootVerdict : outside(rel);
      if (verdict) return verdict;
    }
  return consent;
});
