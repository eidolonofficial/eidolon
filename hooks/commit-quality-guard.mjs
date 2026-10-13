// Inspect parsed Git arguments; message text is not a command flag.
import {runHook, emitVerdict} from './lib.mjs';
import {gitOperations, overridesHooksPath, tolerant} from './shell-operation.mjs';
import {isShell} from './operation.mjs';
// Git accepts an unambiguous prefix of a long option; --no-veri is the shortest that is not --no-verbose.
const NO_VERIFY = /^--no-veri(?:fy?)?$/;
export const evalCommitQuality = tolerant(j => {
  if (j.tool_name && !isShell(j.tool_name)) return null;
  const command = String(j.tool_input?.command || '');
  const B = why => ({kind:'block', label:'COMMIT QUALITY GUARD', why});
  const language = j.shell_language || (/^powershell$/i.test(j.tool_name) ? 'powershell' : 'bash');
  for (const op of gitOperations(command, j.cwd, language)) {
    const flags = op.flags;
    if (['commit','push'].includes(op.subcommand) && flags.some(f => NO_VERIFY.test(f) || (op.subcommand === 'commit' && /^-[a-zA-Z]*n[a-zA-Z]*$/.test(f))))
      return B('The Git operation skips hooks. Fix the cause rather than bypassing verification.');
    if (op.subcommand === 'push' && (flags.some(f => f === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(f)) || op.args.some(a => a.startsWith('+'))))
      return B('Unconditional force push can replace history. A lease flag does not cancel an explicit unconditional force flag, and a refspec that begins with + is a force push.');
    if (overridesHooksPath(op))
      return B('Overriding core.hooksPath through a Git option or the environment changes hook authority.');
    if (op.subcommand === 'config' && op.args.some(f => /core\.hooksPath/i.test(f)))
      return B('Changing core.hooksPath changes hook authority; use operator-reviewed maintenance.');
    if (['filter-branch','filter-repo'].includes(op.subcommand))
      return B('History surgery requires explicit operator maintenance, not ordinary agent work.');
  }
  if (/core\.hooksPath\s*=/i.test(command)) return B('Overriding core.hooksPath changes hook authority.');
  return null;
});
if (process.argv[1]?.replace(/\\/g,'/').endsWith('/commit-quality-guard.mjs')) runHook(j => emitVerdict(evalCommitQuality(j)));
