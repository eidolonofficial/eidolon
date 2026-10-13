// The agent cannot modify its installed policy authority. Operator maintenance is separate.
import {relative, basename} from 'node:path';
import {policyRoot, proposedFile, outsideRoot} from './operation.mjs';
import {shellPathFacts, shellCommands, executable, ShellParseError} from './shell-operation.mjs';
import {evalHookIntegrity} from './hook-integrity-guard.mjs';
const MANAGED = /^(?:\.claude\/skills\/eidolon(?:\/|$)|\.eidolon\/(?:policy-manifest\.json|sessions(?:\/|$))|\.claude\/eidolon-manifest\.yaml)/i;
// An interpreter's inline body (node -e, python -c, pwsh -Command, bash -c) is opaque to the path facts.
// Naming an authority path in one is consent tier: a legitimate script may touch it with the human watching.
const INTERPRETER = /^(?:node|nodejs|bun|deno|python[\d.]*|py|perl|ruby|pwsh|powershell|bash|sh|zsh|dash|ksh)$/;
const INLINE_FLAG = /^(?:-[a-zA-Z]*[ecp]|--eval|--print|-command)$/i;
const AUTHORITY_TEXT = /\.claude[\/\\]+settings(?:\.local)?\.json|\.eidolon[\/\\]+policy-manifest\.json|(?:^|[^\w.-])hooks[\/\\]|['"]hooks['"]/i;
function inlineBodyNamesAuthority(source, language) {
  return shellCommands(source, language).some(({words}) => {
    const w = words.slice(executable(words));
    return INTERPRETER.test(basename(w[0] || '').toLowerCase().replace(/\.exe$/, '')) &&
      w.some(x => INLINE_FLAG.test(x)) && AUTHORITY_TEXT.test(w.slice(1).join(' '));
  });
}
export function evalRuntimeIntegrity(j) {
  const block = why=>({kind:'block',label:'RUNTIME INTEGRITY GUARD',why});
  const root=policyRoot(j);
  try {
    if (j.tool_name==='Write'||j.tool_name==='Edit') {
      if (outsideRoot(j)) return null;
      const {path}=proposedFile(j), rel=relative(root,path).replace(/\\/g,'/');
      if (MANAGED.test(rel)) return block('The installed runtime, actor state or policy trust root requires operator-controlled maintenance. Do not alter it from an ordinary agent tool call.');
      // The write suite does not list hook-integrity-guard, so the repo's own hooks directory is checked here.
      return evalHookIntegrity(j);
    } else if (j.tool_name==='Bash'||j.tool_name==='PowerShell') {
      const command=j.tool_input?.command||'',language=j.shell_language||(/^PowerShell$/i.test(j.tool_name)?'powershell':'bash');
      const facts=shellPathFacts(command,j.cwd||root,root,language);
      if (facts.some(f=>f.mutation&&f.kind==='authority')) return block('This shell operation changes managed agent authority. Use a separate reviewed update outside the agent.');
      if (inlineBodyNamesAuthority(command,language)) return {kind:'ask',label:'RUNTIME INTEGRITY GUARD',why:'an interpreter inline body names a policy authority path (settings, policy manifest or hooks). Approve only if you are watching this change.'};
    }
    return null;
  } catch (e) {
    if (e instanceof ShellParseError) return {kind:'ask',label:'RUNTIME INTEGRITY GUARD',why:'could not parse this command, so no guard could inspect it. Approve only after reading it.'};
    return block('Unable to validate this managed file or shell operation. Use a supported exact operation; input values were not logged.');
  }
}
