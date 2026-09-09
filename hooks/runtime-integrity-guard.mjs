// The agent cannot modify its installed policy authority. Operator maintenance is separate.
import {relative} from 'node:path';
import {policyRoot, proposedFile} from './operation.mjs';
import {shellPathFacts} from './shell-operation.mjs';
const MANAGED = /^(?:\.(?:agents|claude)\/skills\/eidolon(?:\/|$)|\.eidolon\/(?:policy-manifest\.json|sessions(?:\/|$))|\.claude\/(?:eidolon-manifest\.yaml|security-grader-public\.pem|security-attestation\.json)|\.codex\/(?:hooks\.json|config\.toml|rules(?:\/|$)))/i;
export function evalRuntimeIntegrity(j) {
  const block = why=>({kind:'block',label:'RUNTIME INTEGRITY GUARD',why});
  const root=policyRoot(j);
  try {
    if (j.tool_name==='Write'||j.tool_name==='Edit') {
      const {path}=proposedFile(j), rel=relative(root,path).replace(/\\/g,'/');
      if (MANAGED.test(rel)) return block('The installed runtime, actor state or policy trust root requires operator-controlled maintenance. Do not alter it from an ordinary agent tool call.');
    } else if (j.tool_name==='Bash'||j.tool_name==='PowerShell') {
      const facts=shellPathFacts(j.tool_input?.command||'',j.cwd||root,root,j.shell_language||(/^PowerShell$/i.test(j.tool_name)?'powershell':'bash'));
      if (facts.some(f=>f.mutation&&f.kind==='authority')) return block('This shell operation changes managed agent authority. Use a separate reviewed update outside the agent.');
    }
    return null;
  } catch {
    return block('Unable to validate this managed file or shell operation. Use a supported exact operation; input values were not logged.');
  }
}
