// Persona selection feeds the actual dispatch planner. It grants no tool permissions.
import {selectPersonas,loadPersona,planSwarm,buildDispatch,dispatchInput} from './dispatch-plan.mjs';
import {validateTask,nextQuestion} from './task-contract.mjs';
const needsOf=work=>{
  const values=work.requiredPersonaCapabilities;
  if(!Array.isArray(values)||!values.length||values.length>32||values.some(v=>typeof v!=='string'||!/^[a-z0-9][a-z0-9-]*$/.test(v)))throw Error('Declare bounded persona capabilities');
  return [...new Set(values)].sort();
};
export function selectPersona(work,project){
  const needs=needsOf(work),rejected=[],eligible=[];
  const candidates=work.persona?[{id:work.persona}]:selectPersonas(needs,project);
  for(const candidate of candidates){
    try{
      const role=loadPersona(candidate.id,project);
      const missing=needs.filter(n=>!role.provides.includes(n));
      if(missing.length){rejected.push({id:candidate.id,reason:'missing-specialty',missing});continue;}
      eligible.push(role);
    }catch{rejected.push({id:candidate.id,reason:'unavailable-unscoped-or-unverified-persona'});}
  }
  eligible.sort((a,b)=>a.provides.length-b.provides.length||a.id.localeCompare(b.id));
  if(!eligible.length)return {status:'gap',selected:null,required:needs,rejected,uncovered:needs,authority:'selection-is-not-permission'};
  const role=eligible[0];
  return {status:'ready',selected:{id:role.id,path:role.path,sha256:role.sha256,provides:role.provides},required:needs,uncovered:[],rejected,
    reason:work.persona?'explicit-reviewed-persona':'smallest-reviewed-role-covering-the-specialty',authority:'selection-is-not-permission'};
}
export function planDeployment(task,workItems,root,{host='codex',agentsAvailable=false,maxConcurrent=3,nativeAgentType,controllerDeliverables=[]}={}){
  validateTask(task);
  if(!['claude','codex'].includes(host)||!Array.isArray(workItems)||workItems.length>16)throw Error('Invalid deployment request');
  const question=nextQuestion(task);if(question)return {status:'needs_input',question,waves:[],selections:[],briefs:[],authority:'host-permissions-required'};
  if(!Array.isArray(controllerDeliverables)||controllerDeliverables.some(id=>!task.deliverables.some(d=>d.id===id)))throw Error('Unknown controller deliverable');
  if(!workItems.length){const needs=task.deliverables.filter(d=>d.independentReview===true&&!['verified','waived'].includes(d.status)).map(d=>d.id);if(needs.length)return {status:'needs_input',waves:[],selections:[],briefs:[],uncovered:needs,reason:'Required independent verification has no assigned reviewer.',authority:'host-permissions-required'};return {status:'direct',waves:[],selections:[],briefs:[],controllerDeliverables:task.deliverables.map(d=>d.id),reason:'No useful delegation requested',authority:'host-permissions-required'};}
  const selections=workItems.map(work=>({workId:work.id,...selectPersona(work,task.project)}));
  const gaps=selections.filter(s=>s.status!=='ready');
  const uncovered=task.deliverables.filter(d=>!['verified','waived'].includes(d.status)&&!controllerDeliverables.includes(d.id)&&!workItems.some(w=>w.deliverables?.includes(d.id))).map(d=>d.id);
  for(const d of task.deliverables)if(d.independentReview===true&&!workItems.some(w=>w.reason==='independent-verification'&&w.deliverables?.includes(d.id)))uncovered.push('independent-review:'+d.id);
  if(gaps.length||uncovered.length)return {status:'gap',waves:[],selections,briefs:[],uncovered:[...new Set(uncovered)],personaGaps:gaps.map(g=>g.workId),authority:'host-permissions-required'};
  const selectedWork=workItems.map((work,i)=>({...work,persona:selections[i].selected.id}));
  const plan=planSwarm(task,selectedWork,root,{agentsAvailable,maxConcurrent});
  if(!agentsAvailable&&selectedWork.some(w=>w.reason==='independent-verification'))return {...plan,status:'needs_input',reason:'Independent verification requires an available independent worker or human reviewer.',selections,briefs:[],authority:'host-permissions-required'};
  const firstWave=new Set(plan.waves[0]||[]);
  // Later waves must refresh changed source hashes before their own dispatch is built.
  const briefs=selectedWork.filter(w=>firstWave.has(w.id)).map(work=>{
    const brief=buildDispatch(task,work,root,host);
    return {workId:work.id,sha256:brief.sha256,prompt:brief.prompt,...(nativeAgentType?{toolInput:dispatchInput(brief,host,{nativeAgentType})}:{}),authority:'host-permissions-required'};
  });
  return {...plan,host,taskId:task.id,taskRevision:task.revision,selections,workItems:selectedWork,briefs,controllerDeliverables,
    nextStep:briefs.length?'Review the prepared wave and use only an observed native agent tool. Record actual thread IDs and verify outcomes before advancing.':'Continue approved work directly without claiming that an agent was launched.',authority:'host-permissions-required'};
}
