// The agent cannot modify its installed policy authority. Operator maintenance is separate.
import {readdirSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import {basename, dirname, isAbsolute, join, relative} from 'node:path';
import {withoutMessage} from './lib.mjs';
import {actorIdentity, policyRoot, proposedFile, escapesRoot, outsideRoot, rawTarget} from './operation.mjs';
import {shellPathFacts, inlineBodies, substitutionBodies, NAMES_PROTECTED, AUTHORITY_TEXT, GIT_WORD, unescaped, ShellParseError} from './shell-operation.mjs';
import {evalHookIntegrity} from './hook-integrity-guard.mjs';
const MANAGED = /^(?:\.claude\/skills\/eidolon(?:\/|$)|\.eidolon\/(?:policy-manifest\.json|sessions(?:\/|$))|\.claude\/eidolon-manifest\.yaml)/i;
// An interpreter's inline body (node -e, python -c, pwsh -Command, bash -c) and a $( ) substitution are
// opaque to the path facts, except a shell body that names nothing protected, which the facts parse one level
// (shell-operation.mjs). Naming git or a protected path in a body is consent tier: a legitimate script may
// do it with the human watching.
// A line the tokenizer cannot parse still gets the clear block patterns on its raw text before it downgrades to an ask.
const RAW_BLOCKS = [
  /\bgit\b[^\n;&|]*\b(?:commit|push)\b[^\n;&|]*\s--no-veri/i,
  /\bgit\b[^\n;&|]*\bcommit\b[^\n;&|]*\s-[a-zA-Z]*n[a-zA-Z]*(?=\s|$)/i,
  /core\.hookspath/i,
  /\b(?:rm|rmdir|del|unlink|shred|Remove-Item)\b[^\n;&|]*[\s'"=\/\\](?:\.git\b|hooks\b|docs[\/\\]+(?:fixes|insights|decisions)\b|DECISIONS?\.md\b|\.claude[\/\\]+settings)/i,
];
const ask = why => ({kind: 'ask', label: 'RUNTIME INTEGRITY GUARD', why});
// Paths whose shape says record, hook, settings, git directory, policy manifest or a user git config file (an alias source), wherever they live.
const OUTSIDE_SHAPES = [/\/docs\/(?:fixes|insights|decisions)(?:\/|$)/i, /\/DECISIONS?\.md$/i, /\/\.claude\/settings(?:\.local)?\.json$/i, /\/\.git(?:\/|$)/i, /\/policy-manifest\.json$/i,
  /\/\.gitconfig$/i, /\/\.config\/git\/config$/i];
// A shell write, append or delete outside the project root to one of those shapes asks; a worker with a lane is blocked by the lane guard.
// A ~/ operand is read from the home directory, which the shell parser does not expand.
function outsideShellShape(facts, root) {
  for (const f of facts) {
    if (!['write', 'append', 'delete'].includes(f.op) || typeof f.value !== 'string') continue;
    const path = /^~[\/\\]/.test(f.value) ? join(homedir(), f.value.slice(2)) : f.path;
    const rel = path && relative(root, path).replace(/\\/g, '/');
    if (rel && (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) && OUTSIDE_SHAPES.some(re => re.test(path.replace(/\\/g, '/'))))
      return ask('a shell command writes outside the project root to a path shaped like a record, a settings file, a git directory, a policy manifest or a user git config file. Approve only if you are watching this change.');
  }
  return null;
}
function hooksDirWithScripts(path) {
  for (let dir = dirname(path); dir !== dirname(dir); dir = dirname(dir)) {
    if (basename(dir).toLowerCase() !== 'hooks') continue;
    try {if (/\.mjs$/i.test(path) || readdirSync(dir).some(f => /\.mjs$/i.test(f))) return true;} catch {/* a directory that is not there holds no hooks */}
  }
  return false;
}
// A controller's Write or Edit outside the project root is not judged, except a path shaped like something the suite protects.
function outsideShape(j) {
  if (actorIdentity(j).worker) return null; // the lane guard blocks a worker outside the root
  const path = rawTarget(j).replace(/\\/g, '/');
  if (!path || !(OUTSIDE_SHAPES.some(re => re.test(path)) || hooksDirWithScripts(path))) return null;
  return ask('a Write or Edit outside the project root aims at a path shaped like a record, a hooks directory, a settings file, a git directory, a policy manifest or a user git config file. Approve only if you are watching this change.');
}
export function evalRuntimeIntegrity(j) {
  const block = why=>({kind:'block',label:'RUNTIME INTEGRITY GUARD',why});
  const root=policyRoot(j);
  let command='';
  try {
    if (j.tool_name==='Write'||j.tool_name==='Edit') {
      const outsideVerdict=escapesRoot(j)?outsideShape(j):null;
      if (outsideRoot(j)) return outsideVerdict;
      const {path}=proposedFile(j), rel=relative(root,path).replace(/\\/g,'/');
      if (MANAGED.test(rel)) return block('The installed runtime, actor state or policy trust root requires operator-controlled maintenance. Do not alter it from an ordinary agent tool call.');
      // A file with a second name may be a record or a hook: writing through it rewrites the other name.
      try {if (statSync(path).nlink>1) return block('This file has more than one hard link, so writing it could rewrite a record, a hook or an authority file under another name. Use operator-reviewed maintenance.');} catch (e) {if (e.code!=='ENOENT') throw e;}
      // The write suite does not list hook-integrity-guard, so the repo's own hooks directory is checked here.
      return evalHookIntegrity(j)??outsideVerdict;
    } else if (j.tool_name==='Bash'||j.tool_name==='PowerShell') {
      command=String(j.tool_input?.command||'');
      const language=j.shell_language||(/^PowerShell$/i.test(j.tool_name)?'powershell':'bash');
      const facts=shellPathFacts(command,j.cwd||root,root,language,true);
      // The fact's own op decides: a read-only source named to a mutating verb (cp settings.json /tmp/x) is not a change to it.
      if (facts.some(f=>f.op&&f.kind==='authority')) return block('This shell operation changes managed agent authority. Use a separate reviewed update outside the agent.');
      // Writing, appending to, truncating or deleting through a second name rewrites the record, hook or authority file behind it.
      for (const f of facts) {
        if (!['write','append','delete'].includes(f.op)||!f.path) continue;
        try {if (statSync(f.path).isFile()&&statSync(f.path).nlink>1) return block('This shell operation writes a file that has more than one hard link, so it could rewrite a record, a hook or an authority file under another name. Use operator-reviewed maintenance.');} catch (e) {if (e.code!=='ENOENT'&&e.code!=='ENOTDIR') throw e;}
      }
      const unsafe=facts.find(f=>f.kind==='unsafe');
      if (unsafe) return block('This extraction is unsafe: '+unsafe.reason+'. Extract it somewhere that cannot reach a protected path, or list and review the archive first.');
      const outside=outsideShellShape(facts,root);
      if (outside) return outside;
      const opaque=facts.find(f=>f.kind==='opaque');
      if (opaque) return ask('this command mutates through something the parser cannot place ('+opaque.reason+'), so no guard can tell whether it reaches a record, a hook or the settings. Approve only after reading it.');
      if ([...inlineBodies(command,language),...substitutionBodies(command)].flatMap(b=>[b,unescaped(b)]).some(b=>NAMES_PROTECTED.test(b)||AUTHORITY_TEXT.test(b)||GIT_WORD.test(b)))
        return ask('an interpreter inline body or a command substitution names git or a policy authority path (settings, policy manifest, hooks, a record). Approve only if you are watching this change.');
    }
    return null;
  } catch (e) {
    if (e instanceof ShellParseError) {
      if (RAW_BLOCKS.some(re=>re.test(withoutMessage(command)))) return block('This line could not be parsed, and its raw text matches a bypass pattern (a hook-skipping commit, a hooks path override, or a delete of a protected path). Fix the quoting and state the operation plainly.');
      return ask('could not parse this command, so no guard could inspect it. Approve only after reading it.');
    }
    return block('Unable to validate this managed file or shell operation. Use a supported exact operation; input values were not logged.');
  }
}
