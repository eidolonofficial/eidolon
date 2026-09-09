import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {planInstall,applyPlan} from './install.mjs';
test('generated CI streaming logs are outside the package snapshot, while real source remains sealed',t=>{
 const base=mkdtempSync(join(tmpdir(),'eidolon-source-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
 const source=join(base,'source'),home=join(base,'home');mkdirSync(source);mkdirSync(home);mkdirSync(join(source,'.ci-evidence'));
 const skill='---\nname: sample\ndescription: fixture\n---\n';writeFileSync(join(source,'SKILL.md'),skill);writeFileSync(join(source,'.ci-evidence','stream.txt'),'started');
 const options={home,host:'claude',sources:[{name:'sample',source}]};const plan=planInstall(options);
 writeFileSync(join(source,'.ci-evidence','stream.txt'),'continued test output');
 assert.doesNotThrow(()=>applyPlan(plan,{dryRun:false}));assert.equal(readFileSync(join(home,'.claude/skills/sample/SKILL.md'),'utf8'),skill);
 const next=planInstall(options);writeFileSync(join(source,'SKILL.md'),skill+'changed source\n');
 assert.throws(()=>applyPlan(next,{dryRun:false,replace:true}),/source changed/);
});
