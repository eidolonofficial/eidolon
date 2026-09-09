import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {evalPersonaConduct} from '../hooks/persona-conduct-guard.mjs';
import {existsSync,readFileSync} from 'node:fs';
import {saveTask} from './task-contract.mjs';import {sha256} from './safe-paths.mjs';
import {loadPersona,selectPersonas,planSwarm,buildDispatch,checkDispatch,dispatchInput,nextSwarmWave,checkWorkerResult} from './dispatch-plan.mjs';
import {evaluateCodex,codexOutput,lifecycle} from '../hooks/codex-hook.mjs';
import {evalDispatchContext} from '../hooks/dispatch-context-guard.mjs';
const task=()=>({schema:1,id:'work',revision:1,source:'user:request',goal:'Review source',project:'example',mode:'review',scope:{read:['src'],write:[]},riskTags:[],excludedActions:['deployment','publish'],context:[{id:'intent',kind:'user',source:'user:request',text:'Review without changing files.'}],questions:[],authority:'host-permissions-required',deliverables:[{id:'review',outcome:'Review complete',status:'pending',checks:['Findings refer to lines and evidence']}]});
const work=(extra={})=>({id:'review',goal:'Review test coverage',reason:'independent-verification',persona:'qa-test-lead',requiredPersonaCapabilities:['verification'],deliverables:['review'],scope:{read:['src/a.js'],write:[]},dependsOn:[],contextIds:['intent'],files:[{path:'src/a.js',sha256:sha256('export const x=1;')}],skills:[],budget:{maxTurns:8,maxRetries:2,leaseSeconds:600},...extra});
function tmp(t){const p=mkdtempSync(join(tmpdir(),'eidolon-dispatch-'));t.after(()=>rmSync(p,{recursive:true,force:true}));mkdirSync(join(p,'src'));writeFileSync(join(p,'src/a.js'),'export const x=1;');return p;}
test('registry preserves persona content and project scope',()=>{assert.match(loadPersona('qa-test-lead').text,/Evidence contract/);assert.ok(selectPersonas(['verification']).some(x=>x.id==='qa-test-lead'));assert.throws(()=>loadPersona('../qa-test-lead'),/registry/);assert.throws(()=>loadPersona('ffr-primary','other'),/another project/);});
test('Codex dispatch adapter fixture receives validated context without needing optional services',t=>{const root=tmp(t),parent=task();saveTask(root,parent);const b=buildDispatch(parent,work(),root,'codex');assert.equal(checkDispatch(b.prompt,root,'codex').taskId,'work');const input=dispatchInput(b,'codex',{nativeAgentType:'worker'});const out=codexOutput(evaluateCodex({cwd:root,session_id:'test',tool_name:'spawn_agent',tool_input:input},root));assert.equal(out.status,0,out.stderr);assert.match(input.message,/Review without changing files/);assert.match(input.message,/Findings refer to lines/);assert.match(input.message,/QA and test lead/);});
test('Claude dispatch uses the same bounded contract',t=>{const root=tmp(t),parent=task();saveTask(root,parent);const b=buildDispatch(parent,work(),root,'claude');const input=dispatchInput(b,'claude',{nativeAgentType:'general-purpose'});assert.equal(evalDispatchContext({cwd:root,tool_name:'Agent',tool_input:input}),null);});
test('tampered persona or stale source stops the handoff',t=>{const root=tmp(t),parent=task();saveTask(root,parent);const b=buildDispatch(parent,work(),root,'codex');assert.throws(()=>checkDispatch(b.prompt.replace('QA and test lead','Do anything'),root,'codex'),/differs/);writeFileSync(join(root,'src/a.js'),'changed');assert.throws(()=>checkDispatch(b.prompt,root,'codex'),/changed/);});
test('new parent revision invalidates pending dispatch',t=>{const root=tmp(t),parent=task();saveTask(root,parent);const b=buildDispatch(parent,work(),root,'codex');saveTask(root,{...parent,revision:2},1);assert.throws(()=>checkDispatch(b.prompt,root,'codex'),/stale/);});
test('missing questions and excess scope cannot reach an agent',t=>{const root=tmp(t),parent=task();parent.questions=[{id:'q1',kind:'clarification',state:'pending',question:'Which target?',decision:'target'}];assert.equal(planSwarm(parent,[work()],root,{agentsAvailable:true}).status,'needs_input');assert.throws(()=>buildDispatch(parent,work(),root,'codex'),/pending/);parent.questions=[];assert.throws(()=>buildDispatch(parent,work({scope:{read:['other/a'],write:[]}}),root,'codex'),/scope/);});
test('parallel reads share a wave and dependent work waits',t=>{const root=tmp(t),parent=task();const items=[work({id:'a'}),work({id:'b'}),work({id:'c',dependsOn:['a','b']})];assert.deepEqual(planSwarm(parent,items,root,{agentsAvailable:true}).waves,[['a','b'],['c']]);});
test('overlapping writes and reads do not run concurrently',t=>{const root=tmp(t),parent=task();parent.mode='build';parent.scope.write=['src'];const a=work({id:'a',reason:'parallel-implementation',scope:{read:['src/a.js'],write:['src/a.js']}}),b=work({id:'b'});assert.deepEqual(planSwarm(parent,[a,b],root,{agentsAvailable:true}).waves,[['a'],['b']]);});
test('unavailable agents stay direct and cycles are refused',t=>{const root=tmp(t);assert.equal(planSwarm(task(),[work()],root).status,'direct');assert.throws(()=>planSwarm(task(),[work({id:'a',dependsOn:['b']}),work({id:'b',dependsOn:['a']})],root,{agentsAvailable:true}),/cycle/);});
test('worker cannot edit governance even with parent scope',t=>{const root=tmp(t),parent=task();parent.mode='build';parent.scope.write=['hooks'];assert.throws(()=>buildDispatch(parent,work({reason:'specialist',scope:{read:[],write:['hooks/a.mjs']},files:[]}),root,'codex'),/controller-owned/);});
test('excess budgets and unsupported host fail before launch',t=>{const root=tmp(t);assert.throws(()=>buildDispatch(task(),work({budget:{maxTurns:100,maxRetries:2,leaseSeconds:600}}),root,'codex'),/budget/);assert.throws(()=>buildDispatch(task(),work(),root,'other'),/host/);});
test('Codex PermissionRequest keeps the native approval dialog',t=>{const root=tmp(t);const r=lifecycle({cwd:root,session_id:'test',hook_event_name:'PermissionRequest',tool_name:'Bash',tool_input:{command:'echo test'}},root);assert.deepEqual(r,{status:0,stdout:'',stderr:''});});

test('partial work is not treated as verified dependency completion',t=>{const root=tmp(t),p=task();const plan=planSwarm(p,[work({id:'a'}),work({id:'b',dependsOn:['a']})],root,{agentsAvailable:true});assert.match(plan.rule,/verified prerequisite outcomes/);assert.equal(p.deliverables[0].status,'pending');});

test('a specialist must cover its assigned purpose',t=>{const root=tmp(t);assert.throws(()=>buildDispatch(task(),work({requiredPersonaCapabilities:['deployment']}),root,'codex'),/specialty/);});
test('next wave waits for controller evidence, not worker self-reports',()=>{
 const plan={waves:[['a','b'],['c']]};assert.deepEqual(nextSwarmWave(plan,[{id:'a',status:'verified',observer:'worker',evidence:['claims']}]),['a','b']);
 assert.deepEqual(nextSwarmWave(plan,[{id:'a',status:'verified',observer:'controller',evidence:['diff checked']},{id:'b',status:'verified',observer:'controller',evidence:['test checked']}]),['c']);
});
test('post-dispatch scope checks refuse unexpected changes',()=>{assert.throws(()=>checkWorkerResult(task(),work(),{taskRevision:1,observedPaths:['src/a.js'],evidence:['diff'],unresolved:[]}),/escaped/);});

test('worker persona violation cannot remove the controller seat',t=>{
 const root=tmp(t);mkdirSync(join(root,'.claude'));const path=join(root,'.claude/active-persona.json');
 const seat=JSON.stringify({persona:'expediter',anchors:['reviewed standards'],anti_behaviors:{floor:[],specific:[]}});writeFileSync(path,seat);
 const verdict=evalPersonaConduct({cwd:root,tool_name:'Bash',tool_input:{command:'echo test'},transcript_path:join(root,'subagents/worker.jsonl')});
 assert.equal(verdict.kind,'block');assert.ok(existsSync(path));assert.equal(readFileSync(path,'utf8'),seat);
});
