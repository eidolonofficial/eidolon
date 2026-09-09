// Portable, bounded file reads for reviewed context and persona definitions.
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {relative,resolve,sep,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function portablePath(name) {
  if(typeof name!=='string'||!name||name.length>1024||/[\x00-\x1f\x7f<>:"|?*%]/.test(name)||/^[\\/]/.test(name)) throw Error('Unsafe relative path');
  const parts=name.replace(/\\/g,'/').split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error('Unsafe path component');
  return parts.join('/');
}
export function projectPath(root,name) {
  const base=realpathSync(root),clean=portablePath(name),target=resolve(base,...clean.split('/'));
  const rel=relative(base,target);
  if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))throw Error('Path outside approved root');
  let part=base;
  for(const name of clean.split('/')) {
    part=resolve(part,name);
    try {if(lstatSync(part).isSymbolicLink())throw Error('Symlinked context path');}
    catch(e){if(e.code!=='ENOENT')throw e;}
  }
  return target;
}
export function readContext(root,name,expectedHash,maxBytes=32768) {
  if(!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>262144)throw Error('Invalid context limit');
  const path=projectPath(root,name),stat=lstatSync(path);
  if(!stat.isFile()||stat.size>maxBytes)throw Error('Context file missing or too large');
  const bytes=readFileSync(path);
  if(bytes.length>maxBytes||bytes.includes(0))throw Error('Unsupported context content');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),hash=sha256(bytes);
  if(expectedHash&&hash!==expectedHash)throw Error('Context changed since review');
  if(projectPath(root,name)!==path)throw Error('Context path changed');
  return {path:portablePath(name),sha256:hash,text};
}
export function overlap(a,b) {a=portablePath(a).toLowerCase();b=portablePath(b).toLowerCase();return a===b||a.startsWith(b+'/')||b.startsWith(a+'/');}
export function governancePath(path) {return /^(?:\.(?:git|claude|codex|agents|eidolon)(?:\/|$)|hooks(?:\/|$)|AGENTS\.md$|CLAUDE\.md$|references\/personas(?:\/|$))/i.test(portablePath(path));}
