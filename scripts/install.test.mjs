import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { install, planInstall, applyPlan, inventory } from './install.mjs';
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(source, 'scripts/install.mjs');
function tmp(t) { const p = mkdtempSync(join(tmpdir(), 'eidolon-install-')); t.after(() => rmSync(p, { recursive: true, force: true })); return p; }
function put(root, path, content) { const p = join(root, path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); }
test('dry-run makes no filesystem changes', t => {
  const root = tmp(t); assert.equal(install({ project: root }).dryRun, true); assert.deepEqual(readdirSync(root), []);
});
for (const host of ['codex', 'claude', 'both']) test('installs selected host ' + host, t => {
  const root = tmp(t); const result = install({ project: root, host, dryRun: false }); assert.ok(result.changed > 0);
  assert.equal(existsSync(join(root, '.agents/skills/eidolon/SKILL.md')), host !== 'claude');
  assert.equal(existsSync(join(root, '.claude/skills/eidolon/SKILL.md')), host !== 'codex');
  if (host !== 'claude') {
    assert.match(readFileSync(join(root, '.agents/skills/eidolon/SKILL.md'), 'utf8'), /Eidolon for Codex/);
    assert.equal(readFileSync(join(root, '.agents/skills/eidolon/references/claude-workflow.md'), 'utf8'), readFileSync(join(source, 'SKILL.md'), 'utf8'));
    const conf = JSON.parse(readFileSync(join(root, '.codex/hooks.json'))); assert.equal(conf.hooks.PreToolUse.length, 1);
    assert.equal(conf.hooks.SessionStart[0].hooks[0].async, undefined);
  }
  if (host !== 'codex') assert.match(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), /@AGENTS.md/);
});
test('user skill install does not wire global hooks', t => {
  const root = tmp(t); install({ home: root, host: 'codex', dryRun: false });
  assert.ok(existsSync(join(root, '.agents/skills/eidolon/SKILL.md'))); assert.ok(!existsSync(join(root, '.codex/hooks.json')));
});
test('existing skills require explicit replace and retain backups', t => {
  const root = tmp(t); put(root, '.agents/skills/eidolon/SKILL.md', 'local work');
  assert.throws(() => install({ project: root, dryRun: false }), /replace/);
  assert.equal(readFileSync(join(root, '.agents/skills/eidolon/SKILL.md'), 'utf8'), 'local work');
  const result = install({ project: root, dryRun: false, replace: true });
  const receipt = JSON.parse(readFileSync(join(result.backups, 'receipt.json')));
  const backup = receipt.changes.find(x => x.path.endsWith('eidolon')).backup;
  assert.equal(readFileSync(join(backup, 'SKILL.md'), 'utf8'), 'local work');
});
test('unrelated instructions and hook configuration survive', t => {
  const root = tmp(t); const custom = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo keep' }] };
  put(root, 'AGENTS.md', 'My existing rules.\n'); put(root, 'CLAUDE.md', 'My Claude rules.\n');
  put(root, '.codex/hooks.json', JSON.stringify({ custom: 1, hooks: { PreToolUse: [custom] } }));
  install({ project: root, host: 'both', dryRun: false });
  const conf = JSON.parse(readFileSync(join(root, '.codex/hooks.json'))); assert.deepEqual(conf.hooks.PreToolUse[0], custom); assert.equal(conf.custom, 1);
  assert.match(readFileSync(join(root, 'AGENTS.md'), 'utf8'), /^My existing rules/);
  assert.match(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), /^My Claude rules/);
});
test('reinstall is idempotent and does not duplicate hooks', t => {
  const root = tmp(t); install({ project: root, dryRun: false });
  const result = install({ project: root, dryRun: false, replace: true }); assert.equal(result.changed, 0);
  assert.equal(JSON.parse(readFileSync(join(root, '.codex/hooks.json'))).hooks.PreToolUse.length, 1);
});
test('binary assets are copied byte-for-byte', t => {
  const root = tmp(t), src = tmp(t); const bytes = Buffer.from([0,255,254,128,1]);
  put(src, 'SKILL.md', '---\nname: sample\ndescription: test\n---\n'); put(src, 'codex/SKILL.md', '---\nname: sample\ndescription: Codex test\n---\n'); put(src, 'assets/image.bin', bytes);
  install({ home: root, sources: [{ name: 'sample', source: src }], dryRun: false });
  assert.deepEqual(readFileSync(join(root, '.agents/skills/sample/assets/image.bin')), bytes);
});
test('destination race is caught before existing content is overwritten', t => {
  const root = tmp(t); put(root, 'AGENTS.md', 'old rules'); const plan = planInstall({ project: root });
  assert.throws(() => applyPlan(plan, { dryRun: false, beforeCommit: () => put(root, 'AGENTS.md', 'concurrent edit') }), /changed during/);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), 'concurrent edit');
  assert.ok(!existsSync(join(root, '.agents/skills/eidolon')));
});
test('installed Codex hook executes from a nested working directory', t => {
  const root = tmp(t); install({ project: root, dryRun: false }); mkdirSync(join(root, 'nested'));
  const adapter = join(root, '.agents/skills/eidolon/hooks/codex-hook.mjs');
  const out = spawnSync(process.execPath, [adapter, '--project', root], { cwd: join(root, 'nested'), encoding: 'utf8',
    input: JSON.stringify({ cwd: join(root, 'nested'), session_id: 'test', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo hello' } }) });
  assert.equal(out.status, 0, out.stderr);
});
test('CLI rejects invalid arguments without creating output', t => {
  const root = tmp(t); const out = spawnSync(process.execPath, [script, '--project', root, '--host', 'invalid', '--yes'], { encoding: 'utf8' });
  assert.equal(out.status, 1); assert.deepEqual(readdirSync(root), []);
});

test('generated command runs through the platform shell', t => {
  const root = tmp(t); install({ project: root, dryRun: false });
  const handler = JSON.parse(readFileSync(join(root, '.codex/hooks.json'))).hooks.PreToolUse[0].hooks[0];
  const input = JSON.stringify({ cwd: root, session_id: 'shell-test', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo hello' } });
  const result = process.platform === 'win32'
    ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', handler.commandWindows], { input, encoding: 'utf8' })
    : spawnSync('/bin/sh', ['-c', handler.command], { input, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
test('bootstrap blocks if a required policy module is unavailable', t => {
  const root = tmp(t); install({ project: root, dryRun: false });
  rmSync(join(root, '.agents/skills/eidolon/hooks/suite-evaluators.mjs'));
  const result = spawnSync(process.execPath, [join(root, '.agents/skills/eidolon/hooks/codex-entry.mjs'), '--project', root], {
    input: JSON.stringify({ cwd: root, session_id: 'test', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo hello' } }), encoding: 'utf8' });
  assert.equal(result.status, 2); assert.equal(result.stdout, '');
});
