// The agent cannot modify its installed policy authority. Operator maintenance is separate.
import {relative} from 'node:path';
import {policyRoot, proposedFile, outsideRoot} from './operation.mjs';
import {shellPathFacts, inlineBodies, substitutionBodies, NAMES_PROTECTED, ShellParseError} from './shell-operation.mjs';
import {evalHookIntegrity} from './hook-integrity-guard.mjs';
const MANAGED = /^(?:\.claude\/skills\/eidolon(?:\/|$)|\.eidolon\/(?:policy-manifest\.json|sessions(?:\/|$))|\.claude\/eidolon-manifest\.yaml)/i;
// An interpreter's inline body (node -e, python -c, pwsh -Command, bash -c) and a $( ) substitution are
// opaque to the path facts. Naming git or a protected path in one is consent tier: a legitimate script may
// do it with the human watching.
const AUTHORITY_TEXT = /\.claude[\/\\]+settings(?:\.local)?\.json|\.eidolon[\/\\]+policy-manifest\.json|(?:^|[^\w.-])hooks[\/\\]|['"]hooks['"]/i;
const GIT_WORD = /\bgit\b(?!\s+(?:status|log|diff|show|rev-parse|rev-list|describe|ls-files|ls-tree|cat-file|blame|shortlog|merge-base)\b)/i;
// A line the tokenizer cannot parse still gets the clear block patterns on its raw text before it downgrades to an ask.
const RAW_BLOCKS = [
  /\bgit\b[^\n;&|]*\b(?:commit|push)\b[^\n;&|]*\s--no-veri/i,
  /\bgit\b[^\n;&|]*\bcommit\b[^\n;&|]*\s-[a-zA-Z]*n[a-zA-Z]*(?=\s|$)/i,
  /core\.hookspath/i,
  /\b(?:rm|rmdir|del|unlink|shred|Remove-Item)\b[^\n;&|]*[\s'"=\/\\](?:\.git\b|hooks\b|docs[\/\\]+(?:fixes|insights|decisions)\b|DECISIONS?\.md\b|\.claude[\/\\]+settings)/i,
];
const ask = why => ({kind: 'ask', label: 'RUNTIME INTEGRITY GUARD', why});
export function evalRuntimeIntegrity(j) {
  const block = why=>({kind:'block',label:'RUNTIME INTEGRITY GUARD',why});
  const root=policyRoot(j);
  let command='';
  try {
    if (j.tool_name==='Write'||j.tool_name==='Edit') {
      if (outsideRoot(j)) return null;
      const {path}=proposedFile(j), rel=relative(root,path).replace(/\\/g,'/');
      if (MANAGED.test(rel)) return block('The installed runtime, actor state or policy trust root requires operator-controlled maintenance. Do not alter it from an ordinary agent tool call.');
      // The write suite does not list hook-integrity-guard, so the repo's own hooks directory is checked here.
      return evalHookIntegrity(j);
    } else if (j.tool_name==='Bash'||j.tool_name==='PowerShell') {
      command=String(j.tool_input?.command||'');
      const language=j.shell_language||(/^PowerShell$/i.test(j.tool_name)?'powershell':'bash');
      const facts=shellPathFacts(command,j.cwd||root,root,language);
      if (facts.some(f=>f.mutation&&f.kind==='authority')) return block('This shell operation changes managed agent authority. Use a separate reviewed update outside the agent.');
      const opaque=facts.find(f=>f.kind==='opaque');
      if (opaque) return ask('this command mutates through something the parser cannot place ('+opaque.reason+'), so no guard can tell whether it reaches a record, a hook or the settings. Approve only after reading it.');
      if ([...inlineBodies(command,language),...substitutionBodies(command)].some(b=>NAMES_PROTECTED.test(b)||AUTHORITY_TEXT.test(b)||GIT_WORD.test(b)))
        return ask('an interpreter inline body or a command substitution names git or a policy authority path (settings, policy manifest, hooks, a record). Approve only if you are watching this change.');
    }
    return null;
  } catch (e) {
    if (e instanceof ShellParseError) {
      if (RAW_BLOCKS.some(re=>re.test(command))) return block('This line could not be parsed, and its raw text matches a bypass pattern (a hook-skipping commit, a hooks path override, or a delete of a protected path). Fix the quoting and state the operation plainly.');
      return ask('could not parse this command, so no guard could inspect it. Approve only after reading it.');
    }
    return block('Unable to validate this managed file or shell operation. Use a supported exact operation; input values were not logged.');
  }
}
