// JSON CLI for routing, task persistence, interview state and native dispatch arguments. Executes no agents.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inventorySkills} from './skill-inventory.mjs';
import {routeSkills} from './skill-router.mjs';
import {loadTask,saveTask,questionPrompt,answerQuestion} from './task-contract.mjs';
import {planDeployment} from './persona-selection.mjs';
import {planSwarm,buildDispatch,dispatchInput} from './dispatch-plan.mjs';
export function handleRequest(request,root,host) {
  if(!request||!['claude','codex'].includes(host))throw Error('Valid request and host required');
  if(request.action==='inventory')return inventorySkills(root,host,request.options);
  if(request.action==='route'){const candidates=request.candidates??inventorySkills(root,host).candidates;return routeSkills({...request.input,host},candidates);}
  if(request.action==='save')return saveTask(root,request.task,request.expectedRevision??0);
  const task=loadTask(root,request.taskId);if(!task)throw Error('Task not found');
  if(request.action==='question')return questionPrompt(task,host);
  if(request.action==='answer'){const next=answerQuestion(task,request.questionId,request.answer,request.source,request.revision);return saveTask(root,next,task.revision);}
  if(request.action==='plan')return planSwarm(task,request.workItems,root,request.capabilities);
  if(request.action==='deploy-plan')return planDeployment(task,request.workItems,root,{...request.capabilities,host});
  if(request.action==='brief') {const brief=buildDispatch(task,request.work,root,host);return {sha256:brief.sha256,toolInput:dispatchInput(brief,host,request.transport),authority:'host-permissions-required'};}
  throw Error('Unknown operation');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2);let root,host;
    for(let i=0;i<args.length;i++)if(args[i]==='--project')root=args[++i];else if(args[i]==='--host')host=args[++i];else throw Error('Unknown option');
    if(!root||!host)throw Error('Use --project PATH --host claude|codex');
    let raw='';for await(const chunk of process.stdin){raw+=chunk;if(Buffer.byteLength(raw)>262144)throw Error('Input too large');}
    console.log(JSON.stringify(handleRequest(JSON.parse(raw),root,host),null,2));
  }catch {console.error('Eidolon orchestration input invalid or stale. Check the request contract; no agent was dispatched.');process.exitCode=2;}
}
