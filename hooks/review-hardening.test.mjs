// Regression intent from the independent 2026-09-09 review. Shell payloads are data only.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync,symlinkSync, realpathSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {install,planInstall,applyPlan} from '../scripts/install.mjs';
import {evalAppendOnlyRecord} from './append-only-record-guard.mjs';
import {actorPath} from './operation.mjs';import {commitDrift,evalDrift} from './drift-guard.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function fixture(t){const root=realpathSync.native(mkdtempSync(join(tmpdir(),'eidolon-review-fix-')));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
function put(root,path,text){const file=join(root,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,text);return file;}
function hook(root,script,event,runtime=join(ROOT,'hooks')){return spawnSync(process.execPath,[join(runtime,script),'--project',root],{cwd:root,encoding:'utf8',input:JSON.stringify({cwd:root,...event}),timeout:10000});}
const write=(path,content)=>({tool_name:'Write',tool_input:{file_path:path,content}});
const shell=command=>({tool_name:'Bash',tool_input:{command}});
test('R01 full proposed settings detect one-word and escaped-key disabling',t=>{
 const root=fixture(t);put(root,'.claude/settings.json','{"disableAllHooks":false,"theme":"light"}');
 assert.equal(hook(root,'guard-write.mjs',{tool_name:'Edit',tool_input:{file_path:'.claude/settings.json',old_string:'false',new_string:'true'}}).status,2);
 assert.equal(hook(root,'guard-write.mjs',write('.claude/settings.json','{"disableAll\\u0048ooks":true}')).status,2);
 assert.equal(hook(root,'guard-write.mjs',{tool_name:'Edit',tool_input:{file_path:'.claude/settings.json',old_string:'light',new_string:'dark'}}).status,0);
});
test('R02 fresh installed authority includes a manifest and protects handler semantics',t=>{
 const root=fixture(t);install({project:root,dryRun:false,expectedPlan:planInstall({project:root}).digest});const runtime=join(root,'.claude/skills/eidolon/hooks');
 assert.ok(existsSync(join(root,'.eidolon/policy-manifest.json')));assert.ok(existsSync(join(root,'.claude/eidolon-manifest.yaml')));
 assert.equal(hook(root,'guard-write.mjs',write('.claude/settings.json','{}'),runtime).status,2);
 const good=JSON.parse(readFileSync(join(root,'.claude/settings.json'))),changed=structuredClone(good);changed.hooks.PreToolUse[0].matcher='NoSuchTool';
 assert.equal(hook(root,'guard-write.mjs',write('.claude/settings.json',JSON.stringify(changed)),runtime).status,2);
 assert.equal(hook(root,'guard-write.mjs',write('.claude/settings.json',JSON.stringify({...good,theme:'light'})),runtime).status,0);
 rmSync(join(root,'.eidolon/policy-manifest.json'));assert.equal(hook(root,'guard-bash.mjs',shell('echo hello'),runtime).status,2);
});
test('R04 immutable history rejects equal and larger substitution but allows exact append',t=>{
 const root=fixture(t);put(root,'DECISIONS.md','approved=false\n');
 for(const content of ['approved=true!\n','a much longer replacement that erases history'])assert.equal(evalAppendOnlyRecord({cwd:root,...write('DECISIONS.md',content)})?.kind,'block');
 assert.equal(evalAppendOnlyRecord({cwd:root,...write('DECISIONS.md','approved=false\nCorrection: still awaiting review.\n')}),null);
});
test('R05 canonical operands defeat directory traversal',t=>{
 const root=fixture(t);mkdirSync(join(root,'engine'));put(root,'hooks/guard-bash.mjs','// fixture\n');
 assert.equal(hook(root,'guard-bash.mjs',shell('rm engine/../hooks/guard-bash.mjs')).status,2);
 assert.ok(existsSync(join(root,'hooks/guard-bash.mjs')),'commands were evaluated only');
});
test('R06 installed runtime cannot rewrite itself through a structured file tool',t=>{
 const root=fixture(t);install({project:root,dryRun:false,expectedPlan:planInstall({project:root}).digest});const runtime=join(root,'.claude/skills/eidolon/hooks');
 assert.equal(hook(root,'guard-write.mjs',write('.claude/skills/eidolon/hooks/guard-bash.mjs','// proposed replacement only'),runtime).status,2);
 assert.equal(hook(root,'guard-write.mjs',write('.eidolon/policy-manifest.json','{}'),runtime).status,2);
});
test('R08 explicit workers cannot remove inherited controller state or another worker seat',t=>{
 const root=fixture(t),seat=JSON.stringify({persona:'expediter',anchors:['test'],anti_behaviors:{floor:[],specific:[]}});put(root,'.claude/active-persona.json',seat);
 const result=hook(root,'guard-write.mjs',{agent_id:'worker-a',session_id:'same',...write('app.js','export {};')});assert.equal(result.status,2);assert.equal(readFileSync(join(root,'.claude/active-persona.json'),'utf8'),seat);
});
test('R09 malformed policy state is a sanitized block, never an unstructured exit-one failure',t=>{
 const root=fixture(t);put(root,'.claude/active-persona.json',JSON.stringify({persona:'worker',anchors:['test'],anti_behaviors:{floor:{privateExample:'invalid'}}}));
 const result=hook(root,'guard-write.mjs',write('app.js','export {};'));assert.equal(result.status,2);assert.doesNotMatch(result.stderr,/privateExample|TypeError/);
});
for(const command of ['git commit -m "works now"',' git commit -m "works now"','git -C "project with spaces" commit -m "works now"','git -C . commit --no-verify -m "update code"'])test('R10 equivalent Git spellings reach policy: '+command,t=>{const root=fixture(t);assert.equal(hook(root,'guard-bash.mjs',shell(command)).status,2);});
test('R10 harmless flag text in a commit message remains text',t=>{const root=fixture(t);assert.equal(hook(root,'guard-bash.mjs',shell('git commit -m "Document --no-verify and --force flags"')).status,0);});
test('R11 destination drift since preview preserves the human update',t=>{
 const root=fixture(t);put(root,'CLAUDE.md','original\n');const plan=planInstall({project:root});put(root,'CLAUDE.md','human update\n');
 assert.throws(()=>applyPlan(plan,{dryRun:false}),/changed/);assert.equal(readFileSync(join(root,'CLAUDE.md'),'utf8'),'human update\n');
});
test('R11 source drift and plan mutation invalidate approval',t=>{
 const root=fixture(t),src=fixture(t);put(src,'SKILL.md','---\nname: sample\ndescription: example\n---\n');
 const plan=planInstall({home:root,sources:[{name:'sample',source:src}]});put(src,'README.md','new source');assert.throws(()=>applyPlan(plan,{dryRun:false}),/source changed/);
 const fresh=planInstall({home:root,sources:[{name:'sample',source:src}]});fresh.items[0].files.set('extra.txt',{bytes:Buffer.from('altered'),mode:0o644});assert.throws(()=>applyPlan(fresh,{dryRun:false}),/plan changed/);
});
test('successful actor outcomes are idempotent; failures and other actors do not advance them',t=>{
 const root=fixture(t),event={cwd:root,session_id:'one',agent_id:'worker-a',tool_use_id:'write-a',hook_event_name:'PostToolUse',...write('scripts/a.mjs','ok'),tool_response:{success:true}};
 put(root,'scripts/a.mjs','ok');assert.equal(commitDrift(event).count,1);assert.equal(commitDrift(event).changed,false);
 assert.equal(commitDrift({...event,tool_use_id:'fail',tool_response:{success:false}}).changed,false);
 assert.equal(existsSync(actorPath({...event,agent_id:'worker-b'},'drift.json')),false);
 assert.equal(JSON.parse(readFileSync(actorPath(event,'drift.json'))).count,1);
});

test('a worker cannot clear another role through the shared legacy seat path',t=>{
 const r=fixture(t);const original=JSON.stringify({persona:'reviewer',anchors:['verification'],anti_behaviors:{floor:[],specific:[]}});put(r,'.claude/active-persona.json',original);
 const out=hook(r,'guard-write.mjs',{...write('.claude/active-persona.json','{}'),agent_id:'worker'});
 assert.equal(out.status,2);assert.equal(readFileSync(join(r,'.claude/active-persona.json'),'utf8'),original);
});
test('a malformed owned-handler manifest cannot silently remove its required coverage',t=>{
 const r=fixture(t);install({project:r,dryRun:false,expectedPlan:planInstall({project:r}).digest});
 const file=join(r,'.eidolon/policy-manifest.json'),manifest=JSON.parse(readFileSync(file));manifest.configurations[0].handlers=[];writeFileSync(file,JSON.stringify(manifest));
 const out=hook(r,'guard-write.mjs',write('src/a.js','export {};'),join(r,'.claude/skills/eidolon/hooks'));
 assert.equal(out.status,2);
});
