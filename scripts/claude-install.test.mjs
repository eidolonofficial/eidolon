import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {install, planInstall, applyPlan} from './install.mjs';
const temporary = t => {
  const root = mkdtempSync(join(tmpdir(), 'claude-native-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  return root;
};
for (const host of ['claude', 'both']) test(`${host}: direct Claude instructions survive repeat installation`, t => {
  const root = temporary(t);
  install({project: root, host, dryRun: false});
  const path = join(root, 'CLAUDE.md');
  const original = readFileSync(path, 'utf8');
  assert.doesNotMatch(original, /@(?:\.\/)?AGENTS\.md/i);
  for (const phrase of ['.claude/skills/eidolon/SKILL.md', 'Claude is the engineer.',
    'exact approved plan', 'native permission checks', 'controller and worker',
    'plan digest', 'automatic-install holds', 'docs/fixes']) assert.ok(original.includes(phrase), phrase);
  const again = install({project: root, host, dryRun: false, replace: true});
  assert.equal(again.changed, 0);
  assert.equal(readFileSync(path, 'utf8'), original);
});
test('a Codex-only install neither creates nor changes Claude instructions', t => {
  const root = temporary(t);
  install({project: root, host: 'codex', dryRun: false});
  assert.equal(existsSync(join(root, 'CLAUDE.md')), false);
  const human = '# My Claude rules\r\nKeep this exactly.\r\n';
  writeFileSync(join(root, 'CLAUDE.md'), human);
  install({project: root, host: 'codex', dryRun: false, replace: true});
  assert.equal(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), human);
});
test('upgrade preserves human text and deliberate imports, then adds native instructions once', t => {
  const root = temporary(t);
  install({project: root, host: 'claude', dryRun: false});
  const human = '# Project rules\r\n@AGENTS.md\r\nKeep the project vocabulary: café.\r\n';
  const path = join(root, 'CLAUDE.md');
  writeFileSync(path, human);
  const result = install({project: root, host: 'claude', dryRun: false, replace: true});
  const content = readFileSync(path, 'utf8');
  assert.ok(content.startsWith(human));
  assert.equal(content.split('## Eidolon for Claude Code').length - 1, 1);
  const receipt = JSON.parse(readFileSync(join(result.backups, 'receipt.json'), 'utf8'));
  const changed = receipt.changes.find(change => change.path === path);
  assert.ok(changed?.backup, 'The prior instruction file must be recoverable');
  assert.equal(readFileSync(changed.backup, 'utf8'), human);
  assert.equal(install({project: root, host: 'claude', dryRun: false, replace: true}).changed, 0);
});
test('preview shows the native instruction text without creating files', t => {
  const root = temporary(t);
  const plan = planInstall({project: root, host: 'claude'});
  const instructions = plan.items.find(item => item.path === join(root, 'CLAUDE.md'));
  assert.match(instructions.text, /## Eidolon for Claude Code/);
  assert.equal(applyPlan(plan).dryRun, true);
  assert.deepEqual(readdirSync(root), []);
});
test('a human edit after Claude preview invalidates the plan without overwriting it', t => {
  const root = temporary(t), path = join(root, 'CLAUDE.md');
  writeFileSync(path, 'Before preview\n');
  const plan = planInstall({project: root, host: 'claude'});
  writeFileSync(path, 'Human revision after preview\n');
  assert.throws(() => applyPlan(plan, {dryRun: false}), /changed/);
  assert.equal(readFileSync(path, 'utf8'), 'Human revision after preview\n');
  assert.equal(existsSync(join(root, '.claude/skills/eidolon')), false);
});
