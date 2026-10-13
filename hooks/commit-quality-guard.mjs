// Inspect parsed Git arguments; message text is not a command flag.
import {runHook, emitVerdict} from './lib.mjs';
import {gitOperations, overridesHooksPath, tolerant} from './shell-operation.mjs';
import {isShell} from './operation.mjs';
// Git accepts an unambiguous prefix of a long option; --no-veri is the shortest that is not --no-verbose.
const NO_VERIFY = /^--no-veri(?:fy?)?$/;
const FORCE = f => f === '--force' || f === '--force-if-includes' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(f);
// An alias that runs commit or push with a hook-skipping or force flag.
const ALIAS_BYPASS = /(?:^|\s)(?:--no-veri(?:fy?)?|-[a-zA-Z]*n[a-zA-Z]*|--force(?:-if-includes)?|-[a-zA-Z]*f[a-zA-Z]*|\+\S)(?=\s|$)/;
const MIRROR_CONFIG = /^remote\.[^=]*\.(?:mirror|push)$/i;
const INCLUDE_CONFIG = /^include(?:if\.[^=]*)?\.path$/i;
export const evalCommitQuality = tolerant(j => {
  if (j.tool_name && !isShell(j.tool_name)) return null;
  const command = String(j.tool_input?.command || '');
  const B = why => ({kind:'block', label:'COMMIT QUALITY GUARD', why});
  const language = j.shell_language || (/^powershell$/i.test(j.tool_name) ? 'powershell' : 'bash');
  let consent = null; // an ask is returned only when no later operation blocks
  const A = why => consent ??= {kind:'ask', label:'COMMIT QUALITY GUARD', why};
  for (const op of gitOperations(command, j.cwd, language)) {
    const flags = op.flags;
    if (op.subcommand.startsWith('-')) A('a git global option this guard does not know precedes the subcommand, so the real subcommand is hidden. Confirm the command.');
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
  if (/core\.hooksPath\s*=/i.test(command)) return B('Overriding core.hooksPath changes hook authority.');
  return consent;
});
if (process.argv[1]?.replace(/\\/g,'/').endsWith('/commit-quality-guard.mjs')) runHook(j => emitVerdict(evalCommitQuality(j)));
