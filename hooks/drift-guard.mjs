// Pure preflight; only a successful PostToolUse advances actor-local counters.
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,rmSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {dirname,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {runHook,emitVerdict} from './lib.mjs';
import {actorIdentity,actorPath,policyRoot,boundedRead,sha256,escapesRoot} from './operation.mjs';
import {confinedPath} from './confined-path.mjs';
import {manifestAt} from './policy-manifest.mjs';
const WALL=10,WARN=6;
const SCAFFOLD=/(^|[\\/])(hooks[\\/]|\.claude[\\/]|scripts[\\/]|\.github[\\/]|Dockerfile|Makefile|\.gitignore$|[^\\/]*\.(ya?ml|toml|ini|cfg)$|[^\\/]*\.config\.[jt]s$)/i;
export function mutationPaths(j) {
  const root=policyRoot(j),cwd=j.cwd||root,ti=j.tool_input||{};
  if(['Write','Edit'].includes(j.tool_name))return escapesRoot(j)?[]:[confinedPath(root,cwd,ti.file_path??ti.path)];
  return [];
}
function state(j) {
  const file=actorPath(j,'drift.json');
  if(!existsSync(file))return {version:1,count:0,processed:[]};
  const s=JSON.parse(boundedRead(file,1048576).toString('utf8'));
  if(s?.version!==1||!Number.isSafeInteger(s.count)||s.count<0||!Array.isArray(s.processed)||s.processed.length>4096||s.processed.some(x=>typeof x!=='string'))throw Error('Invalid drift state');
  return s;
}
function projected(s,paths,root) {
  let count=s.count;
  for(const path of paths)count=SCAFFOLD.test(relative(root,path))?count+1:0;
  return count;
}
export function evalDrift(j) {
  const paths=mutationPaths(j);if(!paths.length)return null;
  const s=state(j),count=projected(s,paths,policyRoot(j));
  const infrastructure=manifestAt(policyRoot(j))?.workType==='infrastructure';
  if(count>=WALL&&!infrastructure)return {kind:'block',label:'DRIFT GUARD',why:'This operation would reach '+count+' consecutive scaffold edits. No drift state was changed. Use an operator-reviewed infrastructure-work installation profile when infrastructure is the approved deliverable.'};
  if(count>=WARN)return {kind:'advise',label:'DRIFT GUARD',why:'Projected scaffold count: '+count+'. This preflight does not record completed work.'};
  return null;
}
export function successfulOutcome(j,host='claude') {
  if(j.hook_event_name!=='PostToolUse')return false;
  const r=j.tool_response;
  if(r&&typeof r==='object') {
    if(r.isError||r.is_error||r.error||r.success===false)return false;
    for(const key of ['exit_code','exitCode']) if(key in r&&(!Number.isInteger(r[key])||r[key]!==0))return false;
    if(r.success===true||r.exit_code===0||r.exitCode===0)return true;
  }
  // Claude's PostToolUse itself denotes success; failed tools use PostToolUseFailure.
  return host==='claude'&&r!=null;
}
export function commitDrift(j,host='claude') {
  if(!successfulOutcome(j,host))return {changed:false,reason:'No successful host outcome'};
  if(typeof j.tool_use_id!=='string'||!j.tool_use_id||typeof j.session_id!=='string'||!j.session_id)return {changed:false,reason:'Missing host operation/session identity'};
  const paths=mutationPaths(j);if(!paths.length)return {changed:false};
  const file=actorPath(j,'drift.json'),lock=file+'.lock';mkdirSync(dirname(file),{recursive:true});
  // A live or abandoned lock requires reconciliation; never steal another writer's lock.
  mkdirSync(lock);
  const stage=file+'.stage-'+randomUUID();
  try {
    const s=state(j),id=sha256(j.tool_use_id);
    if(s.processed.includes(id))return {changed:false,reason:'Duplicate outcome'};
    if(s.processed.length>=4096)throw Error('Session outcome limit reached');
    const next={version:1,count:projected(s,paths,policyRoot(j)),processed:[...s.processed,id]};
    writeFileSync(stage,JSON.stringify(next)+'\n',{flag:'wx',mode:0o600});
    const fd=openSync(stage,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}
    renameSync(stage,file);return {changed:true,count:next.count};
  } finally {if(existsSync(stage))rmSync(stage);rmSync(lock,{recursive:true});}
}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/drift-guard.mjs'))runHook(j=>emitVerdict(evalDrift(j)));
