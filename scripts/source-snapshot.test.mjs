import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync, realpathSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {planInstall,applyPlan} from './install.mjs';
test('generated CI streaming logs are outside the package snapshot, while real source remains sealed',t=>{
 const base=realpathSync.native(mkdtempSync(join(tmpdir(),'eidolon-source-')));t.after(()=>rmSync(base,{recursive:true,force:true}));
 const source=join(base,'source'),home=join(base,'home');mkdirSync(source);mkdirSync(home);mkdirSync(join(source,'.ci-evidence'));
 const skill='---\nname: sample\ndescription: fixture\n---\n';writeFileSync(join(source,'SKILL.md'),skill);writeFileSync(join(source,'.ci-evidence','stream.txt'),'started');
 const options={home,sources:[{name:'sample',source}]};const plan=planInstall(options);
 writeFileSync(join(source,'.ci-evidence','stream.txt'),'continued test output');
 assert.doesNotThrow(()=>applyPlan(plan,{dryRun:false}));assert.equal(readFileSync(join(home,'.claude/skills/sample/SKILL.md'),'utf8'),skill);
 const next=planInstall(options);writeFileSync(join(source,'SKILL.md'),skill+'changed source\n');
 assert.throws(()=>applyPlan(next,{dryRun:false,replace:true}),/source changed/);
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function lockFixture(t) {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'eidolon-lock-'))); t.after(() => rmSync(base, {recursive: true, force: true}));
  const source = join(base, 'src'), home = join(base, 'home'), lock = join(base, 'vendor-lock.json');
  mkdirSync(join(source, 'assets'), {recursive: true}); mkdirSync(home);
  writeFileSync(join(source, 'SKILL.md'), '---\nname: sample\ndescription: fixture\n---\n');
  writeFileSync(join(source, 'assets', 'a.bin'), Buffer.from([1, 2, 3, 4]));
  const files = {};
  for (const rel of ['SKILL.md', 'assets/a.bin']) files['sample/' + rel] = sha(readFileSync(join(source, rel)));
  writeFileSync(lock, JSON.stringify({sources: {sample: 'abc1234'}, files}));
  return {source, home, lock, options: {home, lock, sources: [{name: 'sample', source}]}};
}
test('I1 a lock that matches the source passes', t => {
  const {options} = lockFixture(t);
  assert.doesNotThrow(() => planInstall(options));
});
test('I1 one flipped byte in a bundled file refuses and names the path', t => {
  const {source, options} = lockFixture(t);
  writeFileSync(join(source, 'assets', 'a.bin'), Buffer.from([1, 2, 3, 5]));
  assert.throws(() => planInstall(options), /sample\/assets\/a\.bin/);
});
test('I1 an extra file refuses and names the path', t => {
  const {source, options} = lockFixture(t);
  writeFileSync(join(source, 'extra.txt'), 'surprise');
  assert.throws(() => planInstall(options), /sample\/extra\.txt/);
});
test('I1 a missing file and an uncovered source both refuse', t => {
  const {source, lock, options} = lockFixture(t);
  rmSync(join(source, 'assets', 'a.bin'));
  assert.throws(() => planInstall(options), /sample\/assets\/a\.bin/);
  writeFileSync(lock, JSON.stringify({sources: {}, files: {}}));
  assert.throws(() => planInstall(options), /sample/);
});
test('I1 without a lock the plan behaves as before, and the CLI reports an unreadable lock', t => {
  const {source, options} = lockFixture(t);
  writeFileSync(join(source, 'extra.txt'), 'surprise');
  assert.doesNotThrow(() => planInstall({...options, lock: undefined}));
  const out = spawnSync(process.execPath, [join(import.meta.dirname, 'install.mjs'), '--home', options.home, '--lock', join(options.home, 'missing.json')], {encoding: 'utf8'});
  assert.equal(out.status, 1); assert.match(out.stderr, /lock file/i);
});
