// Installer fix round 2 (F13 to F27). Every install target is a temp directory; HOME is faked where the home directory matters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { install, planInstall, applyPlan } from './install.mjs';
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(source, 'scripts/install.mjs');
const J = JSON.stringify, sha = bytes => createHash('sha256').update(bytes).digest('hex');
function tmp(t) { const p = realpathSync(mkdtempSync(join(tmpdir(), 'eidolon-r2-'))); t.after(() => rmSync(p, { recursive: true, force: true })); return p; }
function put(root, path, content) { const p = join(root, path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); }
const settings = root => JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'));
const withHome = (home, fn) => {
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home; process.env.USERPROFILE = home;
  try { return fn(); } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
};
const fakeEnv = t => { const h = tmp(t); return { ...process.env, HOME: h, USERPROFILE: h, APPDATA: join(h, 'AppData') }; };
const cli = (t, ...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: fakeEnv(t) });
const git = (cwd, ...a) => { const r = spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const old = new Date(Date.now() - 20 * 60 * 1000);
const HOOKS = ['guard-bash', 'guard-write', 'guard-dispatch', 'post-tool-entry', 'subagent-start', 'subagent-stop'].map(n => n + '.mjs');
const PROJECT = '${CLAUDE_PROJECT_DIR}', HOOK_DIR = PROJECT + '/.claude/skills/eidolon/hooks/';
// A small Eidolon-shaped bundle: SKILL.md, one reference and the six hook files the settings wire.
function eidolonSrc(t, { asGit = false, omit = [] } = {}) {
  const s = tmp(t); put(s, 'SKILL.md', '---\nname: eidolon\ndescription: fixture\n---\n'); put(s, 'references/guide.md', 'guide\n');
  for (const f of HOOKS) if (!omit.includes(f)) put(s, 'hooks/' + f, '// stub\n');
  if (asGit) { git(s, 'init', '-q'); git(s, 'add', '-A'); git(s, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init'); }
  return [{ name: 'eidolon', source: s }];
}
const skillSrc = (t, name = 'sample') => { const s = tmp(t); put(s, 'SKILL.md', '---\nname: ' + name + '\ndescription: fixture\n---\n'); return s; };
// install() now needs the previewed digest, as the Hearth wrapper binds it.
const apply = o => install({ ...o, dryRun: false, expectedPlan: planInstall(o).digest });
const journalDir = root => { const d = join(root, '.eidolon/backups'); return join(d, readdirSync(d)[0]); };

// ---- F13: the home refusal compares file identities, so aliases of the home directory are refused ----
const shortOf = (parent, longName) => {
  const r = spawnSync('cmd', ['/c', 'dir', '/x', parent], { encoding: 'utf8' });
  for (const line of (r.stdout || '').split(/\r?\n/)) { const m = line.match(new RegExp('\\s(\\S+~\\d+)\\s+' + longName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$')); if (m) return m[1]; }
  return null;
};
function assertRefusedAsHome(home, alias, sources, label) {
  const before = readdirSync(home);
  withHome(home, () => {
    assert.throws(() => planInstall({ project: alias, sources }), /home directory/, label + ' preview');
    assert.throws(() => install({ project: alias, sources, dryRun: false, expectedPlan: '0'.repeat(64) }), /home directory/, label + ' apply');
  });
  assert.deepEqual(readdirSync(home), before, label + ' wrote nothing');
}
test('R2 F13 an 8.3 short-name alias of the home directory or of its parent is refused; a child through the alias is not', { skip: process.platform !== 'win32' && 'Windows only' }, t => {
  const base = tmp(t), name = 'EidolonLongHomeDirectory', home = join(base, name), sources = eidolonSrc(t); mkdirSync(home); mkdirSync(join(home, 'proj'));
  const short = shortOf(base, name);
  if (!short) { t.skip('this volume has no 8.3 short names'); return; }
  assertRefusedAsHome(home, join(base, short), sources, 'home alias');
  const shortBase = shortOf(dirname(base), basename(base));
  if (shortBase) assertRefusedAsHome(home, join(dirname(base), shortBase), sources, 'parent alias');
  withHome(home, () => assert.doesNotThrow(() => planInstall({ project: join(base, short, 'proj'), sources })));
});
test('R2 F13 the \\\\localhost\\C$ admin-share spelling of the home directory or of its parent is refused', { skip: process.platform !== 'win32' && 'Windows only' }, t => {
  const base = tmp(t), home = join(base, 'home'), sources = eidolonSrc(t); mkdirSync(home); mkdirSync(join(home, 'proj'));
  if (!/^[A-Za-z]:\\/.test(base)) { t.skip('temp directory is not on a drive letter'); return; }
  const unc = p => '\\\\localhost\\' + p[0] + '$\\' + p.slice(3);
  if (!existsSync(unc(base))) { t.skip('admin share is unreachable'); return; }
  assertRefusedAsHome(home, unc(home), sources, 'unc home');
  assertRefusedAsHome(home, unc(base), sources, 'unc parent');
  withHome(home, () => assert.doesNotThrow(() => planInstall({ project: unc(join(home, 'proj')), sources })));
});

// ---- F14: hooks are wired only when the hook files are in the bundle ----
test('R2 F14 a tracked file deleted from a git worktree is refused by name, hook or not', t => {
  const sources = eidolonSrc(t, { asGit: true }), src = sources[0].source;
  rmSync(join(src, 'hooks/guard-bash.mjs'));
  assert.throws(() => planInstall({ project: tmp(t), sources }), /hooks\/guard-bash\.mjs/);
  const other = eidolonSrc(t, { asGit: true }); rmSync(join(other[0].source, 'references/guide.md'));
  assert.throws(() => planInstall({ home: tmp(t), sources: other }), /references\/guide\.md/);
});
test('R2 F14 a project install refuses when the bundle lacks a hook file the settings would wire', t => {
  const root = tmp(t), sources = eidolonSrc(t, { omit: ['subagent-stop.mjs'] });
  assert.throws(() => planInstall({ project: root, sources }), /hooks\/subagent-stop\.mjs/);
  assert.deepEqual(readdirSync(root), []);
  assert.doesNotThrow(() => planInstall({ home: tmp(t), sources }));
});

// ---- F15 and F22: marker lines are matched whole, and duplicate or out of order markers are refused ----
const BEGIN = '<!-- eidolon:begin -->', END = '<!-- eidolon:end -->';
function installed(t) { const root = tmp(t), sources = eidolonSrc(t); apply({ project: root, sources }); return { root, sources, text: readFileSync(join(root, 'CLAUDE.md'), 'utf8') }; }
const reinstall = (root, sources) => apply({ project: root, sources, replace: true });
test('R2 F15 a human line that mentions the begin marker is not mistaken for the block', t => {
  const { root, sources, text } = installed(t), path = join(root, 'CLAUDE.md');
  const edited = 'Notes: ' + BEGIN + ' opens the managed block and ' + END + ' closes it.\nImportant human paragraph.\n\n' + text;
  writeFileSync(path, edited); reinstall(root, sources);
  assert.equal(readFileSync(path, 'utf8'), edited);
});
test('R2 F15 CRLF marker lines are still recognized as the one block', t => {
  const { root, sources, text } = installed(t), path = join(root, 'CLAUDE.md');
  writeFileSync(path, text.replaceAll('\n', '\r\n')); reinstall(root, sources);
  assert.equal(readFileSync(path, 'utf8').split(BEGIN).length - 1, 1);
});
test('R2 F15 and F22 duplicate, planted or out of order marker lines are refused naming the file and leave it untouched', t => {
  const { root, sources, text } = installed(t);
  const cases = {
    'a second begin line': 'Human.\n' + BEGIN + '\nplanted\n' + text,
    'a planted end line after the block': text + 'planted text\n' + END + '\nmore planted\n',
    'two end lines, one before the block': END + '\n' + text,
    'a single end line before a single begin line': 'Human.\n' + END + '\n' + BEGIN + '\nbody\n',
    'an end line with no begin line': 'Human.\n' + END + '\n',
  };
  for (const [label, bad] of Object.entries(cases)) {
    writeFileSync(join(root, 'CLAUDE.md'), bad);
    assert.throws(() => planInstall({ project: root, sources, replace: true }), e => e.message.includes('CLAUDE.md') && /marker|begin|end/i.test(e.message), label);
    assert.equal(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), bad, label);
  }
  writeFileSync(join(root, 'CLAUDE.md'), text);
  const ignore = readFileSync(join(root, '.gitignore'), 'utf8');
  writeFileSync(join(root, '.gitignore'), ignore + 'x\n# eidolon:end\n');
  assert.throws(() => planInstall({ project: root, sources, replace: true }), /\.gitignore/);
});

// ---- F16: the --yes refusal prints no digest ----
test('R2 F16 --yes without --expect-plan says to preview first and prints no digest', t => {
  const home = tmp(t), env = { ...process.env, HOME: home, USERPROFILE: home };
  const out = spawnSync(process.execPath, [script, '--home', home, '--yes'], { encoding: 'utf8', env });
  assert.equal(out.status, 1); assert.match(out.stderr, /preview/i); assert.match(out.stderr, /--expect-plan/);
  assert.doesNotMatch(out.stderr, /[0-9a-f]{64}/); assert.deepEqual(readdirSync(home), []);
});

// ---- F17 and F18: stale lock handling ----
test('R2 F17 a stale lock kept for recovery-required is not swept; the refusal names the journal', t => {
  const home = tmp(t), sources = [{ name: 'sample', source: skillSrc(t) }], lock = join(home, '.eidolon/install.lock');
  put(home, '.claude/skills/sample/SKILL.md', 'local work');
  const plan = planInstall({ home, sources, replace: true });
  const afterRename = ({ path, step }) => { if (step === 'install') { rmSync(path, { recursive: true }); writeFileSync(path, 'concurrent'); throw Error('injected failure'); } };
  assert.throws(() => applyPlan(plan, { dryRun: false, replace: true, afterRename }), /manual recovery/);
  const journal = join(journalDir(home), 'journal.json');
  assert.equal(JSON.parse(readFileSync(journal, 'utf8')).phase, 'recovery-required');
  utimesSync(lock, old, old);
  const again = planInstall({ home, sources, replace: true });
  assert.throws(() => applyPlan(again, { dryRun: false, replace: true }), e => /recovery-required/.test(e.message) && e.message.includes(journal));
  assert.ok(existsSync(join(lock, 'owner.json')), 'the lock is kept');
  assert.equal(readFileSync(join(home, '.claude/skills/sample'), 'utf8'), 'concurrent');
});
test('R2 F18 a lock that turns fresh between the stale check and the sweep survives; a plain stale lock leaves no leftovers', t => {
  const home = tmp(t), sources = [{ name: 'sample', source: skillSrc(t) }], lock = join(home, '.eidolon/install.lock');
  mkdirSync(lock, { recursive: true }); utimesSync(lock, old, old);
  const plan = planInstall({ home, sources });
  const afterStaleCheck = () => { rmSync(lock, { recursive: true }); mkdirSync(lock); writeFileSync(join(lock, 'owner.json'), '{"pid":1}'); };
  assert.throws(() => applyPlan(plan, { dryRun: false, afterStaleCheck }), /install\.lock/);
  assert.ok(existsSync(join(lock, 'owner.json')), 'the competing fresh lock must survive');
  assert.ok(!existsSync(join(home, '.claude/skills/sample')));
  assert.deepEqual(readdirSync(join(home, '.eidolon')).filter(n => n.startsWith('install.lock.')), []);
  rmSync(lock, { recursive: true }); mkdirSync(lock); utimesSync(lock, old, old);
  assert.equal(applyPlan(planInstall({ home, sources }), { dryRun: false }).changed, 1);
  assert.deepEqual(readdirSync(join(home, '.eidolon')).filter(n => n.startsWith('install.lock')), []);
});

// ---- F19: the bytes that were verified are the bytes that are installed ----
test('R2 F19 a source file changed after lock verification is neither installed nor sealed into the plan', t => {
  const home = tmp(t), src = skillSrc(t), base = tmp(t), lock = join(base, 'lock.json'), good = readFileSync(join(src, 'SKILL.md'));
  writeFileSync(lock, J({ sources: { sample: 'abc1234' }, files: { 'sample/SKILL.md': sha(good) } }));
  let called = false;
  const plan = planInstall({ home, sources: [{ name: 'sample', source: src }], lock, afterLockCheck: () => { called = true; writeFileSync(join(src, 'SKILL.md'), 'TAMPERED'); } });
  assert.ok(called, 'afterLockCheck runs between verification and the bundle read');
  assert.equal(sha(plan.items[0].files.get('SKILL.md').bytes), sha(good));
  assert.throws(() => applyPlan(plan, { dryRun: false }), /source changed/);
  assert.ok(!existsSync(join(home, '.claude/skills/sample')));
});

// ---- F20 and F21: settings checks and the overwrite notice ----
test('R2 F20 disableAllHooks in settings.local.json is refused, naming that file', t => {
  const root = tmp(t), sources = eidolonSrc(t);
  put(root, '.claude/settings.local.json', J({ disableAllHooks: true }));
  assert.throws(() => planInstall({ project: root, sources }), e => /settings\.local\.json/.test(e.message) && /disableAllHooks/.test(e.message));
  put(root, '.claude/settings.local.json', J({ disableAllHooks: false }));
  assert.doesNotThrow(() => planInstall({ project: root, sources }));
});
test('R2 F21 the env and effort overwrite is kept and announced in the preview', t => {
  const root = tmp(t), sources = eidolonSrc(t);
  put(root, '.claude/settings.json', J({ env: { CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '5', KEEP: 'me' }, effortLevel: 'low', maxEffortLevel: 'high' }));
  const note = install({ project: root, sources }).previews.find(p => p.path === join(root, '.claude/settings.json')).note;
  for (const key of ['CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH', 'effortLevel', 'maxEffortLevel']) assert.ok(note?.includes(key), key);
  assert.match(note, /overwrit/i);
  apply({ project: root, sources });
  const conf = settings(root);
  assert.deepEqual(conf.env, { CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '1', KEEP: 'me' }); assert.equal(conf.effortLevel, 'xhigh'); assert.equal(conf.maxEffortLevel, 'max');
});
test('R2 F21 the CLI preview prints the overwrite notice under the settings path, before the diff', t => {
  const root = tmp(t), out = cli(t, '--project', root);
  assert.equal(out.status, 0, out.stderr);
  const at = out.stdout.indexOf(join(root, '.claude', 'settings.json')), diff = out.stdout.indexOf('--- /dev/null', at), notice = out.stdout.indexOf('CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH', at);
  assert.ok(at >= 0 && notice > at && notice < diff, out.stdout.slice(at, at + 400));
  assert.match(out.stdout.slice(at, diff), /overwrit/i); assert.deepEqual(readdirSync(root), []);
});

// ---- F23: ownership is exact equality on the normalized path ----
test('R2 F23 a foreign handler whose path climbs with .. is kept on reinstall; an equivalent spelling of an owned path is replaced', t => {
  const root = tmp(t), sources = eidolonSrc(t); apply({ project: root, sources });
  const conf = settings(root), foreignArgs = { type: 'command', command: 'node', args: [HOOK_DIR + '../../evil/guard-bash.mjs'] };
  const foreignCommand = { type: 'command', command: 'node "' + HOOK_DIR + '../x/post-tool-entry.mjs"' };
  const spelled = { type: 'command', command: 'node', args: [HOOK_DIR + 'sub/../guard-bash.mjs'] };
  conf.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [foreignArgs] }, { matcher: 'Bash', hooks: [spelled] }); conf.hooks.PostToolUse.push({ matcher: 'Write', hooks: [foreignCommand] });
  writeFileSync(join(root, '.claude/settings.json'), J(conf, null, 2));
  apply({ project: root, sources, replace: true });
  const next = settings(root), text = J(next);
  assert.ok(text.includes('evil/guard-bash.mjs'), 'foreign args handler dropped'); assert.ok(text.includes('x/post-tool-entry.mjs'), 'foreign command handler dropped');
  assert.ok(!text.includes('sub/../guard-bash.mjs'), 'equivalent owned spelling not replaced');
  const guards = next.hooks.PreToolUse.flatMap(g => g.hooks).filter(h => h.args?.[0] === HOOK_DIR + 'guard-bash.mjs');
  assert.equal(guards.length, 1);
});

// ---- F24: reserved device names ----
test('R2 F24 a Windows reserved device name is not a valid skill name', t => {
  const src = skillSrc(t);
  for (const name of ['con', 'nul', 'aux', 'prn', 'com1', 'com9', 'lpt1', 'lpt9']) assert.throws(() => planInstall({ home: tmp(t), sources: [{ name, source: src }] }), /Invalid skill name/, name);
  for (const name of ['console', 'com10', 'aux-tools', 'lpt']) assert.doesNotThrow(() => planInstall({ home: tmp(t), sources: [{ name, source: src }] }), name);
});

// ---- F25 and F26: malformed existing configuration is refused with a useful message ----
test('R2 F25 a null or non-object hook group is refused, naming the event, and nothing is written', t => {
  for (const bad of [null, 'text', 7, []]) {
    const root = tmp(t), sources = eidolonSrc(t);
    put(root, '.claude/settings.json', J({ hooks: { PreToolUse: [bad] } }));
    assert.throws(() => planInstall({ project: root, sources }), /PreToolUse/, J(bad));
  }
  const root = tmp(t); put(root, '.claude/settings.json', J({ hooks: { PostToolUse: 'x' } }));
  assert.throws(() => planInstall({ project: root, sources: eidolonSrc(t) }), /PostToolUse/);
});
test('R2 F26 a malformed existing policy manifest is refused naming the file', t => {
  for (const body of ['[]', '{not json', 'null']) {
    const root = tmp(t), sources = eidolonSrc(t); put(root, '.eidolon/policy-manifest.json', body);
    assert.throws(() => planInstall({ project: root, sources }), /policy-manifest\.json/, body);
  }
});

// ---- F27: install() applies only a previewed plan ----
test('R2 F27 install() with dryRun false needs expectedPlan; the previewed digest applies; a stale digest is refused', t => {
  const root = tmp(t), sources = eidolonSrc(t);
  assert.throws(() => install({ project: root, sources, dryRun: false }), /expectedPlan/);
  assert.deepEqual(readdirSync(root), []);
  assert.throws(() => install({ project: root, sources, dryRun: false, expectedPlan: '0'.repeat(64) }), /changed|review/);
  assert.deepEqual(readdirSync(root), []);
  const digest = install({ project: root, sources }).planDigest;
  assert.equal(install({ project: root, sources, dryRun: false, expectedPlan: digest }).dryRun, false);
  assert.ok(existsSync(join(root, '.claude/skills/eidolon/SKILL.md')));
  const previewOnly = tmp(t); assert.equal(install({ project: previewOnly, sources }).dryRun, true); assert.deepEqual(readdirSync(previewOnly), []);
});

// ---- README and --help claims ----
test('R2 every changed install leaves journal.json and receipt.json, under --home too', t => {
  const home = tmp(t), sources = [{ name: 'sample', source: skillSrc(t) }], result = apply({ home, sources });
  assert.equal(result.changed, 1);
  assert.equal(JSON.parse(readFileSync(join(result.backups, 'journal.json'), 'utf8')).phase, 'complete');
  assert.ok(existsSync(join(result.backups, 'receipt.json')));
});
test('R2 --help and the README state the installer guarantees', t => {
  const help = cli(t, '--help').stdout, readme = readFileSync(join(source, 'README.md'), 'utf8');
  for (const [label, re] of [
    ['work types', /--work-type standard\|infrastructure/], ['abbreviated pins', /7 or more characters/], ['both settings files', /settings\.local\.json/],
    ['disableAllHooks', /disableAllHooks/], ['overwrite', /overwrit[a-z]* [^\n]*effortLevel|effortLevel[^\n]*overwrit/i], ['depth key', /CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH/],
    ['aliases', /alias/i], ['whole marker lines', /whole (marker )?lines?/i], ['journal and receipt', /journal\.json/], ['no digest on refusal', /no digest/i], ['preview only', /preview only|nothing is written/i],
  ]) { assert.match(help, re, 'help: ' + label); assert.match(readme, re, 'README: ' + label); }
  assert.match(readme, /Unverified: the Node 22 check runs before any syntax that an older Node would reject; settle by running the installer under Node 20\./);
});
