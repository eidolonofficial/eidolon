// Managed wiring is compared structurally, not by finding a filename in arbitrary text.
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {confinedPath} from './codex-patch.mjs';
import {boundedRead} from './operation.mjs';
export const MANIFEST = '.eidolon/policy-manifest.json';
export function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k => JSON.stringify(k)+':'+stable(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function manifestAt(root) {
  const path = confinedPath(root, root, MANIFEST);
  if (!existsSync(path)) {
    if (/[\\/]\.(?:claude|agents)[\\/]skills[\\/]eidolon[\\/]/.test(fileURLToPath(import.meta.url))) throw Error('Managed installation has no policy manifest');
    return null;
  }
  const value = JSON.parse(boundedRead(path, 1048576).toString('utf8'));
  if (value?.version !== 1 || !Array.isArray(value.configurations) || !Array.isArray(value.protectedPaths)) throw Error('Invalid managed policy manifest');
  if(value.configurations.length>4||value.protectedPaths.length>128||value.protectedPaths.some(x=>typeof x!=='string'||!x))throw Error('Invalid policy inventory');
  const seen=new Set();
  for(const entry of value.configurations){
    if(!entry||!['.claude/settings.json','.codex/hooks.json'].includes(entry.path)||seen.has(entry.path)||!Array.isArray(entry.handlers)||!entry.handlers.length||entry.handlers.length>128||!Array.isArray(entry.deny)||entry.deny.some(x=>typeof x!=='string'))throw Error('Invalid managed configuration');
    seen.add(entry.path);
    for(const key of entry.handlers){
      if(typeof key!=='string'||key.length>32768)throw Error('Invalid handler key');
      const item=JSON.parse(key);
      if(typeof item.event!=='string'||typeof item.matcher!=='string'||!item.handler||item.handler.type!=='command'||typeof item.handler.command!=='string'||!item.handler.command||item.handler.args!=null&&(!Array.isArray(item.handler.args)||item.handler.args.some(x=>typeof x!=='string')))throw Error('Invalid handler schema');
    }
  }
  if(value.workType!=null&&!['standard','infrastructure'].includes(value.workType))throw Error('Invalid work profile');
  if(value.dispatchContext!=null&&!['required','legacy'].includes(value.dispatchContext))throw Error('Invalid dispatch profile');
  return value;
}
export function handlerKeys(config) {
  if (config.hooks != null && (!config.hooks || Array.isArray(config.hooks) || typeof config.hooks !== 'object')) throw Error('Invalid hook groups');
  const out = new Set();
  for (const [event, groups] of Object.entries(config.hooks || {})) {
    if (!Array.isArray(groups)) throw Error('Invalid hook groups');
    for (const group of groups) {
      if (!group || !Array.isArray(group.hooks)) throw Error('Invalid hook group');
      for (const handler of group.hooks) out.add(stable({event, matcher:group.matcher ?? '', handler}));
    }
  }
  return out;
}
export function assertManagedWiring(next, requirements) {
  const actual = handlerKeys(next);
  for (const key of requirements.handlers || []) if (!actual.has(key)) throw Error('Managed handler changed');
  const deny = next.permissions?.deny || [];
  if (!Array.isArray(deny)) throw Error('Invalid deny rules');
  for (const rule of requirements.deny || []) if (!deny.includes(rule)) throw Error('Managed deny rule changed');
}

export function evalManagedState(j) {
  try {
    const root = j.eidolon_root || j.cwd || process.cwd();
    const manifest = manifestAt(root);
    if (!manifest) return null;
    for (const required of manifest.configurations) {
      const target = confinedPath(root,root,required.path);
      const config = JSON.parse(boundedRead(target,1048576).toString('utf8'));
      if (config.disableAllHooks === true) throw Error('Disabled wiring');
      assertManagedWiring(config,required);
    }
    return null;
  } catch {return {kind:'block',label:'MANAGED POLICY',why:'The required managed manifest or wiring is missing, changed or invalid. Review the installation outside ordinary agent execution. No configuration contents were logged.'};}
}
