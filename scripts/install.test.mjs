import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir, userInfo } from 'node:os';
import { spawnSync } from 'node:child_process';
import { install as installOnce, planInstall, applyPlan } from './install.mjs';
// install() applies only a previewed plan (F27): bind the digest the way the Hearth wrapper does.
const install = o => installOnce(o?.dryRun === false && !o.expectedPlan ? { ...o, expectedPlan: planInstall(o).digest } : o);
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

// ---- F1 to F12: execution-review fixes. Every fixture lives under the OS temp directory with a fake HOME. ----
const J = JSON.stringify, sha = bytes => createHash('sha256').update(bytes).digest('hex');
// An eidolon fixture ships the six hook files the project install wires (F14).
const skillSrc = (t, name = 'sample') => { const s = tmp(t); put(s, 'SKILL.md', '---\nname: ' + name + '\ndescription: fixture\n---\n'); if (name === 'eidolon') for (const h of ['guard-bash', 'guard-write', 'guard-dispatch', 'post-tool-entry', 'subagent-start', 'subagent-stop']) put(s, 'hooks/' + h + '.mjs', '// stub\n'); return s; };
const git = (cwd, ...a) => { const r = spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
function gitSource(t) {
  const src = tmp(t); git(src, 'init', '-q'); put(src, 'SKILL.md', '---\nname: sample\ndescription: fixture\n---\n'); put(src, '.gitignore', '.env\n');
  git(src, 'add', '-A'); git(src, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init');
  put(src, '.env', 'SECRET=1'); put(src, 'id.key', 'k'); put(src, 'graphify-out/x.json', '{}'); return src;
}
const fakeEnv = t => { const h = tmp(t); return { ...process.env, HOME: h, USERPROFILE: h, APPDATA: join(h, 'AppData') }; };
const installUrl = pathToFileURL(join(source, 'scripts/install.mjs')).href;
const child = (t, code) => spawnSync(process.execPath, ['--input-type=module', '-e', 'import {install,planInstall,applyPlan} from ' + J(installUrl) + ';\n' + code], { encoding: 'utf8', env: fakeEnv(t) });
const old = new Date(Date.now() - 20 * 60 * 1000);

test('F1 a git source installs tracked files only, never untracked or ignored ones', t => {
  const src = gitSource(t), home = tmp(t);
  install({ home, sources: [{ name: 'sample', source: src }], dryRun: false });
  assert.deepEqual(readdirSync(join(home, '.claude/skills/sample')).sort(), ['.gitignore', 'SKILL.md']);
});
test('F2 a git source whose HEAD differs from the lock pin is refused naming both commits; a plain directory pin lands in the receipt', t => {
  const src = gitSource(t), head = git(src, 'rev-parse', 'HEAD'), base = tmp(t), lock = join(base, 'lock.json');
  const files = {}; for (const rel of ['SKILL.md', '.gitignore']) files['sample/' + rel] = sha(readFileSync(join(src, rel)));
  const sources = [{ name: 'sample', source: src }];
  writeFileSync(lock, J({ sources: { sample: head }, files }));
  assert.doesNotThrow(() => planInstall({ home: base, sources, lock }));
  writeFileSync(lock, J({ sources: { sample: 'deadbee0000' }, files }));
  assert.throws(() => planInstall({ home: base, sources, lock }), e => e.message.includes('deadbee0000') && e.message.includes(head));
  const plain = skillSrc(t), home = tmp(t), plock = join(base, 'plain.json');
  writeFileSync(plock, J({ sources: { sample: 'abc1234' }, files: { 'sample/SKILL.md': sha(readFileSync(join(plain, 'SKILL.md'))) } }));
  const result = install({ home, sources: [{ name: 'sample', source: plain }], lock: plock, dryRun: false });
  assert.deepEqual(JSON.parse(readFileSync(join(result.backups, 'receipt.json'), 'utf8')).sources, [{ name: 'sample', commit: 'abc1234' }]);
});
test('F3 a foreign handler that merely shares an owned basename survives reinstall', t => {
  const root = tmp(t), sources = [{ name: 'eidolon', source: skillSrc(t, 'eidolon') }];
  const foreign = { matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['old/hooks/guard-bash.mjs'] }] };
  put(root, '.claude/settings.json', J({ hooks: { PreToolUse: [foreign] } }));
  install({ project: root, sources, dryRun: false });
  install({ project: root, sources, dryRun: false, replace: true });
  assert.deepEqual(settings(root).hooks.PreToolUse[0], foreign);
});
test('F6 a project that contains the home directory, or a filesystem root, is refused', t => {
  const parent = tmp(t), home = join(parent, 'home'), sources = [{ name: 'eidolon', source: skillSrc(t, 'eidolon') }]; mkdirSync(home);
  withHome(home, () => assert.throws(() => planInstall({ project: parent, sources }), /home directory/));
  withHome(home, () => assert.throws(() => planInstall({ project: parse(parent).root, sources }), /filesystem root/));
});
test('F7 an existing disableAllHooks true is refused, naming the key', t => {
  const root = tmp(t), sources = [{ name: 'eidolon', source: skillSrc(t, 'eidolon') }];
  put(root, '.claude/settings.json', J({ disableAllHooks: true }));
  assert.throws(() => planInstall({ project: root, sources }), /disableAllHooks/);
});
test('F8 a non-array permissions.deny and a non-object env are refused, naming the key', t => {
  const root = tmp(t), sources = [{ name: 'eidolon', source: skillSrc(t, 'eidolon') }];
  put(root, '.claude/settings.json', J({ permissions: { deny: 'Bash(rm)' } }));
  assert.throws(() => planInstall({ project: root, sources }), /permissions\.deny/);
  put(root, '.claude/settings.json', J({ env: 'FOO=1' }));
  assert.throws(() => planInstall({ project: root, sources }), /\benv\b/);
});
test('F9 a crash after staging leaves no second skill under .claude/skills, and stale stage directories are swept', t => {
  const home = tmp(t), src = skillSrc(t), run = code => child(t, 'const plan=planInstall({home:' + J(home) + ',sources:[{name:"sample",source:' + J(src) + '}]});' + code);
  const crashed = run('applyPlan(plan,{dryRun:false,beforeCommit:()=>process.exit(7)});');
  assert.equal(crashed.status, 7, crashed.stderr);
  const skills = join(home, '.claude/skills'); assert.deepEqual((existsSync(skills) ? readdirSync(skills) : []).filter(n => n !== 'sample'), []);
  rmSync(join(home, '.eidolon/install.lock'), { recursive: true, force: true });
  put(home, '.eidolon/stage/stale-run/x', 'x'); put(home, '.eidolon/stage/fresh-run/y', 'y'); utimesSync(join(home, '.eidolon/stage/stale-run'), old, old);
  const swept = run('applyPlan(plan,{dryRun:false});');
  assert.equal(swept.status, 0, swept.stderr); assert.match(swept.stderr, /stale/i);
  assert.ok(!existsSync(join(home, '.eidolon/stage/stale-run'))); assert.ok(existsSync(join(home, '.eidolon/stage/fresh-run')));
  assert.ok(existsSync(join(skills, 'sample/SKILL.md')));
});
test('F10 a crash after the backup rename journals backed-up, and a stale lock is removed with a note', t => {
  const home = tmp(t), src = skillSrc(t); put(home, '.claude/skills/sample/SKILL.md', 'local work');
  const code = tail => 'const plan=planInstall({home:' + J(home) + ',sources:[{name:"sample",source:' + J(src) + '}],replace:true});' + tail;
  const crashed = child(t, code('applyPlan(plan,{dryRun:false,replace:true,afterRename:({step})=>{if(step==="backup")process.exit(7)}});'));
  assert.equal(crashed.status, 7, crashed.stderr);
  assert.equal(journalOf(home).changes[0].phase, 'backed-up');
  const blocked = child(t, code('applyPlan(plan,{dryRun:false,replace:true});'));
  assert.notEqual(blocked.status, 0); assert.match(blocked.stderr, /install\.lock/);
  utimesSync(join(home, '.eidolon/install.lock'), old, old);
  const later = child(t, code('applyPlan(plan,{dryRun:false,replace:true});'));
  assert.equal(later.status, 0, later.stderr); assert.match(later.stderr, /stale/i);
  assert.equal(readFileSync(join(home, '.claude/skills/sample/SKILL.md'), 'utf8'), readFileSync(join(src, 'SKILL.md'), 'utf8'));
});
test('F11 replacing an existing skill previews added, changed and removed files', t => {
  const home = tmp(t), src = skillSrc(t); put(src, 'keep.md', 'same'); put(src, 'edit.md', 'new'); put(src, 'fresh.md', 'added');
  put(home, '.claude/skills/sample/SKILL.md', readFileSync(join(src, 'SKILL.md'))); put(home, '.claude/skills/sample/keep.md', 'same'); put(home, '.claude/skills/sample/edit.md', 'old'); put(home, '.claude/skills/sample/gone.md', 'bye');
  const preview = install({ home, sources: [{ name: 'sample', source: src }], replace: true }).previews.find(p => p.path === join(home, '.claude/skills/sample'));
  assert.deepEqual(preview.files, { added: ['fresh.md'], changed: ['edit.md'], removed: ['gone.md'] });
});
function cliFixture(t) {
  const base = tmp(t); mkdirSync(join(base, 'scripts')); mkdirSync(join(base, 'hooks'));
  copyFileSync(script, join(base, 'scripts/install.mjs'));
  for (const f of ['confined-path.mjs', 'policy-manifest.mjs', 'operation.mjs']) copyFileSync(join(source, 'hooks', f), join(base, 'hooks', f));
  put(base, 'SKILL.md', '---\nname: eidolon\ndescription: fixture\n---\n');
  const home = tmp(t), env = fakeEnv(t), run = (...a) => spawnSync(process.execPath, [join(base, 'scripts/install.mjs'), '--home', home, ...a], { encoding: 'utf8', env });
  return { home, run };
}
test('F12 --yes without --expect-plan is refused without a digest; the previewed digest is accepted; --help documents it', t => {
  const { home, run } = cliFixture(t);
  const refused = run('--yes'); assert.equal(refused.status, 1);
  assert.match(refused.stderr, /preview first/); assert.doesNotMatch(refused.stderr, /[0-9a-f]{64}/); assert.ok(!existsSync(join(home, '.claude')));
  const preview = run(); assert.equal(preview.status, 0, preview.stderr);
  const line = preview.stdout.match(/To apply exactly this plan: --yes --expect-plan ([0-9a-f]{64})/); assert.ok(line, preview.stdout);
  const applied = run('--yes', '--expect-plan', line[1]); assert.equal(applied.status, 0, applied.stderr);
  assert.ok(existsSync(join(home, '.claude/skills/eidolon/SKILL.md')));
  assert.match(run('--help').stdout, /--expect-plan/);
});
