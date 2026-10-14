// Inspect parsed Git arguments; message text is not a command flag.
import {runHook, emitVerdict, withoutMessage} from './lib.mjs';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {branchTracking, gitOperations, overridesGitDir, overridesHooksPath, protectedKind, tolerant} from './shell-operation.mjs';
import {actorIdentity, isShell, policyRoot} from './operation.mjs';
// Git accepts an unambiguous prefix of a long option; --no-veri is the shortest that is not --no-verbose.
const NO_VERIFY = /^--no-veri(?:fy?)?$/;
const FORCE = f => f === '--force' || f === '--force-if-includes' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(f);
// An alias that runs commit or push with a hook-skipping or force flag.
const ALIAS_BYPASS = /(?:^|\s)(?:--no-veri(?:fy?)?|-[a-zA-Z]*n[a-zA-Z]*|--force(?:-if-includes)?|-[a-zA-Z]*f[a-zA-Z]*|\+\S)(?=\s|$)/;
// A shell argument array ($@, $*, ${arr[@]}) or $args: the words it expands to are not on the command line.
const ARG_ARRAY = /(?:^|[^\\])\$(?:@|\*|args\b)|\$\{[^}]*\[[@*]\]\}/;
// PowerShell (and .NET) ways to set the variables that point Git at another config file, config value or git dir for the commands that follow.
const GIT_ENV = String.raw`GIT_CONFIG_PARAMETERS|GIT_CONFIG_COUNT|GIT_CONFIG_KEY_\d+|GIT_CONFIG_GLOBAL|GIT_CONFIG_SYSTEM|GIT_DIR`;
const GIT_ENV_SETTER = new RegExp(String.raw`\$\{?env:(?:${GIT_ENV})\}?\s*\+?=|\b(?:Set-Item|si|New-Item|ni|Set-Content|sc)\b[^;\n]*\benv:(?:${GIT_ENV})\b|SetEnvironmentVariable\(\s*['"](?:${GIT_ENV})['"]`, 'i');
// A git subcommand that discards uncommitted work when nothing narrows it: a forced switch, a stash that takes untracked or ignored files, a clean with no pathspec.
const FORCED = f => f === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(f);
const MIRROR_CONFIG =/^remote\.[^=]*\.(?:mirror|push)$/i;
const INCLUDE_CONFIG = /^include(?:if\.[^=]*)?\.path$/i;
// ---- Whole-tree commands for the controller. checkout <rev>, switch, merge, rebase, cherry-pick, revert and pull change the worktree to
// match another commit; the files that would change are read with read-only git commands (rev-parse, diff) and compared with the
// protected paths. A worker is blocked by the lane guard instead. A repository with no commit has no tree to rewrite.
// The one spawner the whole-tree check uses, so a test can count its git calls.
export const gitSpawn = {fn: spawnSync};
const git = (cwd, args) => {
  const r = gitSpawn.fn('git', ['-c', 'core.fsmonitor=false', '-C', cwd, ...args], {encoding: 'utf8', timeout: 5000, windowsHide: true, maxBuffer: 16 * 1024 * 1024, env: {...process.env, GIT_OPTIONAL_LOCKS: '0'}});
  return r.error || r.status !== 0 ? null : r.stdout;
};
const UPSTREAM = '@{upstream}';
// The ref the current branch tracks when git has no answer for @{upstream}: the branch's remote and merge keys in the repository config,
// with the remote-tracking ref they name.
function trackedRef(cwd) {
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])?.trim(); if (!branch || branch === 'HEAD') return null;
  const t = branchTracking(cwd, branch); if (!t) return null;
  const ref = 'refs/remotes/' + t.remote + '/' + t.merge.replace(/^refs\/heads\//, '');
  return resolves(cwd, ref) ? ref : null;
}
const resolves = (cwd, ref) => git(cwd, ['rev-parse', '--verify', '--quiet', '--end-of-options', ref + '^{commit}']) !== null;
// Positional words of a git command, past the options that take a value.
function positionals(args, valued) {
  const out = []; let dd = false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (dd) out.push(a);
    else if (a === '--') dd = true;
    else if (valued.test(a)) k++;
    else if (!a.startsWith('-')) out.push(a);
  }
  return out;
}
const NO_TARGET = /^--(?:abort|continue|skip|quit|edit-todo|show-current-patch)$/;
// What a whole-tree command would compare HEAD with, read from its arguments alone: {refs, diffs} (the refs to resolve and the
// diffs to run), {unresolved: why}, or null when it names no other tree. `orPath` marks a checkout operand that may be a path.
function treeTarget(op, cwd) {
  const {subcommand: sub, args} = op;
  if (args.some(a => NO_TARGET.test(a))) return null;
  if (sub === 'checkout' || sub === 'switch') {
    if (args.includes('--')) return null;
    const pos = positionals(args, sub === 'checkout' ? /^(?:-b|-B|--orphan|--conflict|--pathspec-from-file)$/ : /^(?:-c|-C|--create|--force-create|--conflict)$/);
    if (!pos.length) return null;
    const ref = pos[0] === '-' ? '@{-1}' : pos[0];
    if (sub === 'checkout' && pos.length > 1 && pos.slice(1).some(p => existsSync(resolve(cwd, p)))) return null; // a rev and paths: a pathspec restore
    return {refs: [ref], diffs: [['HEAD', ref]], orPath: sub === 'checkout' && existsSync(resolve(cwd, ref))};
  }
  if (sub === 'merge') {
    const refs = positionals(args, /^(?:-m|-F|-s|-X|--message|--file|--strategy|--strategy-option|-S|--gpg-sign)$/);
    return refs.length ? {refs, diffs: refs.map(r => ['HEAD...' + r])} : {unresolved: '(no commit named)'};
  }
  if (sub === 'rebase') {
    const onto = args.findIndex(a => a === '--onto'), pos = positionals(args, /^(?:--onto|-s|-X|-x|--exec|--strategy|--strategy-option|-C|--empty|--update-refs)$/);
    const ref = onto >= 0 ? args[onto + 1] : pos[0] ?? UPSTREAM;
    return ref ? {refs: [ref], diffs: [['HEAD...' + ref]]} : {unresolved: 'the upstream of the current branch'};
  }
  if (sub === 'cherry-pick' || sub === 'revert') {
    const picks = positionals(args, /^(?:-m|--mainline|-S|--gpg-sign|-s|-X|--strategy|--strategy-option|--cleanup)$/);
    if (!picks.length) return {unresolved: '(no commit named)'};
    const refs = [], diffs = [];
    for (const r of picks) {
      const range = /^(.+?)\.\.(.+)$/.exec(r);
      if (range) {refs.push(range[1], range[2]); diffs.push([range[1], range[2]]);} else {refs.push(r, r + '^'); diffs.push([r + '^', r]);}
    }
    return {refs, diffs};
  }
  if (sub === 'pull') {
    const pos = positionals(args, /^(?:-s|-X|--strategy|--strategy-option|--depth|--deepen|--shallow-since|-j|--jobs|--upload-pack|--negotiation-tip)$/);
    const ref = pos.length >= 2 ? pos[0] + '/' + pos[1] : UPSTREAM;
    return {refs: [ref], diffs: [['HEAD...' + ref]]};
  }
  return null;
}
const WHOLE_TREE = /^(?:checkout|switch|merge|rebase|cherry-pick|revert|pull)$/;
// An ask reason, or null. Added record files are appends; every other change to a protected path counts. The common case costs two
// git spawns: one rev-parse for the top level, HEAD and every ref, and one diff per comparison. Only a failed rev-parse looks further.
function treeChange(op, root) {
  if (!WHOLE_TREE.test(op.subcommand)) return null;
  const cwd = op.cwd, target = treeTarget(op, cwd);
  if (!target) return null;
  const unresolved = what => `git ${op.subcommand} names ${what}, which cannot be resolved here, so the guard cannot tell which protected files it would change. Confirm the command.`;
  let {refs = [], diffs = []} = target, top;
  const out = refs.some(r => r.startsWith('-')) ? null : git(cwd, ['rev-parse', '--show-toplevel', 'HEAD^{commit}', ...refs.map(r => r + '^{commit}')]);
  if (out !== null) top = out.split('\n')[0].trim();
  else {
    // A repository with no commit has no tree to rewrite.
    if (!resolves(cwd, 'HEAD')) return null;
    if (target.unresolved) return unresolved(target.unresolved);
    if (refs.includes(UPSTREAM) && !resolves(cwd, UPSTREAM)) {
      const tracked = trackedRef(cwd);
      if (!tracked) return unresolved('the upstream of the current branch');
      const swap = x => x.replace(UPSTREAM, tracked);
      refs = refs.map(swap); diffs = diffs.map(d => d.map(swap));
    }
    const bad = refs.find(r => !resolves(cwd, r));
    if (bad !== undefined) return target.orPath ? null : unresolved(bad);
    top = git(cwd, ['rev-parse', '--show-toplevel'])?.trim();
  }
  if (target.unresolved) return unresolved(target.unresolved);
  if (!top) return null;
  const hits = new Set();
  for (const diff of diffs) {
    const listing = git(cwd, ['diff', '--name-status', '--no-renames', '-z', ...diff, '--']);
    if (listing === null) return `git ${op.subcommand} compares HEAD with a commit the guard could not read, so it cannot tell which protected files change. Confirm the command.`;
    const parts = listing.split('\0');
    for (let k = 0; k + 1 < parts.length; k += 2) {
      const [status, file] = [parts[k], parts[k + 1]];
      const kind = protectedKind(resolve(top, file), cwd, root);
      if (kind && !(kind === 'record' && status === 'A')) hits.add(file);
    }
  }
  if (!hits.size) return null;
  const list = [...hits];
  return `git ${op.subcommand} would change protected files (hooks, settings, the policy manifest or a record): ${list.slice(0, 10).join(', ')}${list.length > 10 ? ', and ' + (list.length - 10) + ' more' : ''}. Confirm the command.`;
}
const isWorker = j => { try {return actorIdentity(j).worker;} catch {return true;} };

export const evalCommitQuality = tolerant(j => {
  if (j.tool_name && !isShell(j.tool_name)) return null;
  const command = String(j.tool_input?.command || '');
  const B = why => ({kind:'block', label:'COMMIT QUALITY GUARD', why});
  const language = j.shell_language || (/^powershell$/i.test(j.tool_name) ? 'powershell' : 'bash');
  let consent = null; // an ask is returned only when no later operation blocks
  const A = why => consent ??= {kind:'ask', label:'COMMIT QUALITY GUARD', why};
  const root = policyRoot(j), worker = isWorker(j);
  const ops = gitOperations(command, j.cwd, language, root);
  for (const op of ops) {
    const flags = op.flags;
    if (!worker) { const why = treeChange(op, root); if (why) A(why); }
    if (op.subcommand.startsWith('-')) A('a git global option this guard does not know precedes the subcommand, so the real subcommand is hidden. Confirm the command.');
    if ([op.subcommand, ...op.args.filter(a => !op.messages.includes(a))].some(a => ARG_ARRAY.test(a) || (language === 'powershell' && /^@\w+$/.test(a))))
      A('a splat or an expanded argument array supplies git arguments this guard cannot read. Confirm the command.');
    // Whole-tree commands that throw away uncommitted work. Switching, merging, pulling, rebasing and stashing leave the prior tree in history.
    if ((op.subcommand === 'reset' && flags.some(f => /^--(?:hard|merge|keep)$/.test(f)))
      || (op.subcommand === 'checkout-index' && flags.some(f => f === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(f)))
      || (op.subcommand === 'read-tree' && flags.some(f => f === '--reset' || /^-[a-zA-Z]*u[a-zA-Z]*$/.test(f))))
      A('this command overwrites the worktree and can discard uncommitted work. Confirm the command.');
    const pathspec = []; // clean's operands, past the values of -e and --exclude
    for (let k = 0; k < op.args.length; k++) { if (/^(?:-e|--exclude)$/.test(op.args[k])) k++; else if (!op.args[k].startsWith('-')) pathspec.push(op.args[k]); }
    if ((op.subcommand === 'checkout' && !op.args.includes('--') && flags.some(FORCED))
      || (op.subcommand === 'switch' && flags.some(f => FORCED(f) || f === '--discard-changes'))
      || (op.subcommand === 'stash' && flags.some(f => f === '--include-untracked' || f === '--all' || /^-[a-zA-Z]*[ua][a-zA-Z]*$/.test(f)))
      || (op.subcommand === 'clean' && flags.some(FORCED) && !flags.some(f => /^(?:--dry-run|-[a-zA-Z]*n[a-zA-Z]*)$/.test(f)) && !pathspec.length))
      A('this command throws away uncommitted work (a forced switch, a stash of untracked or ignored files, or a clean with no pathspec). Confirm the command.');
    if (['commit','push'].includes(op.subcommand) && flags.some(f => NO_VERIFY.test(f) || (op.subcommand === 'commit' && /^-[a-zA-Z]*n[a-zA-Z]*$/.test(f))))
      return B('The Git operation skips hooks. Fix the cause rather than bypassing verification.');
    if (op.subcommand === 'push' && (flags.some(FORCE) || op.args.some(a => a.startsWith('+'))))
      return B('Unconditional force push can replace history. A lease flag does not cancel an explicit unconditional force flag, and a refspec that begins with + is a force push.');
    if (op.subcommand === 'push' && (flags.includes('--mirror') || op.config.some(c => /^remote\.[^=]*\.mirror=(?:true|1|yes|on)$/i.test(c))))
      return B('A mirror push overwrites or deletes every remote ref.');
    if (op.config.some(c => /^remote\.[^=]*\.push=/i.test(c) || /^include(?:if\.[^=]*)?\.path=/i.test(c)))
      return B('A push refspec or an included config file changes what Git does next without a visible command; use operator-reviewed maintenance.');
    if (overridesHooksPath(op))
      return B('Overriding core.hooksPath, or the global or system config file that could set it, through a Git option or the environment changes hook authority.');
    if (overridesGitDir(op, root))
      return B('Pointing GIT_DIR at a repository other than this project\'s own .git makes git read that repository\'s config and hooks; use operator-reviewed maintenance.');
    if (op.subcommand === 'config') {
      const [key = '', value = ''] = op.args.filter(a => !a.startsWith('-'));
      if (/core\.hooksPath/i.test(op.args.join(' '))) return B('Changing core.hooksPath changes hook authority; use operator-reviewed maintenance.');
      if (MIRROR_CONFIG.test(key) || INCLUDE_CONFIG.test(key)) return B('A mirror or push-refspec setting, or an included config file, changes what Git does next without a visible command; use operator-reviewed maintenance.');
      if (/^alias\./i.test(key) && /\b(?:commit|push)\b/.test(value) && ALIAS_BYPASS.test(value)) return B('An alias that skips hooks or forces a push hides the bypass from every later command.');
    }
    if (op.subcommand === 'push' && (flags.some(f => f === '--delete' || /^-[a-zA-Z]*d[a-zA-Z]*$/.test(f)) || op.args.some(a => /^:./.test(a))))
      A('this push deletes a remote ref. Confirm the branch or tag.');
    if (['filter-branch','filter-repo'].includes(op.subcommand))
      return B('History surgery requires explicit operator maintenance, not ordinary agent work.');
  }
  if (/core\.hooksPath\s*=/i.test(withoutMessage(command))) return B('Overriding core.hooksPath changes hook authority.');
  if (ops.length && GIT_ENV_SETTER.test(withoutMessage(command))) return B('Setting a Git config, config-file or git-dir environment variable in the same command that runs git changes hook authority; use operator-reviewed maintenance.');
  return consent;
});
if (process.argv[1]?.replace(/\\/g,'/').endsWith('/commit-quality-guard.mjs')) runHook(j => emitVerdict(evalCommitQuality(j)));
