// Task and interview records are coordination data, never an authorization mechanism.
import {mkdirSync,readdirSync,writeFileSync,existsSync,readFileSync,lstatSync,linkSync,unlinkSync,openSync,closeSync,fsyncSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {portablePath,projectPath,sha256} from './safe-paths.mjs';
const text=(v,label,max=8192)=>{if(typeof v!=='string'||!v.trim()||v.length>max||v.includes('\0'))throw Error('Invalid '+label);return v;};
const list=(v,label,max=128)=>{if(!Array.isArray(v)||v.length>max)throw Error('Invalid '+label);return v;};
export function validateTask(task) {
  if(!task||task.schema!==1||!Number.isSafeInteger(task.revision)||task.revision<1||task.revision>9999999999)throw Error('Invalid task revision');
  text(task.id,'task id',128);text(task.goal,'goal');text(task.source,'user request source',2048);
  if(!['plan','review','build','evolve'].includes(task.mode))throw Error('Invalid task mode');
  const ids=new Set();
  for(const d of list(task.deliverables,'deliverables')) {
    text(d.id,'deliverable id',128);text(d.outcome,'deliverable outcome');
    if(ids.has(d.id))throw Error('Duplicate deliverable');ids.add(d.id);
    if(!['pending','in_progress','verified','waived'].includes(d.status))throw Error('Invalid deliverable status');
    if(!list(d.checks,'acceptance checks').length)throw Error('Observable checks required');
    for(const check of d.checks)text(check,'acceptance check');
    if(d.status==='verified'&&!list(d.evidence,'evidence').length)throw Error('Verified outcome needs evidence');
    if(d.status==='waived')text(d.waiverSource,'user waiver source');
  }
  if(!ids.size)throw Error('At least one deliverable required');
  for(const k of ['read','write'])for(const p of list(task.scope?.[k],k+' paths'))portablePath(p);
  if(['plan','review'].includes(task.mode)&&task.scope.write.length)throw Error('Review task cannot carry write scope');
  for(const x of list(task.excludedActions,'excluded actions'))text(x,'excluded action',512);
  for(const x of list(task.riskTags,'risk tags'))text(x,'risk tag',128);
  const contextIds=new Set();
  for(const record of list(task.context,'context',64)) {
    if(contextIds.has(record.id))throw Error('Duplicate context id');contextIds.add(record.id);
    text(record.id,'context id',128);text(record.text,'context text');text(record.source,'context provenance',2048);
    if(!['user','source','observation','inference'].includes(record.kind))throw Error('Invalid context provenance');
  }
  const questionIds=new Set();
  for(const q of list(task.questions,'questions',64)) {
    if(questionIds.has(q.id))throw Error('Duplicate question id');questionIds.add(q.id);
    text(q.id,'question id',128);text(q.question,'question');text(q.decision,'affected decision',512);
    if(!['clarification','preference','approval','verification'].includes(q.kind)||!['pending','answered','superseded','cancelled'].includes(q.state))throw Error('Invalid question');
    if(q.state==='answered'){text(q.answer,'answer');text(q.answerSource,'answer provenance');}
  }
  if(task.authority!=='host-permissions-required')throw Error('Task record cannot grant permissions');
  return task;
}
export function nextQuestion(task) {validateTask(task);return task.questions.find(q=>q.state==='pending')||null;}
export function answerQuestion(task,id,answer,source,revision) {
  validateTask(task);if(revision!==task.revision)throw Error('Stale answer revision');
  text(answer,'answer');text(source,'user answer source');
  const out=structuredClone(task),q=out.questions.find(x=>x.id===id);
  if(!q||q.state!=='pending')throw Error('Question is not pending');
  q.state='answered';q.answer=answer;q.answerSource=source;q.answeredRevision=revision;
  // Even an approval answer remains a record; it never produces an executable permission receipt.
  q.grantsPermission=false;out.revision++;return validateTask(out);
}
export function questionPrompt(task,host) {
  const q=nextQuestion(task);if(!q)return null;
  return {id:q.id,question:q.question,kind:q.kind,decision:q.decision,revision:task.revision,
    transport:host==='claude'?'AskUserQuestion when exposed':host==='codex'?'request_user_input when exposed':'conversation',
    instruction:'Ask this question once, wait for the human, reflect the answer. Never invent an answer or treat a preference as approval.',grantsPermission:false};
}
export function taskComplete(task) {validateTask(task);return !nextQuestion(task)&&task.deliverables.every(d=>['verified','waived'].includes(d.status));}
const folder=(root,id)=>projectPath(root,'.eidolon/tasks/'+sha256(text(id,'task id',128)));
export function loadTask(root,id) {
  const dir=folder(root,id);if(!existsSync(dir))return null;
  const names=readdirSync(dir).filter(n=>/^\d{10}\.json$/.test(n)).sort();if(!names.length)return null;
  const file=projectPath(root,'.eidolon/tasks/'+sha256(id)+'/'+names.at(-1));
  if(lstatSync(file).size>262144)throw Error('Task record too large');const bytes=readFileSync(file);if(bytes.length>262144)throw Error('Task record too large');
  const task=validateTask(JSON.parse(bytes.toString('utf8')));if(task.id!==id)throw Error('Task identity mismatch');return task;
}
export function saveTask(root,task,expectedRevision=0) {
  validateTask(task);const prior=loadTask(root,task.id);
  if((prior?.revision||0)!==expectedRevision||task.revision!==expectedRevision+1)throw Error('Task changed; reload before saving');
  const dir=folder(root,task.id);mkdirSync(dir,{recursive:true});
  const file=projectPath(root,'.eidolon/tasks/'+sha256(task.id)+'/'+String(task.revision).padStart(10,'0')+'.json');
  const payload=JSON.stringify(task,null,2)+'\n';if(Buffer.byteLength(payload)>262144)throw Error('Task record too large');
  const stage=file+'.stage-'+randomUUID();
  try {
    writeFileSync(stage,payload,{flag:'wx',mode:0o600});
    const fd=openSync(stage,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}
    linkSync(stage,file); // exclusive destination; never overwrite a concurrent revision
  } finally {if(existsSync(stage))unlinkSync(stage);}
  return {revision:task.revision,sha256:sha256(payload),authority:task.authority};
}
