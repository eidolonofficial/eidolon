// Evaluate the complete proposed JSON against the same manifest the installer creates.
import {relative} from 'node:path';
import {runHook,emitVerdict} from './lib.mjs';
import {proposedFile,fileTarget} from './operation.mjs';
import {manifestAt,handlerKeys,assertManagedWiring} from './policy-manifest.mjs';
const SETTINGS=/(?:^|[\\/])\.(?:claude[\\/]settings(?:\.local)?|codex[\\/]hooks)\.json$/i;
function object(bytes){const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,''));if(!value||Array.isArray(value)||typeof value!=='object')throw Error('Settings must be an object');return value;}
export function evalSettingsIntegrity(j){
  if(!['Write','Edit'].includes(j.tool_name))return null;
  const block=why=>({kind:'block',label:'SETTINGS INTEGRITY GUARD',why});
  try{
    if(!SETTINGS.test(fileTarget(j)))return null;
    const proposal=proposedFile(j),next=object(proposal.after);
    if(next.disableAllHooks!==undefined&&next.disableAllHooks!==false)return block('The resulting settings disable or invalidate hook enforcement. Review policy maintenance outside ordinary agent execution.');
    const manifest=manifestAt(proposal.root),name=relative(proposal.root,proposal.path).replace(/\\/g,'/');
    const required=manifest?.configurations.find(c=>c.path.toLowerCase()===name.toLowerCase());
    if(required)assertManagedWiring(next,required);
    else if(proposal.present){
      const before=object(proposal.before);
      const previous=handlerKeys(before),actual=handlerKeys(next);
      for(const handler of previous)if(!actual.has(handler))throw Error('Existing handler changed');
      if(before.permissions?.deny){if(!Array.isArray(before.permissions.deny)||!Array.isArray(next.permissions?.deny))throw Error('Invalid deny rules');for(const rule of before.permissions.deny)if(!next.permissions.deny.includes(rule))throw Error('Deny rule removed');}
    }else handlerKeys(next);
    return null;
  }catch{return block('The complete proposed settings or managed manifest could not be validated. Exact edits must preserve event, matcher, executable, arguments and deny rules. No configuration values were logged.');}
}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/settings-integrity-guard.mjs'))runHook(j=>emitVerdict(evalSettingsIntegrity(j)));
