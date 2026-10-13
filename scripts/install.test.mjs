import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, userInfo } from 'node:os';
import { spawnSync } from 'node:child_process';
import { install, planInstall, applyPlan } from './install.mjs';
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(source, 'scripts/install.mjs');
function tmp(t) { const p = realpathSync(mkdtempSync(join(tmpdir(), 'eidolon-install-'))); t.after(() => rmSync(p, { recursive: true, force: true })); return p; }
function put(root, path, content) { const p = join(root, path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); }
const settings = root => JSON.parse(readFileSync(join(root, '.claude/settings.json')));
test('dry-run makes no filesystem changes', t => {
  const root = tmp(t); assert.equal(install({ project: root }).dryRun, true); assert.deepEqual(readdirSync(root), []);
});
test('a project install writes the Claude skill, hooks and instructions only', t => {
  const root = tmp(t); const result = install({ project: root, dryRun: false }); assert.ok(result.changed > 0);
  assert.ok(existsSync(join(root, '.claude/skills/eidolon/SKILL.md')));
  assert.ok(!existsSync(join(root, '.agents')) && !existsSync(join(root, '.codex')) && !existsSync(join(root, 'AGENTS.md')));
  const claude = readFileSync(join(root, 'CLAUDE.md'), 'utf8'); assert.match(claude, /## Eidolon for Claude Code/);
  const matchers = settings(root).hooks.PreToolUse.map(g => g.matcher);
  assert.deepEqual(matchers, ['Bash|PowerShell', 'Write|Edit', 'Agent|Task']);
});
test('user skill install does not wire global hooks', t => {
  const root = tmp(t); install({ home: root, dryRun: false });
  assert.ok(existsSync(join(root, '.claude/skills/eidolon/SKILL.md'))); assert.ok(!existsSync(join(root, '.claude/settings.json')));
});
test('existing skills require explicit replace and retain backups', t => {
  const root = tmp(t); put(root, '.claude/skills/eidolon/SKILL.md', 'local work');
  assert.throws(() => install({ project: root, dryRun: false }), /replace/);
  assert.equal(readFileSync(join(root, '.claude/skills/eidolon/SKILL.md'), 'utf8'), 'local work');
  const result = install({ project: root, dryRun: false, replace: true });
  const receipt = JSON.parse(readFileSync(join(result.backups, 'receipt.json')));
  const backup = receipt.changes.find(x => x.path.endsWith('eidolon')).backup;
  assert.equal(readFileSync(join(backup, 'SKILL.md'), 'utf8'), 'local work');
});
test('unrelated instructions and hook configuration survive', t => {
  const root = tmp(t); const custom = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo keep' }] };
  put(root, 'CLAUDE.md', 'My Claude rules.\n');
  put(root, '.claude/settings.json', JSON.stringify({ custom: 1, hooks: { PreToolUse: [custom] } }));
  install({ project: root, dryRun: false });
  const conf = settings(root); assert.deepEqual(conf.hooks.PreToolUse[0], custom); assert.equal(conf.custom, 1);
  assert.match(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), /^My Claude rules/);
});
test('reinstall is idempotent and does not duplicate hooks', t => {
  const root = tmp(t); install({ project: root, dryRun: false });
  const count = settings(root).hooks.PreToolUse.length;
  const result = install({ project: root, dryRun: false, replace: true }); assert.equal(result.changed, 0);
  assert.equal(settings(root).hooks.PreToolUse.length, count);
});
test('binary assets are copied byte-for-byte', t => {
  const root = tmp(t), src = tmp(t); const bytes = Buffer.from([0,255,254,128,1]);
  put(src, 'SKILL.md', '---\nname: sample\ndescription: test\n---\n'); put(src, 'assets/image.bin', bytes);
  install({ home: root, sources: [{ name: 'sample', source: src }], dryRun: false });
  assert.deepEqual(readFileSync(join(root, '.claude/skills/sample/assets/image.bin')), bytes);
});
test('destination race is caught before existing content is overwritten', t => {
  const root = tmp(t); put(root, 'CLAUDE.md', 'old rules'); const plan = planInstall({ project: root });
  assert.throws(() => applyPlan(plan, { dryRun: false, beforeCommit: () => put(root, 'CLAUDE.md', 'concurrent edit') }), /changed during/);
  assert.equal(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), 'concurrent edit');
  assert.ok(!existsSync(join(root, '.claude/skills/eidolon')));
});
test('installed Claude hook executes from a nested working directory', t => {
  const root = tmp(t); install({ project: root, dryRun: false }); mkdirSync(join(root, 'nested'));
  const guard = join(root, '.claude/skills/eidolon/hooks/guard-bash.mjs');
  const out = spawnSync(process.execPath, [guard, '--project', root], { cwd: join(root, 'nested'), encoding: 'utf8',
    input: JSON.stringify({ cwd: join(root, 'nested'), session_id: 'test', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo hello' } }) });
  assert.equal(out.status, 0, out.stderr);
});
test('CLI rejects unknown arguments, including the removed --host, without creating output', t => {
  const root = tmp(t);
  for (const extra of [['--host', 'codex'], ['--bogus', 'x']]) {
    const out = spawnSync(process.execPath, [script, '--project', root, ...extra, '--yes'], { encoding: 'utf8' });
    assert.equal(out.status, 1); assert.deepEqual(readdirSync(root), []);
  }
});
test('generated command runs as written', t => {
  const root = tmp(t); install({ project: root, dryRun: false });
  const handler = settings(root).hooks.PreToolUse[0].hooks[0];
  const input = JSON.stringify({ cwd: root, session_id: 'shell-test', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo hello' } });
  const args = handler.args.map(a => a.replaceAll('${CLAUDE_PROJECT_DIR}', root));
  const result = spawnSync(handler.command, args, { input, encoding: 'utf8', cwd: root });
  assert.equal(result.status, 0, result.stderr);
});
test('bootstrap blocks if a required policy module is unavailable', t => {
  const root = tmp(t); install({ project: root, dryRun: false });
  rmSync(join(root, '.claude/skills/eidolon/hooks/suite-evaluators.mjs'));
  const result = spawnSync(process.execPath, [join(root, '.claude/skills/eidolon/hooks/guard-bash.mjs'), '--project', root], {
    input: JSON.stringify({ cwd: root, session_id: 'test', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo hello' } }), encoding: 'utf8' });
  assert.equal(result.status, 2); assert.equal(result.stdout, '');
});
const PROJECT = '${CLAUDE_PROJECT_DIR}';
const allHandlers = conf => Object.values(conf.hooks).flatMap(groups => groups.flatMap(g => g.hooks));
const withHome = (home, fn) => {
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home; process.env.USERPROFILE = home;
  try { return fn(); } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
};
const backupsOf = root => { const dir = join(root, '.eidolon/backups'); return existsSync(dir) ? readdirSync(dir) : []; };
const journalOf = root => { const dir = join(root, '.eidolon/backups'); return JSON.parse(readFileSync(join(dir, readdirSync(dir)[0], 'journal.json'), 'utf8')); };

test('I2 a project that resolves to the home directory is refused before any write', t => {
  const home = tmp(t), env = { ...process.env, HOME: home, USERPROFILE: home };
  const out = spawnSync(process.execPath, [script, '--project', home, '--yes'], { encoding: 'utf8', env });
  assert.equal(out.status, 1); assert.match(out.stderr, /home directory/); assert.deepEqual(readdirSync(home), []);
  withHome(home, () => assert.throws(() => planInstall({ project: home }), /home directory/));
  withHome(home, () => assert.doesNotThrow(() => install({ home, dryRun: false })));
  assert.ok(existsSync(join(home, '.claude/skills/eidolon/SKILL.md')));
});
test('I3 generated hooks are portable, carry no absolute runtime path, and set subagent depth and effort', t => {
  const root = tmp(t); install({ project: root, dryRun: false });
  const text = readFileSync(join(root, '.claude/settings.json'), 'utf8'), conf = JSON.parse(text);
  const handlers = allHandlers(conf); assert.equal(handlers.length, 6);
  for (const h of handlers) {
    assert.equal(h.command, 'node');
    assert.deepEqual(h.args, [PROJECT + '/.claude/skills/eidolon/hooks/' + basename(h.args[0]), '--project', PROJECT]);
  }
  assert.deepEqual(handlers.map(h => basename(h.args[0])), ['guard-bash.mjs', 'guard-write.mjs', 'guard-dispatch.mjs', 'post-tool-entry.mjs', 'subagent-start.mjs', 'subagent-stop.mjs']);
  assert.deepEqual(Object.keys(conf.hooks), ['PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop']);
  assert.ok(!text.includes(JSON.stringify(process.execPath).slice(1, -1)) && !text.includes(userInfo().username) && !text.includes(JSON.stringify(root).slice(1, -1)));
  assert.deepEqual(conf.env, { CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '1' });
  assert.equal(conf.effortLevel, 'xhigh'); assert.equal(conf.maxEffortLevel, 'max');
  const manifest = JSON.parse(readFileSync(join(root, '.eidolon/policy-manifest.json'), 'utf8'));
  assert.ok(manifest.configurations[0].handlers.every(k => JSON.parse(k).handler.command === 'node'));
});
test('I3 env and effort settings merge with existing keys', t => {
  const root = tmp(t); put(root, '.claude/settings.json', JSON.stringify({ model: 'keep', env: { FOO: 'bar' } }));
  install({ project: root, dryRun: false });
  const conf = settings(root); assert.equal(conf.model, 'keep');
  assert.deepEqual(conf.env, { FOO: 'bar', CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '1' });
});
test('I3 every Bash git deny rule has a PowerShell mirror', t => {
  const root = tmp(t); install({ project: root, dryRun: false });
  const deny = settings(root).permissions.deny, git = deny.filter(r => r.startsWith('Bash(git'));
  assert.ok(git.length >= 6);
  for (const rule of git) assert.ok(deny.includes(rule.replace('Bash(', 'PowerShell(')), rule);
});
test('I5 reinstall replaces owned hook groups in place and leaves foreign entries alone', t => {
  const root = tmp(t), foreign = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo keep' }] };
  put(root, '.claude/settings.json', JSON.stringify({ hooks: { PreToolUse: [foreign] } }));
  install({ project: root, dryRun: false });
  const path = join(root, '.claude/settings.json'), conf = settings(root);
  for (const h of allHandlers(conf)) if (h.command === 'node') h.command = '/opt/elsewhere/node';
  conf.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo after' }] });
  writeFileSync(path, JSON.stringify(conf, null, 2) + '\n');
  install({ project: root, dryRun: false, replace: true });
  const next = settings(root), owned = ['guard-bash.mjs', 'guard-write.mjs', 'guard-dispatch.mjs', 'post-tool-entry.mjs', 'subagent-start.mjs', 'subagent-stop.mjs'];
  const mine = allHandlers(next).filter(h => owned.includes(basename(h.args?.[0] ?? '')));
  assert.equal(mine.length, 6); assert.ok(mine.every(h => h.command === 'node'));
  assert.deepEqual(next.hooks.PreToolUse.map(g => g.matcher), ['Bash', 'Bash|PowerShell', 'Write|Edit', 'Agent|Task', 'Bash']);
  assert.deepEqual(next.hooks.PreToolUse[0], foreign); assert.equal(next.hooks.PreToolUse[4].hooks[0].command, 'echo after');
  assert.equal(next.hooks.PostToolUse.length, 1); assert.equal(next.hooks.SubagentStart.length, 1); assert.equal(next.hooks.SubagentStop.length, 1);
});
test('I6 a failure between two renames restores prior targets, removes new ones, and journals the phase', t => {
  const root = tmp(t); put(root, 'CLAUDE.md', 'rules\n'); put(root, '.claude/settings.json', '{"custom":1}');
  const plan = planInstall({ project: root }); let seen;
  const afterRename = ({ path, step }) => {
    if (step !== 'install' || !path.endsWith('settings.json')) return;
    seen = journalOf(root);
    throw Error('injected failure');
  };
  assert.throws(() => applyPlan(plan, { dryRun: false, afterRename }), /injected failure/);
  assert.equal(seen.phase, 'applying'); assert.ok(seen.changes.some(c => c.path.endsWith('settings.json') && c.phase === 'installed'));
  assert.equal(readFileSync(join(root, '.claude/settings.json'), 'utf8'), '{"custom":1}');
  assert.equal(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), 'rules\n');
  for (const gone of ['.claude/skills', '.eidolon/policy-manifest.json', '.claude/eidolon-manifest.yaml', '.gitignore', '.eidolon/install.lock']) assert.ok(!existsSync(join(root, gone)), gone);
  assert.equal(journalOf(root).phase, 'rolled-back');
});
test('I6 the lock is retained only when recovery is incomplete', t => {
  const root = tmp(t); put(root, '.claude/settings.json', '{"custom":1}');
  const plan = planInstall({ project: root });
  const afterRename = ({ path, step }) => { if (step === 'install' && path.endsWith('settings.json')) { writeFileSync(path, 'concurrent'); throw Error('injected failure'); } };
  assert.throws(() => applyPlan(plan, { dryRun: false, afterRename }), /manual recovery/);
  assert.ok(existsSync(join(root, '.eidolon/install.lock')));
  assert.equal(readFileSync(join(root, '.claude/settings.json'), 'utf8'), 'concurrent');
  assert.equal(journalOf(root).phase, 'recovery-required');
});
test('I7 an identical reinstall reports changed 0 and creates no backup', t => {
  const root = tmp(t); install({ project: root, dryRun: false });
  const before = backupsOf(root), result = install({ project: root, dryRun: false, replace: true });
  assert.equal(result.changed, 0); assert.equal(result.backups, null); assert.deepEqual(backupsOf(root), before);
  assert.ok(!existsSync(join(root, '.eidolon/install.lock')));
});
test('I8 a failed apply removes directories it created and keeps pre-existing ones', t => {
  const root = tmp(t); mkdirSync(join(root, '.claude'));
  const plan = planInstall({ project: root });
  assert.throws(() => applyPlan(plan, { dryRun: false, beforeCommit: () => { throw Error('boom'); } }), /boom/);
  assert.deepEqual(readdirSync(root), ['.claude']); assert.deepEqual(readdirSync(join(root, '.claude')), []);
});
test('I9 a SKILL.md in the source is never swapped for a host variant, and no dead protections remain', t => {
  const home = tmp(t), src = tmp(t);
  put(src, 'SKILL.md', 'real skill\n'); put(src, 'references/claude-workflow.md', 'variant\n');
  install({ home, sources: [{ name: 'sample', source: src }], dryRun: false });
  assert.equal(readFileSync(join(home, '.claude/skills/sample/SKILL.md'), 'utf8'), 'real skill\n');
  const code = readFileSync(script, 'utf8');
  assert.doesNotMatch(code, /codex|\.agents|security-grader|security-attestation|claude-workflow/i);
  const root = tmp(t); install({ project: root, dryRun: false });
  assert.doesNotMatch(readFileSync(join(root, '.eidolon/policy-manifest.json'), 'utf8') + readFileSync(join(root, '.claude/settings.json'), 'utf8'), /security-grader|security-attestation/);
});
