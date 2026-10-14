// Tests for fix round 6 of the hook review: the script scan judges the literal targets of its mutation calls the way the shell path
// judges an operand, the call operator with a subexpression target, git aliases from included config files and from GIT_CONFIG_KEY_n,
// the whole-tree check's spawn count, the user git config files as protected outside shapes, and a fixture with real scripts in it.
// Same rules as the earlier review files: every case drives the wired entry point in a throwaway git repo, nothing is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync, execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HOOKS = dirname(fileURLToPath(import.meta.url));
const WORKER = {agent_id: 'w1', agent_type: 'builder'};

function repo(t, {scopes = {builder: {read: ['**'], write: ['src/**']}}, history = false} = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'eidolon-r6-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  execFileSync('git', ['init', '-q', '-b', 'main'], {cwd: root});
  const put = (path, text) => { const file = join(root, path); mkdirSync(dirname(file), {recursive: true}); writeFileSync(file, text); };
  put('docs/decisions/x.md', 'original\n');
  put('docs/fixes/FIX-1.md', 'original\n');
  put('docs/insights/i.md', 'original\n');
  put('DECISIONS.md', 'original\n');
  put('hooks/guard-bash.mjs', '// fixture\n');
  put('hooks/lib.mjs', '// fixture\n');
  put('src/a.ts', 'export {};\n');
  put('.claude/settings.json', '{}\n');
  if (scopes) put('.claude/agent-scopes.json', JSON.stringify(scopes));
  const g = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  if (history) { g('add', '-A'); g('commit', '-q', '-m', 'base'); }
  const branch = (name, files) => {
    g('checkout', '-q', '-b', name, 'main');
    for (const [path, text] of Object.entries(files)) put(path, text);
    g('add', '-A'); g('commit', '-q', '-m', name); g('checkout', '-q', 'main');
  };
  return {root, put, g, branch};
}
const run = (root, script, event, env = process.env) => spawnSync(process.execPath, [join(HOOKS, script), '--project', root], {
  cwd: event.cwd ?? root, encoding: 'utf8', timeout: 20000, env, input: JSON.stringify({cwd: root, session_id: 's1', ...event}),
});
const sh = (root, command, extra = {}, tool = 'Bash', env = process.env) => run(root, 'guard-bash.mjs', {tool_name: tool, tool_input: {command}, ...extra}, env);
const ps = (root, command, extra = {}) => sh(root, command, extra, 'PowerShell');
const wr = (root, file_path, content = 'x', extra = {}) => run(root, 'guard-write.mjs', {tool_name: 'Write', tool_input: {file_path, content}, ...extra});
const blocked = (r, label, what) => {
  assert.equal(r.status, 2, `${what}: expected block, got exit ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  assert.match(r.stderr, new RegExp(label), what);
};
const askedWith = r => { try { return JSON.parse(r.stdout || '{}').hookSpecificOutput?.permissionDecision === 'ask'; } catch { return false; } };
const asked = (r, label, what) => {
  assert.equal(r.status, 0, `${what}: expected ask (exit 0), got exit ${r.status}\nstderr: ${r.stderr}`);
  assert.ok(askedWith(r), `${what}: expected ask, got stdout: ${r.stdout}`);
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, new RegExp(label), what);
};
const silent = (r, what) => assert.ok(r.status === 0 && r.stdout === '', `${what}: expected silent allow, got exit ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
const each = (list, fn) => list.forEach(fn);

test('T1 a script is judged by the literal targets of its mutation calls; a protected name it cannot place asks', t => {
  const {root, put} = repo(t);
  put('gen-docs.js', "const fs = require('fs'), path = require('path');\nfs.writeFileSync(path.join('docs', 'api.md'), '# API');\n");
  put('gen-docs2.js', "const fs = require('fs'), path = require('path');\nfs.writeFileSync(path.join(__dirname, 'docs', 'api.md'), '# API');\n");
  put('clean_build.py', "import os, shutil\nshutil.rmtree(os.path.join('docs', '_build'), ignore_errors=True)\n");
  put('docsgen.js', "const fs = require('fs');\nconst names = fs.readdirSync('docs/decisions');\nfs.writeFileSync('src/index.json', JSON.stringify(names));\n");
  put('copy.js', "require('fs').copyFileSync('docs/decisions/x.md', 'src/x.md');\n");
  put('package.json', JSON.stringify({scripts: {docs: 'node gen-docs.js'}}));
  each(['node gen-docs.js', 'node gen-docs2.js', 'python clean_build.py', 'node docsgen.js', 'node copy.js', 'npm run docs'], c => silent(sh(root, c), c));
  put('clean.js', "const fs = require('fs');\nfs.rmSync('docs/decisions', {recursive: true});\n");
  put('concat.js', "const fs = require('fs');\nfs.rmSync('do' + 'cs/decisions', {recursive: true});\n");
  put('parent.py', "import shutil\nshutil.rmtree('docs')\n");
  put('move.js', "require('fs').renameSync('DECISIONS.md', 'src/old.md');\n");
  put('hookdel.js', "require('fs').unlinkSync('hooks/lib.mjs');\n");
  each(['node clean.js', 'node concat.js', 'python parent.py', 'node move.js'], c => blocked(sh(root, c), 'DELETION GUARD', c));
  blocked(sh(root, 'node hookdel.js'), 'HOOK INTEGRITY GUARD', 'a script that deletes a hook blocks, as rm hooks/lib.mjs does');
  put('var.js', "const fs = require('fs');\nconst d = 'docs/decisions';\nfs.rmSync(d, {recursive: true});\n");
  put('stamp.js', "const fs = require('fs'), path = require('path');\nconst head = fs.readFileSync('.git/HEAD', 'utf8').trim();\nfs.writeFileSync(path.join(__dirname, 'src', 'version.txt'), head);\n");
  put('var.ps1', "$d = 'docs/decisions'\nRemove-Item -Recurse $d\n");
  put('parentvar.js', "const fs = require('fs'), d = 'docs';\nfs.rmSync(d, {recursive: true});\n");
  for (const c of ['node var.js', 'node stamp.js', 'pwsh -File var.ps1', 'node parentvar.js']) {
    const r = sh(root, c); asked(r, 'RUNTIME INTEGRITY GUARD', c);
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, /a script names \S+ in a way the parser cannot resolve/, c + ' says why');
  }
  put('suffix.js', "const fs = require('fs');\nfs.rmSync(process.cwd() + '/docs/decisions', {recursive: true});\n");
  asked(sh(root, 'node suffix.js'), 'RUNTIME INTEGRITY GUARD', 'a protected path glued to a variable');
  put('execvar.js', "const {execSync} = require('child_process'), flags = '-rf';\nexecSync('rm ' + flags + ' docs/decisions');\n");
  blocked(sh(root, 'node execvar.js'), 'DELETION GUARD', 'an exec call with a variable is judged by its own literals, as before');
  put('stamp-literal.js', "const fs = require('fs');\nfs.writeFileSync('src/version.txt', fs.readFileSync('.git/HEAD', 'utf8'));\n");
  silent(sh(root, 'node stamp-literal.js'), 'a script that reads .git/HEAD and writes a literal path under src/');
  asked(sh(root, 'node var.js', WORKER), 'RUNTIME INTEGRITY GUARD', 'a worker gets the same ask (the accepted tradeoff: a variable-held path is asked about, not blocked)');
});

test('T2 this repository\'s installer, run with --help from a project that holds a copy of it, asks and does not block', t => {
  const {root} = repo(t);
  mkdirSync(join(root, 'scripts'), {recursive: true});
  copyFileSync(join(HOOKS, '..', 'scripts', 'install.mjs'), join(root, 'scripts', 'install.mjs'));
  asked(sh(root, 'node scripts/install.mjs --help'), 'RUNTIME INTEGRITY GUARD', 'node scripts/install.mjs --help');
});

test('T2b this repository\'s own gate commands stay silent when its hooks judge them', () => {
  const root = realpathSync.native(join(HOOKS, '..'));
  each(['node scripts/selfcheck.mjs', 'node scripts/eidolon-audit.mjs', 'node scripts/hooks-readme-check.mjs', 'node scripts/persona-lint.mjs references/personas/*.md', 'node scripts/inspect-git-hooks.mjs',
    'node --test "hooks/*.test.mjs" "scripts/*.test.mjs"'], c => silent(sh(root, c), c));
});

test('T3 a PowerShell call operator whose target is a subexpression asks', t => {
  const {root} = repo(t);
  each(['& (Get-Command git) commit -n -m x', '& $(Get-Command git) commit -n -m x', '& @(Get-Command git) commit -n -m x'], c => asked(ps(root, c), 'RUNTIME INTEGRITY GUARD', c));
  each([`$c = 'npm'; & $c test`, '& npm test', `& 'C:/Program Files/nodejs/node.exe' --version`], c => silent(ps(root, c), c));
});

function home(t, files) {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'eidolon-r6-home-')));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, path)), {recursive: true}); writeFileSync(join(dir, path), text); }
  return {dir, env: {...process.env, HOME: dir, USERPROFILE: dir, XDG_CONFIG_HOME: join(dir, '.config')}};
}

test('T4 a git alias from an included config file, and one given through GIT_CONFIG_KEY_n, is expanded and judged', t => {
  const {root, g} = repo(t);
  const relative = home(t, {'.gitconfig': '[include]\n\tpath = extra.gitconfig\n', 'extra.gitconfig': '[alias]\n\tqq = commit --no-verify\n'});
  blocked(sh(root, 'git qq -m x', {}, 'Bash', relative.env), 'COMMIT QUALITY GUARD', 'alias from an include path relative to ~/.gitconfig');
  const tilde = home(t, {'.gitconfig': '[user]\n\tname = x\n[includeIf "gitdir:~/work/"]\n\tpath = ~/inc/work.gitconfig\n', 'inc/work.gitconfig': '[alias]\n\tpf = push --force\n'});
  blocked(sh(root, 'git pf origin main', {}, 'Bash', tilde.env), 'COMMIT QUALITY GUARD', 'alias from a ~/ include path');
  const plain = home(t, {'.gitconfig': '[include]\n\tpath = extra.gitconfig\n', 'extra.gitconfig': '[alias]\n\tlg = log --oneline\n'});
  silent(sh(root, 'git lg', {}, 'Bash', plain.env), 'a harmless included alias');
  writeFileSync(join(root, '.git', 'local.gitconfig'), '[alias]\n\tci = commit -n\n');
  g('config', 'include.path', 'local.gitconfig');
  blocked(sh(root, 'git ci -m x'), 'COMMIT QUALITY GUARD', 'alias from an include in .git/config, relative to the .git directory');
  each(['GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.x GIT_CONFIG_VALUE_0="commit -n" git x -m y', "export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.x GIT_CONFIG_VALUE_0='push --force'; git x origin main",
    'env GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=user.name GIT_CONFIG_VALUE_0=x GIT_CONFIG_KEY_1=alias.y GIT_CONFIG_VALUE_1="commit --no-verify" git y -m z'],
  c => blocked(sh(root, c), 'COMMIT QUALITY GUARD', c));
  silent(sh(root, 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.x GIT_CONFIG_VALUE_0="log --oneline" git x'), 'a harmless alias through GIT_CONFIG_KEY_0');
});

test('T5 the controller whole-tree check spends one rev-parse and one diff per comparison', async t => {
  const {evalCommitQuality, gitSpawn} = await import('./commit-quality-guard.mjs');
  assert.equal(typeof gitSpawn?.fn, 'function', 'commit-quality-guard exports the git spawner it uses, so a test can count spawns');
  const {root, branch} = repo(t, {history: true});
  branch('side-src', {'src/a.ts': 'export const a = 1;\n'});
  branch('side-hooks', {'hooks/lib.mjs': '// changed\n'});
  const real = gitSpawn.fn; let calls = 0;
  gitSpawn.fn = (...a) => { calls++; return real(...a); };
  t.after(() => { gitSpawn.fn = real; });
  const judge = command => { calls = 0; const v = evalCommitQuality({tool_name: 'Bash', tool_input: {command}, cwd: root, eidolon_root: root, session_id: 's1'}); return {v, calls}; };
  for (const c of ['git switch side-src', 'git checkout side-src', 'git merge side-src']) {
    const {v, calls: n} = judge(c);
    assert.equal(v, null, c + ' is silent'); assert.equal(n, 2, `${c}: expected 2 git spawns, got ${n}`);
  }
  const hooks = judge('git switch side-hooks');
  assert.equal(hooks.v?.kind, 'ask', 'a switch that changes a hook asks'); assert.equal(hooks.calls, 2, 'and still spends 2 spawns');
  assert.equal(judge('git switch nope').v?.kind, 'ask', 'a ref that does not resolve asks');
  assert.equal(judge('git cherry-pick side-src').calls, 2, 'cherry-pick resolves the commit and its parent in the same spawn');
});

test('T6 the user git config files are protected outside shapes, for a Write and a shell redirect', t => {
  const {root} = repo(t);
  const {dir} = home(t, {});
  const slashed = dir.replace(/\\/g, '/');
  each([join(dir, '.gitconfig'), join(dir, '.config', 'git', 'config')], p => asked(wr(root, p, '[alias]\n'), 'RUNTIME INTEGRITY GUARD', 'controller Write ' + p));
  each([`echo "[alias]" >> "${slashed}/.gitconfig"`, `echo "[alias]" >> "${slashed}/.config/git/config"`, 'echo "[alias]" >> ~/.gitconfig', `printf x > "${slashed}/docs/decisions/x.md"`],
    c => asked(sh(root, c), 'RUNTIME INTEGRITY GUARD', c));
  each([join(dir, 'notes', 'gitconfig.txt'), join(dir, '.config', 'other', 'config')], p => silent(wr(root, p, 'x'), 'controller Write ' + p));
  each([`echo x >> "${slashed}/notes.txt"`, 'cat ~/.gitconfig', `cp "${slashed}/.gitconfig" src/backup`], c => silent(sh(root, c), c));
});

test('T7 shell-operation.mjs holds no raw invisible characters, and a script with a byte order mark is still read', t => {
  const source = readFileSync(join(HOOKS, 'shell-operation.mjs'), 'utf8');
  assert.ok(!/[\uFFFD\uFEFF\u200B-\u200F\u2028\u2029]/.test(source), 'no raw U+FFFD, U+FEFF or other invisible character in shell-operation.mjs');
  const {root, put} = repo(t);
  put('bom.js', "\uFEFFrequire('fs').rmSync('docs/decisions', {recursive: true});\n");
  blocked(sh(root, 'node bom.js'), 'DELETION GUARD', 'a script with a byte order mark');
});

test('T8 the ordinary controller commands stay silent in a project whose package.json runs real scripts', t => {
  const {root, put} = repo(t);
  put('package.json', JSON.stringify({scripts: {test: 'node --test', build: 'node scripts/build.js', docs: 'node scripts/docs.js', lint: 'node scripts/lint.js'}}));
  put('scripts/build.js', "const fs = require('fs'), path = require('path');\nfs.mkdirSync('dist', {recursive: true});\nfor (const f of fs.readdirSync('src')) fs.writeFileSync(path.join('dist', f.replace(/\\.ts$/, '.js')), fs.readFileSync(path.join('src', f), 'utf8'));\n");
  put('scripts/docs.js', "const fs = require('fs'), path = require('path');\nconst out = path.join(__dirname, '..', 'docs', 'api.md');\nfs.writeFileSync(out, '# API\\n');\nfs.writeFileSync(path.join('docs', 'index.md'), '# Index\\n');\n");
  put('scripts/lint.js', "const fs = require('fs');\nlet bad = 0;\nfor (const f of fs.readdirSync('src')) if (/\\t/.test(fs.readFileSync('src/' + f, 'utf8'))) bad++;\nprocess.exit(bad ? 1 : 0);\n");
  put('scripts/selfcheck.mjs', "import {readFileSync, existsSync} from 'node:fs';\nfor (const f of ['hooks/lib.mjs', 'docs/decisions/x.md', '.claude/settings.json']) console.log(existsSync(f) ? 'PASS ' + f : 'FAIL ' + f);\nJSON.parse(readFileSync('.claude/settings.json', 'utf8'));\n");
  put('hooks/hooks.test.mjs', "import test from 'node:test';\ntest('x', () => {});\n");
  put('run.sh', 'set -e\nnpm test\nnode --test hooks/hooks.test.mjs\n');
  mkdirSync(join(root, 'dist'), {recursive: true});
  each(['npm test', 'npm run build', 'npm run lint', 'npm run docs', 'node scripts/selfcheck.mjs', 'node --test hooks/hooks.test.mjs', 'python -c "print(1)"', 'node -e "console.log(1)"', 'sh run.sh',
    'git status', 'git log --oneline -5', 'git diff', 'git add -A && git commit -m "feat: x"', 'git checkout -b feature/x', 'ls -la', 'cat package.json', 'cp -r src backup', 'tar -czf dist.tgz dist'],
  c => silent(sh(root, c), c));
});
