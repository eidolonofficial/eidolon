import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readdirSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {actorPath,actorIdentity} from './operation.mjs';
import {successfulOutcome,commitDrift} from './drift-guard.mjs';
import {evalEvolveEngine} from './evolve-engine-guard.mjs';
import {planInstall,applyPlan} from '../scripts/install.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const fixture=t=>{const root=mkdtempSync(join(tmpdir(),'eidolon-engine-contract-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;};
test('worker called controller cannot address controller state',t=>{
 const cwd=fixture(t),j={cwd,session_id:'session'};
 assert.notEqual(actorPath(j,'drift.json'),actorPath({...j,agent_id:'controller'},'drift.json'));
 for(const bad of ['',42,{},'bad\nidentity'])assert.throws(()=>actorIdentity({...j,agent_id:bad}));
});
test('a negative, malformed, or conflicting exit code never commits success',()=>{
 for(const value of [-1,'0',null,1])assert.equal(successfulOutcome({hook_event_name:'PostToolUse',tool_response:{success:true,exit_code:value}}),false);
 assert.equal(successfulOutcome({hook_event_name:'PostToolUse',tool_response:{success:true,exit_code:0}}),true);
});
test('a completed patch move counts the destination once',t=>{
 const cwd=fixture(t);mkdirSync(join(cwd,'scripts'));writeFileSync(join(cwd,'scripts/b.mjs'),'ok');
 const j={cwd,session_id:'one',tool_use_id:'one',tool_name:'apply_patch',hook_event_name:'PostToolUse',tool_response:{success:true},tool_input:{command:'*** Begin Patch\n*** Update File: scripts/a.mjs\n*** Move to: scripts/b.mjs\n@@\n-old\n+ok\n*** End Patch'}};
 assert.equal(commitDrift(j,'codex').count,1);
});
test('all CLI confirmation aliases reach both shell guards',()=>{
 for(const tool_name of ['Bash','PowerShell'])for(const value of ['true','True','yes','y','1'])for(const sep of [' ','=']){
  const prefix=tool_name==='PowerShell'?'& python':'python';
  assert.equal(evalEvolveEngine({tool_name,tool_input:{command:prefix+' "engine/asi-evolve/scripts/evolve-brief" normalize --confirmed'+sep+value}})?.kind,'ask');
 }
 assert.equal(evalEvolveEngine({tool_name:'Bash',tool_input:{command:'echo hello'}}),null);
});
test('staged install bytes cannot change after the sealed preview',t=>{
 const home=fixture(t),source=fixture(t);writeFileSync(join(source,'SKILL.md'),'---\nname: sample\ndescription: sample\n---\n');
 const plan=planInstall({home,host:'claude',sources:[{name:'sample',source}]});
 assert.throws(()=>applyPlan(plan,{dryRun:false,beforeCommit:()=>{
  const parent=join(home,'.claude/skills'),stage=readdirSync(parent).find(n=>n.includes('.eidolon-stage-'));
  writeFileSync(join(parent,stage,'SKILL.md'),'changed after approval');
 }}),/Staged installation changed/);
 assert.equal(existsSync(join(home,'.claude/skills/sample')),false);
});
test('shared write guards protect engine approvals and run evidence',t=>{
 const cwd=fixture(t),entry=new URL('./guard-write.mjs',import.meta.url);
 for(const file_path of ['.eidolon/engine-approvals/receipt.json','.evolve_runs/run/run_spec.yaml','.evolve_runs/run/steps/a/results.json']){
  const result=spawnSync(process.execPath,[fileURLToPath(entry),'--project',cwd],{cwd,encoding:'utf8',input:JSON.stringify({cwd,tool_name:'Write',tool_input:{file_path,content:'{}'}})});
  assert.equal(result.status,2,result.stderr);
 }
});
