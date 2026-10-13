import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {install as installOnce, planInstall, applyPlan} from './install.mjs';
// install() applies only a previewed plan (F27): bind the digest the way the Hearth wrapper does.
const install = o => installOnce(o?.dryRun === false && !o.expectedPlan ? {...o, expectedPlan: planInstall(o).digest} : o);
const temporary = t => {
  // Match the installer's canonical path for this fresh, test-owned directory.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'claude-native-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  return root;
};
test('direct Claude instructions survive repeat installation', t => {
  const root = temporary(t);
  install({project: root, dryRun: false});
  const path = join(root, 'CLAUDE.md');
  const original = readFileSync(path, 'utf8');
  assert.doesNotMatch(original, /@(?:\.\/)?AGENTS\.md/i);
  for (const phrase of ['.claude/skills/eidolon/SKILL.md', 'Claude is the engineer.',
    'exact approved plan', 'native permission checks', 'controller and worker',
    'automatic-install holds', 'docs/fixes']) assert.ok(original.includes(phrase), phrase);
  const again = install({project: root, dryRun: false, replace: true});
  assert.equal(again.changed, 0);
  assert.equal(readFileSync(path, 'utf8'), original);
});
test('upgrade preserves human text and deliberate imports, then adds native instructions once', t => {
  const root = temporary(t);
  install({project: root, dryRun: false});
  const human = '# Project rules\r\n@docs/rules.md\r\nKeep the project vocabulary: café.\r\n';
  const path = join(root, 'CLAUDE.md');
  writeFileSync(path, human);
  const result = install({project: root, dryRun: false, replace: true});
  const content = readFileSync(path, 'utf8');
  assert.ok(content.startsWith(human));
  assert.equal(content.split('## Eidolon for Claude Code').length - 1, 1);
  const receipt = JSON.parse(readFileSync(join(result.backups, 'receipt.json'), 'utf8'));
  const changed = receipt.changes.find(change => change.path === path);
  assert.ok(changed?.backup, 'The prior instruction file must be recoverable');
  assert.equal(readFileSync(changed.backup, 'utf8'), human);
  assert.equal(install({project: root, dryRun: false, replace: true}).changed, 0);
});
test('preview shows the native instruction text without creating files', t => {
  const root = temporary(t);
  const plan = planInstall({project: root});
  const instructions = plan.items.find(item => item.path === join(root, 'CLAUDE.md'));
  assert.match(instructions.text, /## Eidolon for Claude Code/);
  assert.equal(applyPlan(plan).dryRun, true);
  assert.deepEqual(readdirSync(root), []);
});
test('a human edit after Claude preview invalidates the plan without overwriting it', t => {
  const root = temporary(t), path = join(root, 'CLAUDE.md');
  writeFileSync(path, 'Before preview\n');
  const plan = planInstall({project: root});
  writeFileSync(path, 'Human revision after preview\n');
  assert.throws(() => applyPlan(plan, {dryRun: false}), /changed/);
  assert.equal(readFileSync(path, 'utf8'), 'Human revision after preview\n');
  assert.equal(existsSync(join(root, '.claude/skills/eidolon')), false);
});
test('I4 dry run returns exact text for merged files and a unified diff for settings', t => {
  const root = temporary(t);
  writeFileSync(join(root, 'CLAUDE.md'), 'My rules.\n');
  const result = install({project: root});
  assert.equal(result.dryRun, true);
  const by = name => result.previews.find(p => p.path === join(root, name));
  const plan = planInstall({project: root});
  for (const name of ['CLAUDE.md', '.gitignore', '.eidolon/policy-manifest.json', '.claude/eidolon-manifest.yaml']) {
    assert.equal(by(name).text, plan.items.find(i => i.path === join(root, name)).text, name);
  }
  assert.match(by('CLAUDE.md').text, /^My rules\.\n[\s\S]*## Eidolon for Claude Code[\s\S]*Claude is the engineer\./);
  const diff = by('.claude/settings.json').diff;
  assert.match(diff, /^--- \/dev\/null$/m); assert.match(diff, /^\+\+\+ b\/\.claude\/settings\.json$/m);
  assert.match(diff, /^@@ -0,0 \+1,\d+ @@$/m); assert.match(diff, /^\+ +"command": "node",$/m);
  assert.equal(by('.claude/settings.json').text, undefined);
  assert.deepEqual(readdirSync(root), ['CLAUDE.md']);
});
test('I4 the settings diff shows removed and kept lines against an existing file', t => {
  const root = temporary(t);
  mkdirSync(join(root, '.claude'));
  writeFileSync(join(root, '.claude/settings.json'), '{\n  "custom": 1\n}\n');
  const diff = install({project: root}).previews.find(p => p.path === join(root, '.claude/settings.json')).diff;
  assert.match(diff, /^--- a\/\.claude\/settings\.json$/m); assert.match(diff, /^ \{$/m);
  assert.match(diff, /^-  "custom": 1$/m); assert.match(diff, /^\+  "custom": 1,$/m);
});
test('I4 the CLI preview prints the text under each path', t => {
  const root = temporary(t);
  const out = spawnSync(process.execPath, [join(import.meta.dirname, 'install.mjs'), '--project', root], {encoding: 'utf8'});
  assert.equal(out.status, 0, out.stderr);
  const claude = out.stdout.indexOf(join(root, 'CLAUDE.md'));
  assert.ok(claude >= 0 && out.stdout.indexOf('## Eidolon for Claude Code', claude) > claude);
  assert.match(out.stdout, /^ +\| \+\+\+ b\/\.claude\/settings\.json$/m);
  assert.deepEqual(readdirSync(root), []);
});
const fixtureSource = t => {
  const src = temporary(t); writeFileSync(join(src, 'SKILL.md'), '---\nname: eidolon\ndescription: fixture\n---\n');
  mkdirSync(join(src, 'hooks'));
  for (const h of ['guard-bash', 'guard-write', 'guard-dispatch', 'post-tool-entry', 'subagent-start', 'subagent-stop']) writeFileSync(join(src, 'hooks', h + '.mjs'), '// stub\n');
  return [{name: 'eidolon', source: src}];
};
const BEGIN = '<!-- eidolon:begin -->', END = '<!-- eidolon:end -->';
test('F4 non-UTF-8 bytes in CLAUDE.md or .gitignore refuse the install, naming the file, and stay untouched', t => {
  for (const name of ['CLAUDE.md', '.gitignore']) {
    const root = temporary(t), sources = fixtureSource(t), bytes = Buffer.from([0x63, 0xE9, 0x0A]);
    writeFileSync(join(root, name), bytes);
    assert.throws(() => planInstall({project: root, sources}), e => e.message.includes(name) && /utf-?8/i.test(e.message));
    assert.deepEqual(readFileSync(join(root, name)), bytes);
  }
});
test('F5 an edited block is replaced in place, leaving exactly one delimited block', t => {
  const root = temporary(t), sources = fixtureSource(t);
  writeFileSync(join(root, 'CLAUDE.md'), 'Human rules.\n'); writeFileSync(join(root, '.gitignore'), 'dist/\n');
  install({project: root, sources, dryRun: false});
  for (const [name, begin, end, edit] of [['CLAUDE.md', BEGIN, END, 'Claude is the engineer.'], ['.gitignore', '# eidolon:begin', '# eidolon:end', '.eidolon/tasks/']]) {
    const path = join(root, name), text = readFileSync(path, 'utf8');
    assert.ok(text.includes(begin) && text.includes(end), name);
    writeFileSync(path, text.replace(edit, 'EDITED ' + edit));
    install({project: root, sources, dryRun: false, replace: true});
    const next = readFileSync(path, 'utf8');
    assert.equal(next, text, name); assert.equal(next.split(begin).length - 1, 1, name); assert.equal(next.split(end).length - 1, 1, name);
  }
  assert.match(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), /^Human rules\./); assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /^dist\//);
});
test('F5 a legacy undelimited block is migrated once into a delimited one', t => {
  const root = temporary(t), sources = fixtureSource(t);
  install({project: root, sources, dryRun: false});
  for (const [name, begin, end] of [['CLAUDE.md', BEGIN, END], ['.gitignore', '# eidolon:begin', '# eidolon:end']]) {
    const path = join(root, name), text = readFileSync(path, 'utf8');
    const inner = text.slice(text.indexOf(begin) + begin.length, text.indexOf(end)).replace(/^\n|\n$/g, '');
    writeFileSync(path, 'Human.\n\n' + inner + '\n');
    install({project: root, sources, dryRun: false, replace: true});
    const next = readFileSync(path, 'utf8');
    assert.equal(next.split(begin).length - 1, 1, name); assert.equal(next.split(inner).length - 1, 1, name); assert.ok(next.startsWith('Human.\n'), name);
  }
});
