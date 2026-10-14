import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,realpathSync,rmSync} from 'node:fs';
import {spawnSync,execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {confinedPath} from './confined-path.mjs';
import {normalizeEvent,proposedFile,fileTarget} from './operation.mjs';
test('an approved project root alias maps to canonical bytes without accepting interior symlinks',t=>{
 const base=realpathSync.native(mkdtempSync(join(tmpdir(),'eidolon-alias-')));t.after(()=>rmSync(base,{recursive:true,force:true}));
 const actual=join(base,'actual'),alias=join(base,'approved-alias');mkdirSync(actual);
 symlinkSync(actual,alias,process.platform==='win32'?'junction':'dir');
 writeFileSync(join(actual,'DECISIONS.md'),'prior\n');
 const event=normalizeEvent({cwd:alias,tool_name:'Write',tool_input:{file_path:join(alias,'DECISIONS.md'),content:'prior\nnext\n'}},alias);
 const proposal=proposedFile(event);assert.equal(fileTarget(event),proposal.path);
 assert.equal(proposal.path,join(realpathSync.native(actual),'DECISIONS.md'));assert.equal(proposal.before.toString(),'prior\n');
 const outside=join(base,'outside');mkdirSync(outside);writeFileSync(join(outside,'private.txt'),'not in project');
 symlinkSync(outside,join(actual,'outside-link'),process.platform==='win32'?'junction':'dir');
 assert.throws(()=>confinedPath(alias,alias,join(alias,'outside-link','private.txt')),/Symlink/);
 assert.throws(()=>confinedPath(alias,outside,'private.txt'),/Working directory escapes/);
});

// A policy root given as an alias (an 8.3 short name, a junction or a symlinked temp directory, as on the CI runners) must
// reach the same verdicts as its canonical spelling, for absolute and relative targets.
const HOOKS=dirname(fileURLToPath(import.meta.url)),WIN=process.platform==='win32';
const WORKER={agent_id:'w1',agent_type:'builder'};
function fixture(t){
 const base=realpathSync.native(mkdtempSync(join(tmpdir(),'eidolon-alias-spell-')));t.after(()=>rmSync(base,{recursive:true,force:true}));
 const longParent=join(base,'eidolon-alias-long-parent-name'),root=join(longParent,'project'),put=(path,text)=>{const f=join(root,path);mkdirSync(dirname(f),{recursive:true});writeFileSync(f,text);};
 mkdirSync(root,{recursive:true});execFileSync('git',['init','-q'],{cwd:root});
 put('hooks/lib.mjs','// fixture\n');put('src/a.ts','export {};\n');put('.claude/agent-scopes.json',JSON.stringify({builder:{read:['**'],write:['src/**']}}));
 const spellings=[['canonical',root]],link=join(base,'junction-or-symlink');
 symlinkSync(root,link,WIN?'junction':'dir');spellings.push([WIN?'junction':'symlink',link]);
 if(WIN){ // the short name of the long-named parent, as `dir /x` prints it; absent when the volume makes none
  const listing=spawnSync('cmd',['/c','dir','/x',base],{encoding:'utf8'}).stdout||'',m=/\s(\S+~\d\S*)\s+eidolon-alias-long-parent-name\s*$/m.exec(listing);
  if(m)spellings.push(['8.3 short name',join(base,m[1],'project')]);
 }
 return {root,spellings,outside:join(longParent,'outside-note.txt')};
}
const hook=(spelling,script,event)=>spawnSync(process.execPath,[join(HOOKS,script),'--project',spelling],{cwd:spelling,encoding:'utf8',timeout:20000,input:JSON.stringify({cwd:spelling,session_id:'s1',...event})});
const q=p=>'"'+p.replace(/\\/g,'/')+'"';
const verdict=r=>r.status===2?'block':r.status===0&&r.stdout===''?'silent':r.status===0&&/"permissionDecision":"ask"/.test(r.stdout)?'ask':'?'+r.status+r.stdout+r.stderr;
test('a --project alias of the fixture root gives the verdicts of its canonical spelling',t=>{
 const {spellings,outside}=fixture(t);
 for(const [kind,s] of spellings){
  const w=(file_path,extra={})=>verdict(hook(s,'guard-write.mjs',{tool_name:'Write',tool_input:{file_path,content:'x'},...extra}));
  const b=(command,extra={})=>verdict(hook(s,'guard-bash.mjs',{tool_name:'Bash',tool_input:{command},...extra}));
  assert.equal(w(join(s,'hooks','lib.mjs')),'ask',kind+': controller Write of hooks/lib.mjs by absolute path');
  assert.equal(w('hooks/lib.mjs'),'ask',kind+': controller Write of hooks/lib.mjs by relative path');
  assert.equal(w(join(s,'src','a.ts')),'silent',kind+': controller Write inside the root');
  assert.equal(w(outside),'silent',kind+': controller Write outside the root');
  assert.equal(w(join(s,'docs','y.md'),WORKER),'block',kind+': worker Write outside its lane, absolute');
  assert.equal(w('docs/y.md',WORKER),'block',kind+': worker Write outside its lane, relative');
  assert.equal(w(join(s,'src','new.ts'),WORKER),'silent',kind+': worker Write inside its lane');
  assert.equal(w(outside,WORKER),'block',kind+': worker Write outside the root');
  assert.equal(b('cp x hooks/lib.mjs'),'ask',kind+': controller shell write of a hook');
  assert.equal(b('echo x > '+JSON.stringify(join(s,'hooks','lib.mjs')).replace(/\\/g,'/')),'ask',kind+': controller redirect to a hook by absolute path');
  assert.equal(b('echo x > docs/y.md',WORKER),'block',kind+': worker shell write outside its lane');
  assert.equal(b('echo x > '+JSON.stringify(outside).replace(/\\/g,'/'),WORKER),'block',kind+': worker shell write outside the root');
  assert.equal(b('echo x > '+JSON.stringify(outside).replace(/\\/g,'/')),'silent',kind+': controller shell write outside the root');
 }
 assert.ok(spellings.length>=2,'at least the canonical and one link spelling ran');
});
