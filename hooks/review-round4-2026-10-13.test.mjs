// Tests for fix round 4 of the 2026-10-13 hook review (R1 to R4, Y1 to Y3, A1). Same rules as the earlier review files:
// every case drives the wired entry point in a throwaway git repo, hook JSON on stdin, nothing is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync, execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, linkSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HOOKS = dirname(fileURLToPath(import.meta.url));
const WORKER = {agent_id: 'w1', agent_type: 'builder'};

function repo(t, {scopes = {builder: {read: ['**'], write: ['src/**']}}} = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'eidolon-r4-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  execFileSync('git', ['init', '-q'], {cwd: root});
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
  put('.claude/waves/2026-10-13-test.md', '# wave plan\n\nSteps: build, verify, close the work item.\n');
  return {root, put};
}
const run = (root, script, event, args = ['--project', root], env = process.env) => spawnSync(process.execPath, [join(HOOKS, script), ...args], {
  cwd: event.cwd ?? root, encoding: 'utf8', timeout: 20000, env, input: JSON.stringify({cwd: root, session_id: 's1', ...event}),
});
const sh = (root, command, extra = {}, tool = 'Bash') => run(root, 'guard-bash.mjs', {tool_name: tool, tool_input: {command}, ...extra});
const ps = (root, command, extra = {}) => sh(root, command, extra, 'PowerShell');
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
const gated = (r, what) => assert.ok(r.status === 2 || (r.status === 0 && askedWith(r)),
  `${what}: silent allow (exit ${r.status})\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
const silent = (r, what) => assert.ok(r.status === 0 && r.stdout === '', `${what}: expected silent allow, got exit ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
const each = (list, fn) => list.forEach(fn);
const SUBAGENT = root => ({transcript_path: join(root, 'x', 'subagents', 'a.jsonl')});

test('R1 a shell write, append, truncate or delete through a hard link blocks; reading the link is silent', t => {
  const {root} = repo(t);
  linkSync(join(root, 'docs/decisions/x.md'), join(root, 'src/alias.md'));
  each([': > src/alias.md', 'echo > src/alias.md', 'echo x >> src/alias.md', 'truncate -s0 src/alias.md', 'sed -i d src/alias.md', 'echo x | tee src/alias.md', 'rm src/alias.md'],
    c => blocked(sh(root, c), 'RUNTIME INTEGRITY GUARD', c));
  each(['Set-Content src/alias.md x', 'Clear-Content src/alias.md', 'Add-Content src/alias.md x'], c => blocked(ps(root, c), 'RUNTIME INTEGRITY GUARD', 'PowerShell ' + c));
  each(['cat src/alias.md', 'cp src/alias.md /tmp/x', 'cp src/alias.md src/copy.md', 'grep original src/alias.md', 'echo x > src/plain.txt', 'sed -i d src/a.ts'], c => silent(sh(root, c), c));
  assert.equal(readFileSync(join(root, 'docs/decisions/x.md'), 'utf8'), 'original\n');
});

test('R2 a shell -c body or an eval body is parsed one level, so a protected parent is judged like a top-level command', t => {
  const {root} = repo(t);
  blocked(sh(root, "eval 'rm -rf .'"), 'RUNTIME INTEGRITY GUARD', "eval 'rm -rf .'");
  each(["bash -c 'rm -rf docs'", `c='rm -rf docs'; eval "$c"`, "sh -c 'mv docs docs2'", "bash -lc 'rm -rf docs'", "eval 'rm -rf docs'",
    "zsh -c 'rm -f docs/*'"],
    c => blocked(sh(root, c), 'DELETION GUARD', c));
  blocked(ps(root, 'pwsh -Command "Remove-Item -Recurse docs"'), 'DELETION GUARD', 'pwsh -Command');
  blocked(ps(root, 'iex "Remove-Item -Recurse docs"'), 'DELETION GUARD', 'iex');
  blocked(sh(root, 'cmd /c "rd /s /q docs"'), 'DELETION GUARD', 'cmd /c with a quoted body');
  blocked(ps(root, '& cmd /c "rd /s /q docs"'), 'DELETION GUARD', '& cmd /c with a quoted body');
  silent(sh(root, 'cmd /c "dir src"'), 'cmd /c dir src');
  // a body that names a protected thing, holds a variable, nests another body or cannot be parsed keeps the ask
  each(["sh -c 'rm -rf hooks'", "bash -c 'rm -rf .claude'", 'eval "git commit --no-verify -m x"', "bash -c 'rm -rf hooks $x'", `sh -c 'eval "rm -rf docs"'`, `bash -c 'rm -rf "docs'`, `bash -c 'bash -c "rm -rf docs"'`],
    c => asked(sh(root, c), 'RUNTIME INTEGRITY GUARD', c));
  each(['bash -c "npm test"', 'sh -c "ls src"', "bash -c 'cd src && ls'", 'eval "echo hi"', "bash -c 'rm -rf node_modules'"], c => silent(sh(root, c), c));
  silent(sh(root, 'bash -c "npm test"', WORKER), 'worker bash -c');
  blocked(sh(root, "bash -c 'rm -rf docs'", WORKER), 'WRITE LANE GUARD', 'worker bash -c rm -rf docs');
});

test('R3 find -exec writes reach the roots that hold a protected path; a settings file anywhere gets the settings treatment in the shell', t => {
  const {root} = repo(t);
  const home = realpathSync.native(mkdtempSync(join(tmpdir(), 'eidolon-r4-home-')));
  t.after(() => rmSync(home, {recursive: true, force: true}));
  mkdirSync(join(home, '.claude'));
  writeFileSync(join(home, '.claude', 'settings.json'), '{}');
  const settings = home.replace(/\\/g, '/') + '/.claude/settings.json';
  each([`find docs -type f -exec sh -c ': > "$1"' _ {} ;`, 'find docs -exec cp x {} \\;', 'find docs -exec sed -i s/a/b/ {} +', 'find docs -execdir tee {} \\;'],
    c => blocked(sh(root, c), 'DELETION GUARD', c));
  blocked(sh(root, 'find . -name x -exec sed -i s/a/b/ {} \\;'), 'RUNTIME INTEGRITY GUARD', 'find . -exec sed -i');
  blocked(sh(root, 'find hooks -exec cp x {} \\;', SUBAGENT(root)), 'HOOK INTEGRITY GUARD', 'worker find hooks -exec cp');
  each([`echo '{"disableAllHooks":true}' > ${settings}`, `cp evil.json ${settings}`, `cp evil.json ${settings.replace('settings.json', 'settings.local.json')}`, `echo x | tee ${settings}`],
    c => blocked(sh(root, c), 'RUNTIME INTEGRITY GUARD', c));
  each(['find src -type f -exec sed -i s/a/b/ {} \\;', 'find src -exec chmod +x {} \\;', 'find docs -name x.md -exec cat {} \\;', 'find . -name "*.ts" -exec grep -l TODO {} \\;',
    `cat ${settings}`, `cp ${settings} backup.json`, `grep hooks ${settings}`], c => silent(sh(root, c), c));
});

test('R4 cp -l, cp -al, cp --link and rsync --link-dest make a hard link and are judged like ln', t => {
  const {root} = repo(t);
  each(['cp -l docs/decisions/x.md src/a2.md', 'cp -al docs/decisions/x.md src/a3.md', 'cp --link docs/fixes/FIX-1.md src/a4.md', 'cp -l DECISIONS.md src/d.md',
    'cp -l docs/insights/i.md src/b', 'cp -t src -l docs/decisions/x.md', 'rsync -a --link-dest=docs/decisions docs/decisions/ src/z/', 'rsync -a --link-dest docs/fixes docs/fixes/ src/z/'],
  c => blocked(sh(root, c), 'DELETION GUARD', c));
  asked(sh(root, 'cp -l hooks/lib.mjs src/h.mjs'), 'editing the governance hooks; confirm', 'controller cp -l of a hook');
  blocked(sh(root, 'cp -l hooks/lib.mjs src/h.mjs', SUBAGENT(root)), 'HOOK INTEGRITY GUARD', 'worker cp -l of a hook');
  each(['cp -l .claude/settings.json src/s.json', 'cp -al .git/config src/gc'], c => blocked(sh(root, c), 'RUNTIME INTEGRITY GUARD', c));
  blocked(sh(root, 'cp -l docs/decisions/x.md src/a.md', WORKER), 'WRITE LANE GUARD', 'worker cp -l of a record');
  each(['cp src/a.ts src/b.ts', 'cp -r src build', 'cp -a src build2', 'cp -l src/a.ts src/c.ts', 'rsync -a src/ out/', 'rsync -a --link-dest=src src/ out/', 'cp docs/decisions/x.md /tmp/x.md'], c => silent(sh(root, c), c));
});

test('Y1 git commands that discard uncommitted work with no pathspec ask', t => {
  const {root} = repo(t);
  each(['git checkout -f HEAD~5', 'git checkout --force abc123', 'git switch -f main', 'git switch --discard-changes main', 'git stash -u', 'git stash -a', 'git stash --include-untracked',
    'git stash push -u', 'git stash --all', 'git clean -f', 'git clean -fd', 'git clean -fdx', 'git clean --force', 'git clean -d -f'],
  c => asked(sh(root, c), 'COMMIT QUALITY GUARD', c));
  each(['git clean -n', 'git clean -fn', 'git clean -fd src', 'git clean -fd -- src/tmp', 'git stash list', 'git stash', 'git stash pop', 'git stash push -m wip', 'git checkout -b feature/y', 'git switch main',
    'git switch -c feature/z', 'git checkout -f -- src/a.ts', 'git checkout main'], c => silent(sh(root, c), c));
});

test('Y2 a read-only authority source is not an authority mutation', t => {
  const {root} = repo(t);
  each(['cp .claude/settings.json /tmp/settings.bak', 'cp .claude/settings.json backup.json', 'cat .claude/settings.json | jq .hooks', 'sed -n p .claude/settings.json', 'install .claude/settings.json /tmp/s.json'],
    c => silent(sh(root, c), c));
  each(['cp evil.json .claude/settings.json', 'echo x > .claude/settings.json', 'sed -i s/a/b/ .claude/settings.json', 'mv evil.json .claude/settings.json'],
    c => blocked(sh(root, c), 'RUNTIME INTEGRITY GUARD', c));
});

test('Y3 PowerShell Start-Process and the call operator running a shell with an argument list ask', t => {
  const {root} = repo(t);
  each([`Start-Process cmd -ArgumentList '/c','rd','/s','/q','docs'`, `Start-Process pwsh -ArgumentList '-Command','Remove-Item -Recurse docs'`, `Start-Process powershell -ArgumentList 'x'`,
    `Start-Process -FilePath bash -ArgumentList '-c','rm -rf docs'`, `Start-Process sh -ArgumentList '-c','true'`, `Start-Process cmd.exe -ArgumentList '/c','dir'`],
  c => asked(ps(root, c), 'RUNTIME INTEGRITY GUARD', c));
  gated(ps(root, '& cmd /c rd /s /q docs'), '& cmd /c rd /s /q docs');
  each([`Start-Process notepad`, `Start-Process node -ArgumentList 'build.js'`, '& npm test', '& ./build.ps1', 'Start-Process https://example.test'], c => silent(ps(root, c), c));
});

test('A1 PowerShell environment assignments that point git at another config or git dir, with git in the same command, block', t => {
  const {root} = repo(t);
  each([`$env:GIT_CONFIG_PARAMETERS="'core.hooksPath=x'"; git commit -m x`,
    `$env:GIT_CONFIG_COUNT=1; $env:GIT_CONFIG_KEY_0='core.hooksPath'; $env:GIT_CONFIG_VALUE_0='x'; git commit -m x`,
    `$env:GIT_CONFIG_GLOBAL='evil.cfg'; git commit -m x`, `$env:GIT_CONFIG_SYSTEM = 'evil.cfg'; git commit -m x`, `$env:GIT_DIR='../evil/.git'; git commit -m x`,
    `Set-Item env:GIT_CONFIG_PARAMETERS "'core.hooksPath=x'"; git commit -m x`, `Set-Item -Path env:GIT_DIR -Value ../evil/.git; git commit -m x`,
    `[Environment]::SetEnvironmentVariable('GIT_CONFIG_PARAMETERS', "'core.hooksPath=x'"); git commit -m x`, `[System.Environment]::SetEnvironmentVariable("GIT_DIR", "../evil/.git"); git commit -m x`,
    `$env:GIT_DIR='../evil/.git'; git.exe commit -m x`],
  c => blocked(ps(root, c), 'COMMIT QUALITY GUARD', c));
  each([`$env:GIT_CONFIG_PARAMETERS="'a=b'"`, 'Write-Output $env:GIT_CONFIG_PARAMETERS', 'Write-Output $env:GIT_DIR; git status', `git commit -m "docs: mention GIT_CONFIG_PARAMETERS and GIT_DIR"`,
    `git commit -m 'docs: $env:GIT_CONFIG_PARAMETERS = x is blocked'`, `$env:NODE_ENV='test'; git commit -m x`],
  c => silent(ps(root, c), 'PowerShell ' + c));
});

test('R4-loop ordinary controller and worker commands stay silent', t => {
  const {root} = repo(t);
  const bash = [
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
  const powershell = ['Get-ChildItem -Recurse | Select-String TODO', 'Remove-Item -Recurse -Force node_modules'];
  assert.equal(bash.length + powershell.length, 60, 'the list is sixty commands');
  each(bash, c => silent(sh(root, c), c));
  each(powershell, c => silent(ps(root, c), 'PowerShell ' + c));
  each(['bash -c "npm test"', 'sh -c "ls src"', 'cp .claude/settings.json backup.json', 'cat .claude/settings.json | jq .hooks', 'git clean -n', 'git stash list', 'git checkout -b feature/y', 'git switch main'],
    c => silent(sh(root, c), c));
  each(['npm test', "sed -i 's/a/b/' src/a.ts", "git add src && git commit -m 'feat: x'", 'd=$(mktemp -d)', 'bash -c "npm test"'], c => silent(sh(root, c, WORKER), 'worker ' + c));
});
