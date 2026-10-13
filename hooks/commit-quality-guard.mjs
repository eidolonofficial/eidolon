// Inspect parsed Git arguments; message text is not a command flag.
import {runHook, emitVerdict, withoutMessage} from './lib.mjs';
import {gitOperations, overridesHooksPath, tolerant} from './shell-operation.mjs';
import {isShell} from './operation.mjs';
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
export const evalCommitQuality = tolerant(j => {
  if (j.tool_name && !isShell(j.tool_name)) return null;
  const command = String(j.tool_input?.command || '');
  const B = why => ({kind:'block', label:'COMMIT QUALITY GUARD', why});
  const language = j.shell_language || (/^powershell$/i.test(j.tool_name) ? 'powershell' : 'bash');
  let consent = null; // an ask is returned only when no later operation blocks
  const A = why => consent ??= {kind:'ask', label:'COMMIT QUALITY GUARD', why};
  const ops = gitOperations(command, j.cwd, language);
  for (const op of ops) {
    const flags = op.flags;
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
