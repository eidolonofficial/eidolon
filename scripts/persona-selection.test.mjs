import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {selectPersona,planDeployment} from './persona-selection.mjs';
import {saveTask} from './task-contract.mjs';
import {checkDispatch,nextSwarmWave} from './dispatch-plan.mjs';
import {handleRequest} from './orchestrate.mjs';
import {sha256} from './safe-paths.mjs';
const task=()=>({schema:1,id:'pipeline',revision:1,project:'example',source:'user:request',goal:'Review implementation and privacy without changing code',mode:'review',scope:{read:['src'],write:[]},riskTags:['privacy'],excludedActions:['publish','deployment'],context:[{id:'intent',kind:'user',source:'user:request',text:'Review only, and do not publish.'}],questions:[],authority:'host-permissions-required',deliverables:[{id:'code',outcome:'Review behavior',status:'pending',checks:['Compare source with test evidence']},{id:'privacy',outcome:'Review data handling',status:'pending',checks:['Identify data crossings with source evidence']}]});
const work=(id,cap,extra={})=>({id,goal:'Inspect '+id,reason:'independent-verification',requiredPersonaCapabilities:[cap],deliverables:[id],scope:{read:['src/a.js'],write:[]},dependsOn:[],contextIds:['intent'],files:[{path:'src/a.js',sha256:sha256('export const x=1;')}],skills:[],budget:{maxTurns:8,maxRetries:2,leaseSeconds:600},...extra});
function fixture(t){const root=mkdtempSync(join(tmpdir(),'eidolon-persona-pipeline-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'src'));writeFileSync(join(root,'src/a.js'),'export const x=1;');return root;}
test('automatic role selection follows distinct required specialties',()=>{
 assert.equal(selectPersona(work('code','verification'),'example').selected.id,'qa-test-lead');
 assert.equal(selectPersona(work('privacy','privacy'),'example').selected.id,'trust-safety-architect');
});
test('invalid explicit persona is not replaced by a guessed role',()=>{
 assert.equal(selectPersona(work('code','verification',{persona:'frontend-engineer'}),'example').status,'gap');
 for(const id of ['../qa-test-lead','expediter','ffr-primary'])assert.equal(selectPersona(work('code','verification',{persona:id}),'example').status,'gap');
});
for(const host of ['claude','codex'])test(host+' pipeline selects roles and builds the actual bounded native arguments',t=>{
 const root=fixture(t),parent=task();saveTask(root,parent);
 const result=planDeployment(parent,[work('code','verification'),work('privacy','privacy')],root,{host,agentsAvailable:true,nativeAgentType:host==='codex'?'worker':'general-purpose'});
 assert.equal(result.status,'swarm');assert.deepEqual(result.waves,[['code','privacy']]);assert.equal(result.briefs.length,2);
 for(const brief of result.briefs){const input=brief.toolInput;const packet=checkDispatch(input.message??input.prompt,root,host);assert.equal(packet.excludedActions.includes('publish'),true);assert.equal(packet.context[0].source,'user:request');assert.equal(packet.authority,'host-permissions-required');}
 assert.deepEqual(nextSwarmWave(result,[]),['code','privacy']);
});
test('partial role coverage cannot clear another requested deliverable',t=>{
 const root=fixture(t);const result=planDeployment(task(),[work('code','verification')],root,{agentsAvailable:true});assert.equal(result.status,'gap');assert.deepEqual(result.uncovered,['privacy']);
});
test('simple work remains direct and missing independent tools require a real decision',t=>{
 const root=fixture(t);assert.equal(planDeployment(task(),[],root).status,'direct');
 assert.equal(planDeployment(task(),[work('code','verification'),work('privacy','privacy')],root).status,'needs_input');
});
test('pending interview prevents prepared dispatch and does not invent an answer',t=>{
 const root=fixture(t),parent=task();parent.questions=[{id:'target',kind:'clarification',state:'pending',question:'Which target?',decision:'target'}];
 assert.equal(planDeployment(parent,[work('code','verification')],root).status,'needs_input');assert.equal(parent.questions[0].state,'pending');
});
test('CLI handoff preserves the persona pipeline rather than only printing a score',t=>{
 const root=fixture(t),parent=task();saveTask(root,parent);
 const result=handleRequest({action:'deploy-plan',taskId:parent.id,workItems:[work('code','verification'),work('privacy','privacy')],capabilities:{agentsAvailable:true,nativeAgentType:'worker'}},root,'codex');
 assert.equal(result.briefs[0].toolInput.agent_type,'worker');assert.ok(result.briefs[0].toolInput.message.startsWith('EIDOLON_DISPATCH_V1\n'));
});
test('changing source after planning invalidates the context packet',t=>{
 const root=fixture(t),parent=task();saveTask(root,parent);const result=planDeployment(parent,[work('code','verification'),work('privacy','privacy')],root,{agentsAvailable:true});
 writeFileSync(join(root,'src/a.js'),'new source');assert.throws(()=>checkDispatch(result.briefs[0].prompt,root,'codex'),/changed/);
});

test('independent verification stays unresolved without assigned reviewer work',t=>{
 const root=fixture(t),parent=task();parent.deliverables[0].independentReview=true;
 const result=planDeployment(parent,[],root);
 assert.equal(result.status,'needs_input');assert.deepEqual(result.uncovered,['code']);assert.equal(result.briefs.length,0);
});
test('roles cannot be inferred from a context label without capability coverage',()=>{
 const result=selectPersona(work('code','unknown-specialty'),'example');
 assert.equal(result.status,'gap');assert.deepEqual(result.uncovered,['unknown-specialty']);
});
