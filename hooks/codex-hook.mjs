// Codex adapter: shared policy, documented host output, and pure preflight.
import {existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bashEvaluators,writeEvaluators} from './suite-evaluators.mjs';
import {evalAppendOnlyRecord} from './append-only-record-guard.mjs';
import {evalDispatchAttestation} from './dispatch-attestation-guard.mjs';
import {evalDispatchContext} from './dispatch-context-guard.mjs';
import {evalGate,recordRead,repoRoot} from './orient-gate-core.mjs';
import {parsePatch,confinedPath} from './codex-patch.mjs';
import {normalizeEvent} from './operation.mjs';
import {evalDrift,commitDrift,successfulOutcome} from './drift-guard.mjs';
import {evalManagedState} from './policy-manifest.mjs';
import {approvalOutput,permissionDecision} from '../scripts/approval-contract.mjs';
const deny=why=>({kind:'block',label:'CODEX ADAPTER',why});
const immutable=/^(?:\.git(?:\/|$)|\.codex\/(?:hooks\.json|config\.toml|rules(?:\/|$))|\.(?:agents|claude)\/skills\/eidolon(?:\/|$)|hooks\/(?:codex-[^/]+|suite-evaluators\.mjs|lib\.mjs)$)/i;
const slash=p=>p.replace(/\\/g,'/');
const quote=v=>"'"+v.replace(/'/g,"'\\''")+"'";
function orientationRequired(root){return ['.claude/eidolon-manifest.yaml','.claude/settings.json'].some(p=>{try{return readFileSync(join(root,p),'utf8').includes('orient-gate.mjs');}catch{return false;}});}
function checkEvent(j,project){
  if(!j||Array.isArray(j)||typeof j!=='object'||typeof j.cwd!=='string'||!j.cwd)throw Error('Invalid event');
  const cwd=realpathSync(j.cwd),root=realpathSync(project||repoRoot(cwd));
  if(cwd!==root)confinedPath(root,root,cwd);
  for(const p of ['.claude/.drift-count','.claude/active-persona.json','.claude/eidolon-manifest.yaml'])confinedPath(root,root,p);
  return {cwd,root};
}
export function evaluateCodex(j,project){
  const {cwd,root}=checkEvent(j,project);
  if(typeof j.tool_name!=='string'||!j.tool_input||Array.isArray(j.tool_input)||typeof j.tool_input!=='object')throw Error('Invalid tool event');
  const base=normalizeEvent(j,root),verdicts=[],health=evalManagedState(base);
  if(health)return [health];
  const run=(evaluators,event)=>{for(const fn of evaluators){const v=fn(event);if(v)verdicts.push(v);if(v?.kind==='block')return false;}return true;};
  const gate=event=>!orientationRequired(root)||run([evalGate],{...event,cwd:root});
  const protect=path=>{if(immutable.test(slash(relative(root,path)))){verdicts.push(deny('This changes configuration or the installed guard runtime. Use reviewed operator maintenance outside the agent.'));return false;}return true;};
  if(base.tool_name==='Bash'){
    if(typeof base.tool_input.command!=='string')throw Error('Shell command required');
    run(bashEvaluators,base);
  }else if(base.tool_name==='apply_patch'){
    if(!run([evalDrift],base))return verdicts;
    for(const change of parsePatch(base.tool_input.command,cwd,root)){
      const target=change.destination||change.path;
      if(!protect(change.path)||!protect(target))break;
      const event={...base,tool_name:'Write',tool_input:{file_path:target,content:change.after}};
      if(!gate(event))break;
      if(change.kind==='delete'||change.kind==='move'){
        const command=change.kind==='delete'?`rm -- ${quote(change.path)}`:`mv -- ${quote(change.path)} ${quote(target)}`;
        if(!run(bashEvaluators,{...base,tool_name:'Bash',tool_input:{command}}))break;
        if(change.kind==='move'&&!run([evalAppendOnlyRecord],{...base,tool_name:'Write',tool_input:{file_path:change.path,content:''}}))break;
      }
      if(!run(writeEvaluators.filter(fn=>fn!==evalDrift),event))break;
    }
  }else if(/^(spawn_agent|send_input|Task|Agent)$/i.test(base.tool_name)){
    const ti=base.tool_input,event={...base,tool_name:'Task',tool_input:{...ti,prompt:ti.message??ti.prompt??ti.task??'',subagent_type:ti.agent_type??ti.subagent_type??''}};
    if(gate(event))run([ev=>evalDispatchContext(ev,'codex',root),evalDispatchAttestation],event);
  }else if(/^(Write|Edit)$/i.test(base.tool_name)){
    const path=confinedPath(root,cwd,base.tool_input.file_path||base.tool_input.path);
    const event={...base,tool_name:/^write$/i.test(base.tool_name)?'Write':'Edit',tool_input:{...base.tool_input,file_path:path}};
    if(protect(path)&&gate(event))run(writeEvaluators,event);
  }else if(/advisor/i.test(base.tool_name))verdicts.push(deny('Advisor access requires controller review; unverified actor claims confer no authority.'));
  return verdicts;
}
export function codexOutput(verdicts){
  const decision=permissionDecision(verdicts),message=verdicts.map(v=>v.label+': '+v.why).join('\n');
  if(decision)return approvalOutput('codex','PreToolUse',decision,message);
  return {status:0,stderr:'',stdout:message?JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',additionalContext:message}}):''};
}
function snapshotPath(root,sid){if(typeof sid!=='string'||!sid)throw Error('Missing session id');return confinedPath(root,root,'.eidolon/sessions/'+createHash('sha256').update(sid).digest('hex')+'.json');}
function git(root,args){try{return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:3000}).trim();}catch{return '';}}
export function lifecycle(j,project){
  const {root}=checkEvent(j,project);
  if(j.hook_event_name==='PreToolUse')return codexOutput(evaluateCodex(j,root));
  if(j.hook_event_name==='PermissionRequest'){
    const verdicts=evaluateCodex(j,root);
    return approvalOutput('codex','PermissionRequest',permissionDecision(verdicts),verdicts.map(v=>v.label+': '+v.why).join('\n'));
  }
  if(j.hook_event_name==='PostToolUse'){
    try{commitDrift({...j,eidolon_root:root},'codex');}
    catch{return {status:0,stderr:'',stdout:JSON.stringify({systemMessage:'Eidolon outcome state needs reconciliation; no completed bookkeeping is claimed.'})};}
    if(successfulOutcome(j,'codex')&&orientationRequired(root)){
      confinedPath(root,root,'.claude/.orient-gate.'+String(j.session_id||'').replace(/[^A-Za-z0-9_-]/g,'')+'.json');
      mkdirSync(join(root,'.claude'),{recursive:true});recordRead(root,{...j,cwd:root});
    }
    return codexOutput([]);
  }
  if(j.hook_event_name==='PreCompact'){
    const path=snapshotPath(root,j.session_id);mkdirSync(dirname(path),{recursive:true});
    writeFileSync(path,JSON.stringify({savedAt:new Date().toISOString(),head:git(root,['rev-parse','HEAD']),branch:git(root,['branch','--show-current']),changedFiles:git(root,['status','--porcelain']).split('\n').filter(Boolean).length}));
    return codexOutput([]);
  }
  if(j.hook_event_name==='SessionStart'){
    const path=snapshotPath(root,j.session_id);let snapshot='';
    if(existsSync(path))snapshot='\nSaved facts are a hypothesis to recheck: '+readFileSync(path,'utf8').slice(0,3000);
    const message='Eidolon Codex adapter loaded. Read AGENTS.md and the Eidolon skill. Ask-tier PreToolUse decisions remain blocked; PermissionRequest never suppresses the native human prompt for an ask. Persona state is actor-scoped with read-only legacy fallback. No task record grants permission.'+snapshot;
    return {status:0,stderr:'',stdout:JSON.stringify({hookSpecificOutput:{hookEventName:'SessionStart',additionalContext:message}})};
  }
  return codexOutput([]);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let raw='',oversized=false;
  process.stdin.on('data',chunk=>{if(Buffer.byteLength(raw)+chunk.length>5*1024*1024)oversized=true;else raw+=chunk;});
  process.stdin.on('end',()=>{
    try{
      if(oversized)throw Error('Input limit');
      const at=process.argv.indexOf('--project'),out=lifecycle(JSON.parse(raw.replace(/^\uFEFF/,'')),at<0?undefined:process.argv[at+1]);
      process.stdout.write(out.stdout);process.stderr.write(out.stderr);process.exitCode=out.status;
    }catch{process.stderr.write('EIDOLON CODEX ADAPTER: invalid event, state or runtime; tool call blocked. No payload was logged.\n');process.exitCode=2;}
  });
}
