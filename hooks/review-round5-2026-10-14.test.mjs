// Tests for fix round 5 of the hook review (items 1 to 15 of the Known gaps list that code can close). Same rules as the earlier
// review files: every case drives the wired entry point in a throwaway git repo, hook JSON on stdin, nothing is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync, execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';

const HOOKS = dirname(fileURLToPath(import.meta.url));
const WORKER = {agent_id: 'w1', agent_type: 'builder'};
const SUBAGENT = root => ({transcript_path: join(root, 'x', 'subagents', 'a.jsonl')});

function repo(t, {scopes = {builder: {read: ['**'], write: ['src/**']}}, history = false} = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'eidolon-r5-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  execFileSync('git', ['init', '-q', '-b', 'main'], {cwd: root});
  const put = (path, text) => { const file = join(root, path); mkdirSync(dirname(file), {recursive: true}); writeFileSync(file, text); };
  put('docs/decisions/x.md', 'original\n');
  put('docs/fixes/FIX-1.md', 'original\n');
  put('docs/insights/i.md', 'original\n');
  put('docs/a.md', 'plain\n');
  put('DECISIONS.md', 'original\n');
  put('hooks/guard-bash.mjs', '// fixture\n');
  put('hooks/lib.mjs', '// fixture\n');
  put('src/a.ts', 'export {};\n');
  put('evil.json', '{"disableAllHooks":true}\n');
  put('.claude/settings.json', '{}\n');
  if (scopes) put('.claude/agent-scopes.json', JSON.stringify(scopes));
  put('.claude/waves/2026-10-14-test.md', '# wave plan\n\nSteps: build, verify, close the work item.\n');
  const g = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  if (history) {
    g('add', '-A'); g('commit', '-q', '-m', 'base');
    g('update-ref', 'refs/remotes/origin/main', 'HEAD'); g('config', 'remote.origin.url', 'https://example.invalid/x.git');
    g('config', 'branch.main.remote', 'origin'); g('config', 'branch.main.merge', 'refs/heads/main');
  }
  // A branch made off main that changes `files`; the checkout returns to main.
  const branch = (name, files) => {
    g('checkout', '-q', '-b', name, 'main');
    for (const [path, text] of Object.entries(files)) put(path, text);
    g('add', '-A'); g('commit', '-q', '-m', name); g('checkout', '-q', 'main');
  };
  return {root, put, g, branch};
}
const run = (root, script, event, args = ['--project', root], env = process.env) => spawnSync(process.execPath, [join(HOOKS, script), ...args], {
  cwd: event.cwd ?? root, encoding: 'utf8', timeout: 20000, env, input: JSON.stringify({cwd: root, session_id: 's1', ...event}),
});
const sh = (root, command, extra = {}, tool = 'Bash', env = process.env) => run(root, 'guard-bash.mjs', {tool_name: tool, tool_input: {command}, ...extra}, undefined, env);
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

test('S1 a node script that mutates a record, an authority path or a hook, or runs git with a bypass flag, is judged by its contents', t => {
  const {root, put} = repo(t);
  put('clean.js', "const fs = require('fs');\nfs.rmSync('docs/decisions', {recursive: true});\n");
  put('rec.js', "require('fs').writeFileSync('DECISIONS.md', '');\n");
  put('parent.js', "const {rmSync} = require('node:fs');\nrmSync('docs', {recursive: true, force: true});\n");
  put('async.js', "const fs = require('fs');\nfs.promises.rm('docs/fixes', {recursive: true});\n");
  put('joined.js', "const {join} = require('path'), {unlinkSync} = require('fs');\nunlinkSync(join('docs', 'insights', 'i.md'));\n");
  put('auth.js', "require('fs').writeFileSync('.claude/settings.json', '{}');\n");
  put('git.js', "require('fs').appendFileSync('.git/config', 'x');\n");
  put('hook.js', "require('fs').writeFileSync('hooks/lib.mjs', 'x');\n");
  put('commit.js', "require('child_process').execSync('git commit --no-verify -m x');\n");
  put('push.js', "const {spawnSync} = require('child_process');\nspawnSync('git', ['push', '--force', 'origin', 'main']);\n");
  each(['clean.js', 'rec.js', 'parent.js', 'async.js', 'joined.js'], f => blocked(sh(root, 'node ' + f), 'DELETION GUARD', 'node ' + f));
  each(['auth.js', 'git.js'], f => blocked(sh(root, 'node ' + f), 'RUNTIME INTEGRITY GUARD', 'node ' + f));
  each(['commit.js', 'push.js'], f => blocked(sh(root, 'node ' + f), 'COMMIT QUALITY GUARD', 'node ' + f));
  asked(sh(root, 'node hook.js'), 'HOOK INTEGRITY GUARD', 'controller: a script that writes a hook asks');
  blocked(sh(root, 'node hook.js', SUBAGENT(root)), 'HOOK INTEGRITY GUARD', 'worker: a script that writes a hook blocks');
  blocked(sh(root, 'node clean.js', WORKER), 'WRITE LANE GUARD', 'worker: a script that deletes a record');
});

test('S2 a shell script is parsed line by line with cd tracked; sh, bash, a bare path and a shebang file all run it', t => {
  const {root, put} = repo(t);
  put('run.sh', 'echo start\nrm -rf docs/decisions\n');
  put('cd.sh', 'cd docs\nrm decisions/x.md\n');
  put('git.sh', 'git add -A\ngit commit --no-verify -m x\n');
  put('hook.sh', 'rm -rf hooks\n');
  put('tool', '#!/bin/sh\nrm -rf docs/fixes\n');
  put('auth.sh', 'echo {} > .claude/settings.json\n');
  each(['sh run.sh', 'bash run.sh', './run.sh', 'sh cd.sh', 'bash -x cd.sh', './tool', 'source run.sh', '. ./run.sh'], c => blocked(sh(root, c), 'DELETION GUARD', c));
  blocked(sh(root, 'sh git.sh'), 'COMMIT QUALITY GUARD', 'sh git.sh');
  blocked(sh(root, 'sh hook.sh'), 'HOOK INTEGRITY GUARD', 'sh hook.sh');
  blocked(sh(root, 'sh auth.sh'), 'RUNTIME INTEGRITY GUARD', 'sh auth.sh');
  blocked(sh(root, 'bash -c "sh run.sh"'), 'DELETION GUARD', 'a script run from a -c body');
});

test('S3 python and PowerShell scripts get a lexical scan for mutation calls and protected names', t => {
  const {root, put} = repo(t);
  put('a.py', "import shutil\nshutil.rmtree('docs/decisions')\n");
  put('b.py', "import os\nos.remove('DECISIONS.md')\n");
  put('c.py', "from pathlib import Path\nPath('docs/fixes/FIX-1.md').unlink()\n");
  put('d.py', "import subprocess\nsubprocess.run(['git', 'commit', '--no-verify', '-m', 'x'])\n");
  put('e.py', "open('hooks/lib.mjs', 'w').write('x')\n");
  put('f.py', "open('.claude/settings.json', 'w').write('{}')\n");
  put('a.ps1', "Remove-Item -Recurse docs\\decisions\n");
  put('b.ps1', "Set-Content -Path DECISIONS.md -Value ''\n");
  put('c.ps1', "[IO.File]::Delete('docs/insights/i.md')\n");
  put('d.ps1', "git commit --no-verify -m x\n");
  put('e.ps1', "Set-Content .claude/settings.json '{}'\n");
  each(['python a.py', 'python3 b.py', 'py c.py'], c => blocked(sh(root, c), 'DELETION GUARD', c));
  blocked(sh(root, 'python d.py'), 'COMMIT QUALITY GUARD', 'python d.py');
  asked(sh(root, 'python e.py'), 'HOOK INTEGRITY GUARD', 'python e.py');
  blocked(sh(root, 'python f.py'), 'RUNTIME INTEGRITY GUARD', 'python f.py');
  each(['pwsh -File a.ps1', 'powershell -File b.ps1', 'pwsh -NoProfile -File c.ps1', 'pwsh -ExecutionPolicy Bypass -File a.ps1'], c => blocked(sh(root, c), 'DELETION GUARD', c));
  blocked(ps(root, '.\\a.ps1'), 'DELETION GUARD', 'PowerShell .\\a.ps1');
  blocked(sh(root, 'pwsh -File d.ps1'), 'COMMIT QUALITY GUARD', 'pwsh -File d.ps1');
  blocked(sh(root, 'pwsh -File e.ps1'), 'RUNTIME INTEGRITY GUARD', 'pwsh -File e.ps1');
});

test('S4 npm run resolves the package.json script and judges the string as a shell body', t => {
  const {root, put} = repo(t);
  put('package.json', JSON.stringify({scripts: {clean: 'rm -rf docs/decisions', build: 'tsc -p .', test: 'echo ok', hooked: 'rm -rf hooks', prebuild: 'echo pre'}}));
  blocked(sh(root, 'npm run clean'), 'DELETION GUARD', 'npm run clean');
  blocked(sh(root, 'npm run hooked'), 'HOOK INTEGRITY GUARD', 'npm run hooked');
  each(['npm run build', 'npm test', 'npm run missing', 'npm run build -- --watch', 'npm run test'], c => silent(sh(root, c), c));
  silent(sh(root, 'npm run build', WORKER), 'worker npm run build');
});

test('S5 a script that cannot be read is an opaque ask; a script that does not exist, or that writes only under src/, is silent', t => {
  const {root, put} = repo(t);
  put('big.js', 'a'.repeat(600 * 1024));
  writeFileSync(join(root, 'bin.js'), Buffer.from([0x62, 0x00, 0xff, 0x00, 0x01]));
  put('build.js', "require('fs').writeFileSync('src/gen.js', 'x');\n");
  put('run.sh', 'echo x > src/out.txt\nmkdir -p src/new\n');
  asked(sh(root, 'node big.js'), 'RUNTIME INTEGRITY GUARD', 'an oversized script');
  asked(sh(root, 'node bin.js'), 'RUNTIME INTEGRITY GUARD', 'a script with a NUL byte');
  each(['node build.js', 'sh run.sh', 'node nothere.js', 'sh nothere.sh', 'node build.js --flag', 'python -c "print(1)"', `node -e "console.log(require('./package.json').version)"`], c => silent(sh(root, c), c));
  each(['node build.js', 'sh run.sh'], c => silent(sh(root, c, WORKER), 'worker ' + c));
});

test('S6 a worker running a script: literal targets outside its lane block, and a script outside the project root asks', t => {
  const {root, put} = repo(t);
  const other = realpathSync.native(mkdtempSync(join(tmpdir(), 'eidolon-r5-out-')));
  t.after(() => rmSync(other, {recursive: true, force: true}));
  writeFileSync(join(other, 'x.js'), "require('fs').writeFileSync('src/o.txt', 'x');\n");
  put('bad.js', "require('fs').writeFileSync('notes.txt', 'x');\n");
  put('bad.py', "open('notes.txt', 'w').write('x')\n");
  put('bad.sh', 'echo x > notes.txt\n');
  put('bad.ps1', "Set-Content notes.txt x\n");
  put('ok.js', "require('fs').writeFileSync('src/o.txt', 'x');\n");
  each(['node bad.js', 'python bad.py', 'sh bad.sh', 'pwsh -File bad.ps1'], c => blocked(sh(root, c, WORKER), 'WRITE LANE GUARD', 'worker ' + c));
  silent(sh(root, 'node ok.js', WORKER), 'worker node ok.js');
  asked(sh(root, `node "${join(other, 'x.js').replace(/\\/g, '/')}"`, WORKER), 'WRITE LANE GUARD', 'worker: a script outside the project root');
  each(['node bad.js', 'python bad.py', 'sh bad.sh'], c => silent(sh(root, c), 'controller ' + c));
});

test('L1 a worker mutating verb with a glob or variable operand needs a literal prefix inside its lane', t => {
  const {root} = repo(t);
  each(['rm -f *.log', 'rm -rf $DIR/x', 'touch $f', 'rm -f ./x*', 'mv src/a.ts $DEST', 'cp src/a.ts out/*', 'rm -f {a,b}.txt', 'rm -rf "$OUT"/build', 'sed -i s/a/b/ *.ts'],
    c => { const r = sh(root, c, WORKER); blocked(r, 'WRITE LANE GUARD', 'worker ' + c); assert.match(r.stderr, /literal path inside its lane/, 'worker ' + c); });
  blocked(ps(root, 'Remove-Item $path', WORKER), 'WRITE LANE GUARD', 'worker PowerShell Remove-Item $path');
  each(['rm -f src/*.bak', 'rm -rf src/tmp/*', 'rm src/$X', 'touch src/a$N.ts', 'ls $HOME', 'cat src/*.ts', 'grep -r x src/*', 'echo $HOME'], c => silent(sh(root, c, WORKER), 'worker ' + c));
  silent(ps(root, 'Remove-Item src\\*.bak', WORKER), 'worker PowerShell Remove-Item src\\*.bak');
  asked(sh(root, 'rm -rf $DIR/x'), 'RUNTIME INTEGRITY GUARD', 'the controller keeps the opaque ask');
  silent(sh(root, 'rm -f src/*.bak'), 'controller rm -f src/*.bak');
});

test('B1 interpreter inline bodies get the same lexical scan as script files', t => {
  const {root} = repo(t);
  each([`node -e "require('fs').rmSync('docs',{recursive:true})"`, `node --eval "require('fs').unlinkSync('DECISIONS.md')"`, `python -c "import shutil; shutil.rmtree('docs/decisions')"`,
    `python3 -c "import os; os.remove('DECISIONS.md')"`, `ruby -e "File.delete('DECISIONS.md')"`, `perl -e "unlink 'DECISIONS.md'"`, `php -r "unlink('DECISIONS.md');"`,
    `deno eval "Deno.removeSync('docs')"`, `node -e "require('fs').promises.rm('docs/fixes',{recursive:true})"`],
  c => blocked(sh(root, c), 'DELETION GUARD', c));
  each([`node -e "require('fs').writeFileSync('.claude/settings.json','{}')"`, `python -c "open('.claude/settings.json','w').write('{}')"`, `python -c "open('.eidolon/policy-manifest.json','w')"`],
    c => blocked(sh(root, c), 'RUNTIME INTEGRITY GUARD', c));
  each([`node -e "require('child_process').execSync('git commit -n -m x')"`, `node --eval="require('child_process').execSync('git commit -n')"`, `python -c "import subprocess; subprocess.run(['git','push','--force'])"`],
    c => blocked(sh(root, c), 'COMMIT QUALITY GUARD', c));
  blocked(ps(root, `pwsh -Command "[IO.File]::Delete('docs/insights/i.md')"`), 'DELETION GUARD', 'pwsh -Command [IO.File]::Delete');
  asked(sh(root, `node -e "require('fs').writeFileSync('hooks/lib.mjs','x')"`), 'HOOK INTEGRITY GUARD|RUNTIME INTEGRITY GUARD', 'controller: an inline body that writes a hook asks');
  each([`python -c "print(1)"`, `node -e "console.log(require('./package.json').version)"`, `node -e "require('fs').writeFileSync('out.txt','x')"`, `node -p "1+1"`,
    `python -c "open('src/o.txt','w').write('x')"`], c => silent(sh(root, c), c));
});

test('B2 a worker inline body: literal targets outside the lane block; a mutation with no path literal says to use the Write tool', t => {
  const {root} = repo(t);
  each([`node -e "require('fs').writeFileSync('notes.txt','x')"`, `python -c "import os; os.remove('../y.md')"`, `node -e "require('fs').rmSync('docs/a.md')"`],
    c => blocked(sh(root, c, WORKER), 'WRITE LANE GUARD', 'worker ' + c));
  each([`node -e "require('fs').writeFileSync(process.argv[1],'x')" src/y.md`, `node -e "const f=process.env.F; require('fs').rmSync(f)"`, `python -c "import os,sys; os.remove(sys.argv[1])" src/y.md`, `perl -e "unlink shift" src/y.md`],
    c => { const r = sh(root, c, WORKER); blocked(r, 'WRITE LANE GUARD', 'worker ' + c); assert.match(r.stderr, /Write tool/, 'worker ' + c); });
  each([`node -e "require('fs').writeFileSync('src/o.txt','x')"`, `python -c "open('src/o.txt','w').write('x')"`, `node -e "console.log(1)"`, `python -c "print(1)"`, `node -p "process.cwd()"`],
    c => silent(sh(root, c, WORKER), 'worker ' + c));
});

function aliasHome(t, text) {
  const home = realpathSync.native(mkdtempSync(join(tmpdir(), 'eidolon-r5-home-')));
  t.after(() => rmSync(home, {recursive: true, force: true}));
  writeFileSync(join(home, '.gitconfig'), text);
  return {...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, '.config')};
}

test('A1 git aliases are resolved through .git/config and the global config files', t => {
  const {root, g} = repo(t);
  g('config', 'alias.ci', 'commit --no-verify');
  g('config', 'alias.pf', 'push --force origin');
  g('config', 'alias.wipe', 'rm -r docs/decisions');
  g('config', 'alias.lg', 'log --oneline');
  g('config', 'alias.st2', '!echo hi');
  g('config', 'alias.commit', 'commit --no-verify');
  blocked(sh(root, 'git ci -m x'), 'COMMIT QUALITY GUARD', 'git ci');
  blocked(sh(root, 'git pf'), 'COMMIT QUALITY GUARD', 'git pf');
  blocked(sh(root, 'git wipe'), 'DELETION GUARD', 'git wipe');
  const shell = sh(root, 'git st2');
  asked(shell, 'RUNTIME INTEGRITY GUARD', 'a shell alias is an opaque ask');
  assert.match(JSON.parse(shell.stdout).hookSpecificOutput.permissionDecisionReason, /st2/, 'the ask names the alias');
  each(['git lg', 'git lg -5', 'git commit -m x'], c => silent(sh(root, c), c));
  const env = aliasHome(t, '[alias]\n\tnv = commit -n\n\tforce = "push --force"\n\tsh = !sh -c "echo x"\n');
  blocked(sh(root, 'git nv -m x', {}, 'Bash', env), 'COMMIT QUALITY GUARD', 'global alias nv');
  blocked(sh(root, 'git force origin main', {}, 'Bash', env), 'COMMIT QUALITY GUARD', 'global alias force');
  asked(sh(root, 'git sh', {}, 'Bash', env), 'RUNTIME INTEGRITY GUARD', 'global shell alias');
  silent(sh(root, 'git lg', {}, 'Bash', env), 'a repo alias is still read when a global config exists');
  blocked(sh(root, `git -c "alias.zz=commit -n" zz -m x`), 'COMMIT QUALITY GUARD', 'git -c alias');
  blocked(sh(root, `git -c 'alias.zz=!git commit -n' zz`), 'COMMIT QUALITY GUARD', 'git -c shell alias');
});

test('U1 a subshell, a brace group, a substitution and a heredoc body are judged with their own working directory', t => {
  const {root} = repo(t);
  each(['( cd docs && rm decisions/x.md )', '{ cd docs; rm decisions/x.md; }', 'cd docs && ( rm decisions/x.md )', 'echo $(cd docs && rm decisions/x.md)', 'echo `cd docs && rm decisions/x.md`',
    "bash <<'EOF'\ncd docs\nrm decisions/x.md\nEOF", "sh <<EOF\nrm -rf docs\nEOF", "bash -s <<'EOF'\ncd docs\nrm -f decisions/x.md\nEOF", '(cd docs && (rm decisions/x.md))'],
  c => blocked(sh(root, c), 'DELETION GUARD', c));
  each(['(cd docs); rm decisions/x.md', '(cd docs) && rm decisions/x.md', 'x=$(cd docs && pwd); rm decisions/x.md', '(cd src && ls); rm decisions/x.md', '(cd docs; ls); rm -rf decisions', 'echo `cd docs`; rm decisions/x.md',
    "bash <<'EOF'\ncd src\nls\nEOF"], c => silent(sh(root, c), c));
  blocked(sh(root, '(cd docs); rm decisions/x.md; rm docs/decisions/x.md'), 'DELETION GUARD', 'the cd stays inside, the later literal path still blocks');
});

const enc = text => Buffer.from(text, 'utf16le').toString('base64');

test('E1 a PowerShell -EncodedCommand body is decoded and judged as an inline body; one that cannot be decoded asks', t => {
  const {root} = repo(t);
  for (const flag of ['-EncodedCommand', '-enc', '-ec', '-e', '-NoProfile -EncodedCommand'])
    blocked(sh(root, `pwsh ${flag} ${enc('Remove-Item -Recurse docs')}`), 'DELETION GUARD', `pwsh ${flag}`);
  blocked(sh(root, `powershell -enc ${enc('Set-Content DECISIONS.md x')}`), 'DELETION GUARD', 'powershell -enc');
  blocked(ps(root, `powershell -NoProfile -ec ${enc('git commit -n -m x')}`), 'COMMIT QUALITY GUARD', 'PowerShell -ec git');
  blocked(sh(root, `pwsh -enc ${enc("Set-Content .claude/settings.json '{}'")}`), 'RUNTIME INTEGRITY GUARD', 'authority');
  asked(sh(root, `pwsh -enc ${enc('Set-Content hooks/lib.mjs x')}`), 'HOOK INTEGRITY GUARD|RUNTIME INTEGRITY GUARD', 'hook');
  each(['pwsh -enc AAAA', 'pwsh -EncodedCommand not-base64!', 'powershell -ec Zm9v'], c => asked(sh(root, c), 'RUNTIME INTEGRITY GUARD', c));
  silent(sh(root, `pwsh -enc ${enc('Get-Date')}`), 'a decoded harmless body');
});

test('W1 a controller whole-tree git command asks when protected files would change, and is silent otherwise', t => {
  const {root, put, g, branch} = repo(t, {history: true});
  branch('side-hooks', {'hooks/lib.mjs': '// changed\n'});
  branch('side-record', {'docs/decisions/x.md': 'rewritten\n'});
  branch('side-settings', {'.claude/settings.json': '{"x":1}\n'});
  branch('side-new-record', {'docs/decisions/new.md': 'added\n'});
  branch('side-src', {'src/a.ts': 'export const a = 1;\n'});
  for (const c of ['git checkout side-hooks', 'git switch side-hooks', 'git merge side-hooks', 'git merge --no-ff side-hooks', 'git rebase side-hooks', 'git cherry-pick side-hooks'])
    { const r = sh(root, c); asked(r, 'COMMIT QUALITY GUARD', c); assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, /hooks\/lib\.mjs/, c + ' lists the file'); }
  each(['git checkout side-record', 'git merge side-record', 'git checkout side-settings', 'git switch side-settings'], c => asked(sh(root, c), 'COMMIT QUALITY GUARD', c));
  each(['git checkout side-src', 'git switch side-src', 'git merge side-src', 'git rebase side-src', 'git cherry-pick side-src', 'git checkout side-new-record', 'git merge side-new-record', 'git checkout main',
    'git checkout -b feature/x', 'git switch -c feature/y', 'git merge --abort', 'git rebase --continue', 'git cherry-pick --abort', 'git checkout -- src/a.ts', 'git merge -m "msg" side-src', 'git pull --rebase'],
  c => silent(sh(root, c), c));
  each(['git checkout nope', 'git switch nope', 'git merge nope', 'git rebase nope', 'git cherry-pick nope'], c => asked(sh(root, c), 'COMMIT QUALITY GUARD', c + ' (no such ref)'));
  g('update-ref', 'refs/remotes/origin/main', 'side-src');
  silent(sh(root, 'git pull'), 'git pull, upstream differs outside protected paths');
  silent(sh(root, 'git stash && git pull && git stash pop'), 'git stash && git pull && git stash pop');
  g('update-ref', 'refs/remotes/origin/main', 'side-hooks');
  asked(sh(root, 'git pull'), 'COMMIT QUALITY GUARD', 'git pull, upstream changes a hook');
  asked(sh(root, 'git pull --rebase'), 'COMMIT QUALITY GUARD', 'git pull --rebase, upstream changes a hook');
  g('config', '--unset', 'branch.main.merge');
  asked(sh(root, 'git pull'), 'COMMIT QUALITY GUARD', 'git pull with no upstream');
  blocked(sh(root, 'git checkout side-src', WORKER), 'WRITE LANE GUARD', 'a worker keeps the existing block');
  blocked(sh(root, 'git merge side-src', WORKER), 'WRITE LANE GUARD', 'a worker keeps the existing block');
  put('x', '');
});

test('W2 a repository with no commits has no tree to rewrite, so the whole-tree commands stay silent there', t => {
  const {root} = repo(t);
  each(['git checkout main', 'git switch main', 'git merge origin/main', 'git pull', 'git rebase main', 'git checkout nope'], c => silent(sh(root, c), c));
});

test('K1 a hard link to a directory at or above a protected path, and ln with a glob, are judged as links to the descendants', t => {
  const {root, put} = repo(t);
  put('src/b.ts', 'x\n');
  each(['cp -al docs out', 'cp -al docs/ out/', 'cp -l -r docs out', 'cp -rl docs out', 'rsync -a --link-dest=docs src/ out/', 'rsync -a --link-dest=../docs src/ out/', 'ln docs/* src/', 'ln docs/decisions/* src/', 'ln DECISIONS.md src/d.md', 'ln docs/fixes/FIX-1.md src/f.md'],
    c => blocked(sh(root, c), 'DELETION GUARD', c));
  each(['cp -al . out', 'cp -al .git out', 'cp -al .claude out'], c => blocked(sh(root, c), 'RUNTIME INTEGRITY GUARD', c));
  asked(sh(root, 'cp -al hooks out'), 'HOOK INTEGRITY GUARD', 'controller cp -al hooks');
  asked(sh(root, 'ln hooks/* src/'), 'HOOK INTEGRITY GUARD', 'controller ln hooks/*');
  blocked(sh(root, 'cp -al hooks out', SUBAGENT(root)), 'HOOK INTEGRITY GUARD', 'worker cp -al hooks');
  blocked(sh(root, 'cp -al docs out', WORKER), 'WRITE LANE GUARD', 'worker cp -al docs');
  each(['ln src/a.ts src/c.ts', 'ln src/* out/', 'cp -al src out', 'cp -l src/a.ts src/d.ts', 'ln -s ../docs src/link', 'cp -r docs out', 'rsync -a --link-dest=src src/ out/'], c => silent(sh(root, c), c));
  const {root: r2, put: put2} = repo(t);
  put2('mk.js', "require('fs').linkSync('docs/decisions/x.md', 'src/l.md');\n");
  put2('mk.sh', 'ln docs/decisions/x.md src/l.md\n');
  blocked(sh(r2, 'node mk.js'), 'DELETION GUARD', 'a script that makes a hard link');
  blocked(sh(r2, 'sh mk.sh'), 'DELETION GUARD', 'a shell script that makes a hard link');
});

test('G1 GIT_DIR, hooks-path config variables and config-file swaps in a bash prefix, export or declare -x block when git runs in the same command', t => {
  const {root} = repo(t);
  each(['GIT_DIR=../evil/.git git commit -m x', 'export GIT_DIR=/tmp/evil/.git; git commit -m x', 'declare -x GIT_DIR=/tmp/evil/.git; git status', 'env GIT_DIR=../evil/.git git log',
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/x git commit -m x', 'export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/x; git commit -m x',
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=user.name GIT_CONFIG_VALUE_0=/hooks/x.hookspath git commit -m x', 'GIT_CONFIG_GLOBAL=evil.cfg git commit -m x', 'GIT_CONFIG_SYSTEM=evil.cfg git status',
    'export GIT_CONFIG_GLOBAL=/tmp/evil.cfg && git commit -m x', 'typeset -x GIT_DIR=/tmp/x; git commit -m x'],
  c => blocked(sh(root, c), 'COMMIT QUALITY GUARD', c));
  each(['GIT_DIR=.git git status', `GIT_DIR=${join(root, '.git').replace(/\\/g, '/')} git status`, 'GIT_AUTHOR_NAME=x git commit -m y', 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=user.name GIT_CONFIG_VALUE_0=x git commit -m y',
    'GIT_DIR=../evil/.git echo hi', 'export GIT_DIR=/tmp/evil/.git', 'declare GIT_DIR=/tmp/evil/.git; git status', 'git commit -m "docs: GIT_DIR=x is blocked"'],
  c => silent(sh(root, c), c));
});

test('P1 PowerShell call-operator targets held in a variable are resolved from literal assignments; an unresolved one asks', t => {
  const {root} = repo(t);
  blocked(ps(root, `$c = 'git'; & $c commit --no-verify -m x`), 'COMMIT QUALITY GUARD', '& $c with a git literal');
  blocked(ps(root, `$c = "Remove-Item"; & $c -Recurse docs`), 'DELETION GUARD', '& $c with a cmdlet literal');
  blocked(ps(root, `$p = 'Remove-Item -Recurse docs'; Invoke-Expression $p`), 'DELETION GUARD', 'Invoke-Expression $p');
  blocked(ps(root, `$p = 'Remove-Item -Recurse docs'; iex $p`), 'DELETION GUARD', 'iex $p');
  blocked(ps(root, `$g = 'git'; . $g push --force origin main`), 'COMMIT QUALITY GUARD', '. $g');
  asked(ps(root, `$sh = 'bash'; Start-Process $sh -ArgumentList '-c','true'`), 'RUNTIME INTEGRITY GUARD', 'Start-Process $sh resolves to a shell');
  each(['& $x commit', '. $x', 'Start-Process $x', '& $env:ComSpec /c dir'], c => asked(ps(root, c), 'RUNTIME INTEGRITY GUARD', 'unresolved: ' + c));
  each([`$c = 'npm'; & $c test`, `$files = Get-ChildItem; $files | ForEach-Object { $_ }`, '$x = 5', `$n = 'node'; & $n --version`], c => silent(ps(root, c), c));
});

// A ustar archive and a stored zip with the given entry names, written by hand so an entry can climb out of its destination.
function tarEntry(name, body = 'x') {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8'); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write(body.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136); header.write('        ', 148); header.write('0', 156);
  header.write('ustar\0', 257); header.write('00', 263);
  let sum = 0; for (const b of header) sum += b;
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  const data = Buffer.from(body);
  return Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512)]);
}
const tarball = names => Buffer.concat([...names.map(n => tarEntry(n)), Buffer.alloc(1024)]);
function zipBytes(names) {
  const locals = [], centrals = []; let offset = 0;
  for (const name of names) {
    const n = Buffer.from(name), data = Buffer.from('x'), local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(10, 4); local.writeUInt32LE(1, 18); local.writeUInt32LE(1, 22); local.writeUInt16LE(n.length, 26);
    const entry = Buffer.concat([local, n, data]), central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(10, 6); central.writeUInt32LE(1, 20); central.writeUInt32LE(1, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(entry); centrals.push(Buffer.concat([central, n])); offset += entry.length;
  }
  const cd = Buffer.concat(centrals), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(names.length, 8); eocd.writeUInt16LE(names.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

test('X1 an archive is listed before it is extracted: absolute, climbing and protected entries block; a listing failure asks', t => {
  const {root} = repo(t);
  const w = (name, bytes) => writeFileSync(join(root, name), bytes);
  w('safe.tar', tarball(['a.txt', 'dir/b.txt'])); w('safe.tgz', gzipSync(tarball(['dist/a.js', 'dist/b.js']))); w('safe.zip', zipBytes(['a.txt', 'dir/b.txt']));
  w('climb.tar', tarball(['ok.txt', '../escape.txt'])); w('climb.tgz', gzipSync(tarball(['../escape.txt']))); w('climb.zip', zipBytes(['ok.txt', '../escape.txt']));
  w('abs.tar', tarball(['/tmp/abs.txt'])); w('abs.zip', zipBytes(['/tmp/abs.txt']));
  w('rec.tar', tarball(['decisions/x.md'])); w('rec.zip', zipBytes(['decisions/x.md']));
  w('hook.tar', tarball(['lib.mjs'])); w('deep.zip', zipBytes(['docs/decisions/x.md']));
  w('bad.zip', Buffer.from('this is not a zip archive at all, only text padding'.repeat(4))); w('bad.tar', Buffer.from('not a tar archive'.repeat(80))); w('a.7z', Buffer.from('7z\xbc\xaf\x27\x1c')); w('a.cpio', Buffer.from('070701'));
  mkdirSync(join(root, 'build'), {recursive: true});
  each(['tar -xf climb.tar -C build', 'tar -xzf climb.tgz -C build', 'unzip climb.zip -d build', 'tar -xf abs.tar -C build', 'unzip abs.zip -d build', 'tar -xf rec.tar -C docs', 'unzip rec.zip -d docs', 'unzip deep.zip -d build/../',
    'bsdtar -xf climb.tar -C build', 'tar xf climb.tar -C build'],
  c => blocked(sh(root, c), 'RUNTIME INTEGRITY GUARD', c));
  blocked(ps(root, 'Expand-Archive -Path climb.zip -DestinationPath build'), 'RUNTIME INTEGRITY GUARD', 'Expand-Archive climbing');
  blocked(ps(root, 'Expand-Archive -Path rec.zip -DestinationPath docs'), 'RUNTIME INTEGRITY GUARD', 'Expand-Archive into docs');
  each(['unzip bad.zip -d build', 'tar -xf bad.tar -C build', '7z x a.7z -obuild', 'cpio -idv -F a.cpio -D build', 'cpio -id -D build < a.cpio'], c => asked(sh(root, c), 'RUNTIME INTEGRITY GUARD', c));
  asked(ps(root, 'Expand-Archive -Path bad.zip -DestinationPath build'), 'RUNTIME INTEGRITY GUARD', 'Expand-Archive of a bad zip');
  each(['tar -xzf safe.tgz -C build', 'tar -xf safe.tar -C build', 'unzip safe.zip -d build', 'tar -xzf nothere.tgz -C build', 'tar -tf climb.tar', 'unzip -l climb.zip', 'tar -czf out.tgz src'], c => silent(sh(root, c), c));
  silent(ps(root, 'Expand-Archive -Path safe.zip -DestinationPath build'), 'Expand-Archive of a safe zip');
  blocked(sh(root, 'tar -xf climb.tar -C build', WORKER), 'RUNTIME INTEGRITY GUARD|WRITE LANE GUARD', 'worker');
});

const scratchName = root => 'eidolon-scratch-' + createHash('sha256').update(root).digest('hex').slice(0, 12);

test('Z1 every project gives a worker two scratch roots, even when the project sits inside the temp directory', t => {
  const {root} = repo(t);
  const tmpScratch = join(tmpdir(), scratchName(root));
  t.after(() => rmSync(tmpScratch, {recursive: true, force: true}));
  silent(sh(root, 'echo x > .eidolon/scratch/o.txt', WORKER), 'worker redirect into .eidolon/scratch');
  silent(sh(root, 'mkdir -p .eidolon/scratch/d && touch .eidolon/scratch/d/f', WORKER), 'worker mkdir and touch in .eidolon/scratch');
  silent(wr(root, '.eidolon/scratch/w.txt', 'x', WORKER), 'worker Write into .eidolon/scratch');
  silent(wr(root, join(root, '.eidolon', 'scratch', 'w2.txt'), 'x', WORKER), 'worker Write, absolute path, into .eidolon/scratch');
  silent(sh(root, `echo x > "${join(tmpScratch, 'o.txt').replace(/\\/g, '/')}"`, WORKER), 'worker redirect into the temp scratch root');
  silent(wr(root, join(tmpScratch, 'w.txt'), 'x', WORKER), 'worker Write into the temp scratch root');
  each([`echo x > "${join(tmpdir(), 'eidolon-scratch-other', 'o.txt').replace(/\\/g, '/')}"`, 'echo x > .eidolon/sessions/x', 'echo x > .eidolon/scratch/../sessions/x', 'echo x > .eidolon/policy-manifest.json', 'echo x > .eidolon/other.txt'],
    c => blocked(sh(root, c, WORKER), 'WRITE LANE GUARD|RUNTIME INTEGRITY GUARD', 'worker ' + c));
  blocked(wr(root, join(tmpdir(), 'eidolon-scratch-other', 'w.txt'), 'x', WORKER), 'WRITE LANE GUARD', 'worker Write into another scratch directory');
  const start = run(root, 'subagent-start.mjs', {hook_event_name: 'SubagentStart', ...WORKER});
  assert.equal(start.status, 0, start.stderr);
  const context = JSON.parse(start.stdout).hookSpecificOutput.additionalContext;
  assert.ok(context.includes('.eidolon/scratch'), 'the lane line names the in-project scratch root');
  assert.ok(context.replace(/\\/g, '/').includes(join(tmpdir(), scratchName(root)).replace(/\\/g, '/')), 'the lane line names the temp scratch root');
});

test('O1 a controller Write or Edit outside the project root asks when the path has a protected shape', t => {
  const {root} = repo(t);
  const other = realpathSync.native(mkdtempSync(join(tmpdir(), 'eidolon-r5-other-')));
  t.after(() => rmSync(other, {recursive: true, force: true}));
  mkdirSync(join(other, 'hooks'), {recursive: true}); writeFileSync(join(other, 'hooks', 'guard-bash.mjs'), '// x\n');
  each(['docs/decisions/x.md', 'docs/fixes/FIX-9.md', 'docs/insights/i.md', 'DECISIONS.md', 'hooks/new.mjs', '.claude/settings.json', '.claude/settings.local.json', '.git/config', '.eidolon/policy-manifest.json'],
    p => asked(wr(root, join(other, p), '{}'), 'RUNTIME INTEGRITY GUARD', 'controller Write ' + p));
  each(['notes/plan.md', 'src/hooks/useAuth.ts', 'docs/a.md', 'README.md', '.github/x.yml'], p => silent(wr(root, join(other, p), '{}'), 'controller Write ' + p));
  blocked(wr(root, join(other, 'docs/decisions/x.md'), 'x', WORKER), 'WRITE LANE GUARD', 'a worker is still blocked outside the root');
  silent(wr(root, 'src/new.ts'), 'a Write inside the project is unchanged');
});

test('D1 the README states what the code does now', () => {
  const readme = readFileSync(join(HOOKS, 'README.md'), 'utf8');
  const gaps = readme.slice(readme.indexOf('## Known gaps'), readme.indexOf('## Tests'));
  assert.ok(!/agent_type:\s+agent_type on a worker's PreToolUse is unverified/.test(gaps), 'the agent_type gap is replaced by the verified fact');
  assert.match(readme, /2026-10-13[^\n]*agent_id and agent_type|agent_id and agent_type[^\n]*2026-10-13/, 'the verified agent_type fact is dated');
  assert.match(gaps, /not an operating-system sandbox[^]*permission rules[^]*sandbox mode/, 'os_sandbox names the pairing');
  assert.match(gaps, /after it starts[^]*lexical scan/, 'os_sandbox says what is seen after a program starts');
  assert.match(gaps, /onFailure/, 'fail_open keeps the host-version facts');
  for (const gone of ['script_files:', 'lane_operands:', 'git_aliases:', 'encoded_commands:', 'cp_link_parents:', 'bash_git_env:', 'ps_call_operator:', 'archive_contents:', 'scratch_in_tmp:', 'controller_outside_root:'])
    assert.ok(!gaps.includes('\n' + gone), `${gone} is closed, so it leaves the gaps list`);
});

const COMMANDS_60 = [
  'npm run build', 'npm test', 'node --test "hooks/*.test.mjs"', 'env VAR=1 npm test', 'make -j4', 'python -m pytest -q', 'cargo build --release', 'npx prettier --write src', 'npm run lint -- --fix',
  'bash scripts/build.sh', 'node scripts/selfcheck.mjs', `node -e "console.log(require('./package.json').version)"`, 'git add -A && git commit -m "fix: handle empty input"', 'git commit -am "chore: bump deps"',
  'git commit -m "docs: update hooks/README.md"', 'git commit -m "feat: add -n flag to cli"', 'git commit -m "$(cat msg.txt)"', 'git commit --amend --no-edit',
  'git add docs/decisions/x.md && git commit -m "decision: adopt X"', 'git push origin feature', 'git pull --rebase', 'git status && git diff', 'git checkout -b feature/x', 'git checkout main',
  'git stash && git pull && git stash pop', 'git rm --cached src/a.ts', 'git restore --staged src/a.ts', 'git checkout -- src/a.ts', 'git reset HEAD~1', 'git log --oneline -5 -- hooks/',
  'git diff HEAD~1 -- hooks/lib.mjs', 'git show HEAD:hooks/lib.mjs | head', 'git fetch origin && git merge origin/main', 'git clean -n', "sed -i 's/foo/bar/' src/a.ts", 'rm -rf node_modules',
  'rm -rf dist build', 'rm -f src/*.bak', 'rm -rf src/tmp/*', 'rm -rf .cache', 'cp -r src build/', 'cp .env.example .env', 'mkdir -p src/new && touch src/new/index.ts',
  `find . -name '*.ts' | xargs grep TODO`, 'grep -rn "hooks/" src', 'cat docs/decisions/x.md', 'echo "- note" >> docs/decisions/x.md', 'echo "$(git rev-parse HEAD)" > src/sha.txt', 'echo $(date) > src/build.txt',
  'for f in src/*.ts; do echo $f; done', 'tar -czf dist.tgz dist', 'docker build -t app .', 'docker run --rm -v "$PWD:/app" app npm test', 'curl -s https://example.com', 'curl -s https://example.com | jq .',
  'git commit -m "fix: rm stale entry from docs/decisions index"', 'git commit -m "docs: explain why rm -rf docs is blocked"', "git commit -F - <<'EOF'\nfix: rm stale entry from docs/decisions\nEOF",
];

test('R5-loop the ordinary controller and worker commands, and the new silent cases, stay silent', t => {
  const {root, put} = repo(t, {history: true});
  put('build.js', "require('fs').writeFileSync('src/gen.js', 'x');\n");
  put('run.sh', 'echo x > src/out.txt\n');
  put('package.json', JSON.stringify({scripts: {build: 'tsc -p .', test: 'node --test'}}));
  writeFileSync(join(root, 'dist.tgz'), gzipSync(tarball(['dist/a.js', 'dist/b.js'])));
  mkdirSync(join(root, 'build'), {recursive: true});
  const powershell = ['Get-ChildItem -Recurse | Select-String TODO', 'Remove-Item -Recurse -Force node_modules'];
  assert.equal(COMMANDS_60.length + powershell.length, 60, 'the list is sixty commands');
  each(COMMANDS_60, c => silent(sh(root, c), c));
  each(powershell, c => silent(ps(root, c), 'PowerShell ' + c));
  each(['node build.js', 'sh run.sh', 'npm test', 'npm run build', 'python -c "print(1)"', `node -e "console.log(require('./package.json').version)"`, 'git checkout main', 'git pull', 'tar -xzf dist.tgz -C build',
    'ln src/a.ts src/b.ts', 'bash -c "npm test"', 'sh -c "ls src"', 'cp .claude/settings.json backup.json', 'cat .claude/settings.json | jq .hooks', 'git clean -n', 'git stash list', 'git checkout -b feature/y', 'git switch main'],
  c => silent(sh(root, c), c));
  each(['npm test', "sed -i 's/a/b/' src/a.ts", "git add src && git commit -m 'feat: x'", 'd=$(mktemp -d)', 'bash -c "npm test"', 'node build.js', 'sh run.sh', 'npm run build', 'python -c "print(1)"', 'ln src/a.ts src/b.ts'],
    c => silent(sh(root, c, WORKER), 'worker ' + c));
});
