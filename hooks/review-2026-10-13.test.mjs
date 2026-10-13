// Tests for the 2026-10-13 execution review of the hook suite (H1 to H19). The hooks are defense in
// depth: a silent allow of a protected-path mutation fails a test, an ask is acceptable where the
// finding says so, a hard block is asserted only for the clear cases. Every case drives the wired
// entry point in a throwaway git repo, the way Claude Code runs it: hook JSON on stdin.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync, execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync, existsSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HOOKS = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(HOOKS);
const WIN = process.platform === 'win32';
const WORKER = {agent_id: 'w1', agent_type: 'builder'};

function repo(t, {scopes = {builder: {read: ['**'], write: ['src/**']}}, wave = true} = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'eidolon-rev-')));
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
  put('src/hooks/useAuth.ts', 'export {};\n');
  put('evil.patch', '--- a\n+++ b\n');
  put('.claude/settings.json', '{}\n');
  if (scopes) put('.claude/agent-scopes.json', JSON.stringify(scopes));
  if (wave) put('.claude/waves/2026-10-13-test.md', '# wave plan\n\nSteps: build, verify, close the work item.\n');
  return {root, put};
}
const run = (root, script, event, args = ['--project', root]) => spawnSync(process.execPath, [join(HOOKS, script), ...args], {
  cwd: event.cwd ?? root, encoding: 'utf8', timeout: 20000, input: JSON.stringify({cwd: root, session_id: 's1', ...event}),
});
const sh = (root, command, extra = {}, tool = 'Bash') => run(root, 'guard-bash.mjs', {tool_name: tool, tool_input: {command}, ...extra});
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
// A silent allow is the failure; an ask or a block both pass.
const gated = (r, what) => assert.ok(r.status === 2 || (r.status === 0 && askedWith(r)),
  `${what}: silent allow (exit ${r.status})\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
const silent = (r, what) => assert.ok(r.status === 0 && r.stdout === '', `${what}: expected silent allow, got exit ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
const each = (list, fn) => list.forEach(fn);

test('H1 the wired settings pass --project, so a Write from a subdirectory still resolves the policy root', {skip: !existsSync(join(REPO, '.claude/settings.json')) && 'the repo settings are not bundled'}, t => {
  const {root} = repo(t);
  const conf = JSON.parse(readFileSync(join(REPO, '.claude/settings.json'), 'utf8'));
  const entries = Object.values(conf.hooks).flatMap(groups => groups.flatMap(g => g.hooks));
  const write = entries.find(h => h.args[0].endsWith('/hooks/guard-write.mjs'));
  const args = write.args.map(a => a.replace('${CLAUDE_PROJECT_DIR}/hooks/', HOOKS + '/').replace('${CLAUDE_PROJECT_DIR}', root));
  const r = spawnSync(process.execPath, args, {
    cwd: join(root, 'src'), encoding: 'utf8', timeout: 20000,
    input: JSON.stringify({cwd: join(root, 'src'), session_id: 's1', tool_name: 'Write', tool_input: {file_path: join(root, 'docs/decisions/x.md'), content: ''}}),
  });
  blocked(r, 'APPEND-ONLY RECORD GUARD', 'wired guard-write from <root>/src');
  for (const h of entries) assert.deepEqual(h.args.slice(1), ['--project', '${CLAUDE_PROJECT_DIR}'], h.args[0]);
});

test('H2 an alternate data stream or an 8.3 short name resolves to the protected file it names', { skip: !WIN && 'Windows path semantics' }, t => {
  const {root} = repo(t);
  const dirName = (dir, long) => { try { return new RegExp('<DIR>\\s+(\\S+)\\s+' + long + '\\s*$', 'im').exec(execFileSync('cmd', ['/c', 'dir', '/x', join(root, dir)], {encoding: 'utf8'}))?.[1]; } catch { return null; } };
  for (const p of ['.claude/settings.json::$DATA', 'DECISIONS.md::$DATA', 'docs/decisions/x.md::$DATA', 'docs/decisions/x.md:stream'])
    blocked(wr(root, p, ''), '', 'Write ' + p);
  const short = dirName('docs', 'decisions');
  assert.ok(short, 'this volume has no 8.3 name for docs/decisions; the case cannot run here');
  blocked(wr(root, `docs/${short}/x.md`, ''), 'APPEND-ONLY RECORD GUARD', 'Write through the short directory name');
  const file = /(\S+)\s+settings\.json\s*$/im.exec(execFileSync('cmd', ['/c', 'dir', '/x', join(root, '.claude')], {encoding: 'utf8'}))?.[1];
  assert.ok(file, 'no 8.3 name for settings.json');
  blocked(wr(root, `.claude/${file}`, '{"disableAllHooks":true}'), 'SETTINGS INTEGRITY GUARD', 'Write through the short file name');
  blocked(sh(root, `rm docs/${short}/x.md`), 'DELETION GUARD', 'shell rm through the short directory name');
  blocked(sh(root, `rm 'docs/decisions/x.md::$DATA'`), '', 'shell rm of an alternate data stream');
});

test('H3 the sensitive-dispatch terms match: prod, pii, pci, token, keys, .env, rm -rf, drop table, delete, wipe, destroy', t => {
  const {root} = repo(t);
  const dispatch = description => run(root, 'guard-dispatch.mjs', {tool_name: 'Agent', tool_input: {subagent_type: 'Explore', model: 'sonnet', description, prompt: 'look'}});
  const terms = ['check the prod box', 'the pii table', 'the pci scope', 'rotate the token', 'list the keys', 'read the .env file', 'run rm -rf build', 'drop table users', 'delete the cache', 'wipe the disk', 'destroy the box'];
  each(terms, term => asked(dispatch(term), 'security-policy\\.md', term));
  silent(dispatch('fix a typo in the readme'), 'a routine dispatch');
});

test('H4 ANSI-C quotes decode; a glob, brace or variable operand that could reach a protected path asks', t => {
  const {root} = repo(t);
  blocked(sh(root, `cp /dev/null $'docs/decisions/x.md'`), 'DELETION GUARD', 'ANSI-C record path');
  blocked(sh(root, `cp /dev/null $'docs\\x2fdecisions/x.md'`), 'DELETION GUARD', 'ANSI-C hex escape');
  gated(sh(root, `cp src/a.ts $'hooks/guard-bash.mjs'`), 'ANSI-C hook path');
  blocked(sh(root, `cp src/a.ts $'.claude/settings.local.json'`), '', 'ANSI-C settings path');
  each(['rm docs/deci*/x.md', 'rm docs/{decisions,none}/x.md', 'cd docs; cd deci*; rm x.md', 'rm docs/decision?/x.md', 'rm docs/[d]ecisions/x.md', 'rm $TARGET'],
    c => asked(sh(root, c), 'RUNTIME INTEGRITY GUARD', c));
  each(['rm src/*.ts', 'rm docs/y*', 'ls docs/dec*', 'cd src; rm *.ts', "echo $'a\\'b' > out.txt"], c => silent(sh(root, c), c));
});

test('H5 wrappers unwrap (env flags, sudo, time, nice, xargs, a subshell); simple variables resolve; opaque bodies ask', t => {
  const {root} = repo(t);
  each([
    'env -i GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x',
    'env -u FOO git commit --no-verify', 'sudo git commit --no-verify', 'sudo -u root git commit --no-verify', 'time git commit --no-verify -m x',
    'nice git commit --no-verify -m x', 'nice -n 5 git commit -n -m x', '(git commit --no-verify -m x)', 'k=core.hooksPath; GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=$k git commit -m x',
    'if true; then git commit --no-verify -m x; fi',
  ], c => blocked(sh(root, c), 'COMMIT QUALITY GUARD', c));
  blocked(sh(root, 'ls docs | xargs rm -r'), '', 'xargs rm fed by ls docs');
  gated(sh(root, 'echo $(git commit --no-verify)'), 'substitution with a commit');
  each(["sh -c 'git commit --no-verify'", 'bash -c "git commit -n -m x"', 'echo "$(git push --force)"', 'echo `git commit -n`', 'pwsh -Command "git commit -n"'],
    c => gated(sh(root, c), c));
  gated(ps(root, 'pwsh -Command "git commit -n -m x"'), 'PowerShell inline body');
  each(['sudo ls docs', 'time ls', 'echo $(date)', 'echo $(git rev-parse HEAD)', 'k=1; echo $k', 'env -i node -e 1'], c => silent(sh(root, c), c));
});

test('H6 an unlisted git global option does not hide the subcommand', t => {
  const {root} = repo(t);
  each(['git -P commit --no-verify -m x', 'git -p commit --no-verify -m x', 'git --exec-path=/x commit --no-verify -m x',
    'git --no-replace-objects --literal-pathspecs commit -n -m x', 'git --html-path --glob-pathspecs commit --no-verify -m x', 'git --namespace=n --bare commit -n -m x'],
  c => blocked(sh(root, c), 'COMMIT QUALITY GUARD', c));
  asked(sh(root, 'git --some-future-option commit -m x'), 'COMMIT QUALITY GUARD', 'an unknown global option');
  silent(sh(root, 'git -P log --oneline'), 'a known option with a read subcommand');
});

test('H7 an MSYS /c/ operand maps to its drive and is judged as the real path', { skip: !WIN && 'MSYS drive mapping is a Windows concern' }, t => {
  const {root} = repo(t);
  const msys = '/' + root[0].toLowerCase() + root.slice(2).replace(/\\/g, '/');
  blocked(sh(root, `cp /dev/null ${msys}/docs/decisions/x.md`), 'DELETION GUARD', 'cp onto an MSYS-spelled record');
  blocked(sh(root, `rm ${msys}/docs/decisions/x.md`), 'DELETION GUARD', 'rm of an MSYS-spelled record');
  blocked(sh(root, `cd ${msys}/docs; rm decisions/x.md`), 'DELETION GUARD', 'cd to an MSYS-spelled directory');
  silent(sh(root, `rm ${msys}/docs/a.md`), 'an MSYS-spelled ordinary file');
});

test('H8 deleting or moving an ancestor of a protected path is blocked', t => {
  const {root} = repo(t);
  each(['rm -rf docs', 'rm -rf .', 'rm -rf ./*', 'rm -rf *', 'git rm -r docs', 'rm -rf .claude', 'mv .claude .claude.bak', 'mv docs docs.old', 'rm -rf hooks'],
    c => blocked(sh(root, c), '', c));
  blocked(ps(root, 'Remove-Item -Recurse docs'), '', 'Remove-Item -Recurse docs');
  blocked(ps(root, 'Move-Item .claude .claude.bak'), '', 'Move-Item .claude');
  each(['rm -rf src', 'rm -rf node_modules', 'rm src/a.ts', 'mv src/a.ts src/b.ts', 'rm -rf src/hooks', 'rm docs/a.md'], c => silent(sh(root, c), c));
});

test('H9 write, delete and attr verbs on protected paths are modeled; an unmodeled verb naming one asks', t => {
  const {root} = repo(t);
  each([
    'ln -sf /dev/null docs/decisions/x.md', 'find docs -delete', 'find docs -name x.md -exec rm {} +', 'rsync -a --delete empty/ docs/decisions/',
    'git checkout -- docs/decisions/x.md', 'git restore docs/decisions/x.md', 'git stash push -- docs/decisions/x.md', 'git clean -fdx docs',
    'git checkout HEAD~3 -- hooks/', 'git mv -f src/a.ts docs/decisions/x.md', 'git reset HEAD -- docs/decisions/x.md', 'cp -t docs/decisions src/a.ts',
    'touch docs/decisions/new.md', 'mkdir docs/decisions/sub', 'icacls hooks/guard-bash.mjs /deny Everyone:R', 'attrib +r hooks/guard-bash.mjs',
    'cmd /c copy src\\a.ts .claude\\settings.local.json',
  ], c => blocked(sh(root, c), '', c));
  each(['New-Item -Force docs/decisions/x.md', 'Set-ItemProperty hooks/guard-bash.mjs -Name Attributes -Value ReadOnly', 'Remove-Item -Path:docs/decisions/x.md'],
    c => blocked(ps(root, c), '', 'PowerShell ' + c));
  each(['git apply evil.patch', 'patch -p1 < evil.patch', 'patch hooks/lib.mjs evil.diff', 'curl -o docs/decisions/x.md http://example.test/x', 'vim docs/decisions/x.md', 'cmd /c "copy src\\a.ts .claude\\settings.local.json"'],
    c => gated(sh(root, c), c));
  each(["[IO.File]::WriteAllText('docs/decisions/x.md','')", 'Invoke-WebRequest http://example.test -OutFile docs/decisions/x.md', 'Invoke-Expression "Remove-Item docs\\decisions\\x.md"'], c => gated(ps(root, c), 'PowerShell ' + c));
  each(['eval "rm docs/decisions/x.md"', "python - <<'EOF'\nopen('docs/decisions/x.md','w')\nEOF", "bash <<EOF\ngit commit --no-verify -m x\nEOF"], c => gated(sh(root, c), c));
  each(["python - <<'EOF'\nprint(1)\nEOF", "cat <<'EOF'\nsee docs/decisions\nEOF"], c => silent(sh(root, c), c));
  each(['git checkout -b feature', 'git checkout main', 'git restore --staged src/a.ts', 'git status', 'git add hooks/lib.mjs', 'git diff -- docs/decisions/x.md', 'git apply --check evil.patch',
    'node --test hooks/lib.test.mjs', 'cat docs/decisions/x.md', 'grep -r a docs/decisions', 'find docs -name x.md', 'ln -s a.ts src/link', 'touch src/new.ts', 'mkdir src/d', 'bash hooks/lib.mjs'],
  c => silent(sh(root, c), c));
});

test('H10 dash-prefixed path parameters and target-directory options are targets', t => {
  const {root} = repo(t);
  each(['Set-Content -Path:docs/decisions/x.md -Value x', 'Clear-Content -Path:docs/decisions/x.md', 'Copy-Item -Destination docs/decisions/x.md -Path src/a.ts',
    'Set-Content -LiteralPath docs/decisions/x.md -Value x', "'x' | Out-File -FilePath docs/decisions/x.md", 'Copy-Item src/a.ts -Destination:docs/decisions/x.md'],
  c => blocked(ps(root, c), 'DELETION GUARD', 'PowerShell ' + c));
  each(['cp -t docs/decisions src/a.ts', 'cp --target-directory=docs/decisions src/a.ts', 'cp --target-directory docs/decisions src/a.ts', 'mv -t docs/decisions src/a.ts'],
    c => blocked(sh(root, c), 'DELETION GUARD', c));
  const hookWrites = [['Copy-Item -Destination hooks/lib.mjs -Path src/a.ts', ps], ['cp -t hooks src/a.ts', sh], ['cp --target-directory=hooks src/a.ts', sh]];
  each(hookWrites, ([c, tool]) => {
    asked(tool(root, c), 'editing the governance hooks; confirm', 'controller ' + c);
    blocked(tool(root, c, {transcript_path: join(root, 'x', 'subagents', 'a.jsonl')}), 'HOOK INTEGRITY GUARD', 'worker ' + c);
  });
  silent(ps(root, 'Set-Content -Path src/a.ts -Value docs/decisions/x.md'), 'a path-shaped value is not a target');
  silent(sh(root, 'cp -t src docs/a.md'), 'copying into an ordinary directory');
});

test('H11 .gitignore drops the stale drift counter and ignores the session state', () => {
  const lines = readFileSync(join(REPO, '.gitignore'), 'utf8').split(/\r?\n/);
  assert.ok(!lines.includes('.claude/.drift-count'), 'stale entry');
  assert.ok(lines.includes('.eidolon/sessions/'), '.eidolon/sessions/ is not ignored');
});

test('H12 mirror and force variants, alias and include config, global config env, push deletes', t => {
  const {root} = repo(t);
  each(['git push --mirror origin', 'git -c remote.origin.mirror=true push', 'git config remote.origin.mirror true', "git config remote.origin.push '+refs/heads/*:refs/heads/*'",
    "git config alias.ci 'commit --no-verify'", "git config --global alias.ci 'commit -n'", "git config alias.p 'push --force'", 'git config include.path ../evil.cfg',
    'git -c include.path=../evil.cfg commit -m x', 'GIT_CONFIG_GLOBAL=evil.cfg git commit -m x', 'GIT_CONFIG_SYSTEM=evil.cfg git commit -m x',
    'export GIT_CONFIG_GLOBAL=evil.cfg; git commit -m x', 'git push --force-if-includes'],
  c => blocked(sh(root, c), 'COMMIT QUALITY GUARD', c));
  each(['git push --delete origin branch', 'git push origin :branch', 'git push -d origin branch'], c => asked(sh(root, c), 'COMMIT QUALITY GUARD', c));
  each(["git config alias.l 'log -n 5'", 'git config user.name x', 'git push origin main', 'git push --force-with-lease origin main', 'git config --get remote.origin.url'], c => silent(sh(root, c), c));
});

test('H13 the dispatch gates: a Done-check line with text, anchored read-only names, a readable session and a real wave plan', t => {
  const fixture = ({wave = 'a wave plan that is long enough to count'} = {}) => {
    const r = repo(t, {wave: false, scopes: {scout: {read: ['**'], write: []}, builder: {read: ['**'], write: ['src/**']}}});
    const transcript = join(r.root, 'transcript.jsonl');
    writeFileSync(transcript, '{}\n');
    if (wave !== null) {
      r.put('.claude/waves/w.md', wave);
      const later = new Date(Date.now() + 5000);
      utimesSync(join(r.root, '.claude/waves/w.md'), later, later);
    }
    return {...r, transcript};
  };
  const go = (r, input, extra = {transcript_path: r.transcript}) => run(r.root, 'guard-dispatch.mjs', {tool_name: 'Agent', tool_input: {model: 'sonnet', ...input}, ...extra});
  const ok = fixture();
  silent(go(ok, {subagent_type: 'general-purpose', prompt: 'Refactor the parser.\nDone-check: node --test exits 0.'}), 'a Done-check line');
  silent(go(ok, {subagent_type: 'general-purpose', prompt: 'Refactor the parser.\n  done-check: tests pass'}), 'case and indent');
  silent(go(ok, {subagent_type: 'general-purpose', prompt: 'Refactor the parser.\nAcceptance: green'}), 'an Acceptance line');
  each(['No done-check needed.', 'Refactor the parser. Done-check: tests', 'Done-check:', 'Acceptance:   ', 'it must pass and exits 0', 'Evidence: the output'],
    p => asked(go(ok, {subagent_type: 'general-purpose', prompt: p}), 'brief names no done-check', p));
  asked(go(ok, {subagent_type: 'not-a-reviewer-builder', prompt: 'Refactor.'}), 'brief names no done-check', 'a name that merely contains reviewer');
  asked(go(ok, {subagent_type: 'Explorer-of-doom', prompt: 'Refactor.'}), 'brief names no done-check', 'a name that merely starts with Explore');
  each(['Explore', 'Plan', 'cavecrew-investigator', 'cavecrew-reviewer', 'scout'], type => silent(go(ok, {subagent_type: type, prompt: 'look around'}), type));
  asked(go(ok, {subagent_type: 'builder', prompt: 'Refactor.'}), 'brief names no done-check', 'a scoped agent with a write list');
  const brief = {subagent_type: 'general-purpose', prompt: 'Refactor the parser.\nDone-check: tests pass'};
  asked(go(ok, brief, {}), 'wave plan', 'no transcript_path');
  asked(go(ok, brief, {transcript_path: join(ok.root, 'missing.jsonl')}), 'wave plan', 'unreadable transcript_path');
  asked(go(fixture({wave: '# wave\n'}), brief, undefined), 'wave plan', 'an empty wave plan');
  asked(go(fixture({wave: '   \n\n  \n'}), brief, undefined), 'wave plan', 'a blank wave plan');
  silent(go(fixture(), brief, undefined), 'a real wave plan');
});

test('H14 moving or renaming a hook or the hooks directory blocks for everyone', t => {
  const {root} = repo(t);
  each(['Move-Item hooks/lib.mjs x.mjs', 'Rename-Item hooks/lib.mjs y.mjs', 'mi hooks hooks.bak', 'rni hooks/guard-bash.mjs z', 'Move-Item -Path hooks -Destination elsewhere', 'Rename-Item hooks old-hooks'],
    c => {
      blocked(ps(root, c), 'HOOK INTEGRITY GUARD', 'controller ' + c);
      blocked(ps(root, c, {transcript_path: join(root, 'x', 'subagents', 'a.jsonl')}), 'HOOK INTEGRITY GUARD', 'worker ' + c);
    });
  silent(ps(root, 'Move-Item src/a.ts src/b.ts'), 'moving an ordinary file');
});

test('H15 a worker cannot create, link or write outside its lane or the project root', t => {
  const {root, put} = repo(t);
  const w = c => sh(root, c, WORKER);
  each(['touch docs/y.md', 'mkdir docs/new', 'cp -t docs src/a.ts', 'git checkout -- docs', 'python -c "open(\'docs/y.md\',\'w\')"', 'echo x > ../y.md', 'ln -s ../docs src/link',
    'echo x > /var/outside.md', 'ln src/../docs/a.md src/hard'],
  c => blocked(w(c), 'WRITE LANE GUARD', c));
  each(['Copy-Item -Destination docs/y.md -Path src/a.ts', 'New-Item docs/y.md -Value x', 'Set-Content -Path:docs/y.md -Value x', 'Set-Content -Path ../y.md -Value x'],
    c => blocked(ps(root, c, WORKER), 'WRITE LANE GUARD', 'PowerShell ' + c));
  blocked(wr(root, join(root, '..', 'y.md'), 'x', WORKER), 'WRITE LANE GUARD', 'Write outside the root');
  each(['echo x > src/new.ts', 'cat docs/a.md', 'echo hi 2>/dev/null', 'touch src/new.ts', 'mkdir src/d', 'python -c "print(1)"', 'cp -t src docs/a.md', 'ln -s a.ts src/link', 'ls ../'],
    c => silent(w(c), c));
  silent(sh(root, 'touch docs/y.md'), 'the controller has no lane');
  silent(wr(root, join(root, '..', 'y.md')), 'the controller may write a plan file outside the root');
  put('x', '');
});

test('H16 a Write or Edit of any .claude/settings(.local).json runs settings-integrity, wherever it is', t => {
  const {root} = repo(t);
  const outside = realpathSync.native(mkdtempSync(join(tmpdir(), 'eidolon-outside-')));
  t.after(() => rmSync(outside, {recursive: true, force: true}));
  mkdirSync(join(outside, '.claude'));
  const handler = {hooks: {PreToolUse: [{matcher: 'Bash', hooks: [{type: 'command', command: 'node', args: ['guard.mjs']}]}]}};
  const existing = join(outside, '.claude', 'settings.json');
  writeFileSync(existing, JSON.stringify(handler));
  for (const name of ['settings.json', 'settings.local.json'])
    blocked(wr(root, join(outside, '.claude', name), '{"disableAllHooks":true}'), 'SETTINGS INTEGRITY GUARD', 'disableAllHooks in ' + name);
  blocked(wr(root, existing, '{}'), 'SETTINGS INTEGRITY GUARD', 'dropping an existing handler');
  blocked(wr(root, existing, '{"disableAllHooks":true}', WORKER), '', 'a worker writing outside settings');
  silent(wr(root, existing, JSON.stringify({...handler, permissions: {allow: []}})), 'a benign edit that keeps the handler');
  silent(wr(root, join(outside, 'plan.md')), 'other outside-root writes stay ungated');
  silent(wr(root, join(outside, '.claude', 'other.json')), 'other files under an outside .claude');
});

test('H17 a parse failure still runs the raw block nets before it downgrades to an ask', t => {
  const {root} = repo(t);
  each(["rm -rf hooks; echo $'a\\'b'", "git commit --no-verify -m x; echo $'a\\'b'", 'rm -rf hooks; echo "unterminated', 'git commit --no-verify -m x; echo "unterminated',
    'git commit -n -m x; echo "unterminated', 'git config core.hooksPath /tmp/x; echo "unterminated', 'rm docs/decisions/x.md; echo "unterminated'],
  c => blocked(sh(root, c), '', c));
  asked(sh(root, 'echo "unterminated'), 'could not parse this command', 'a benign unparseable line still asks');
  asked(sh(root, 'git commit -m "unterminated'), 'could not parse this command', 'an unparseable commit still asks');
});

test('H18 the read-write redirect <> is a write', t => {
  const {root} = repo(t);
  each(['printf XXXX 1<>docs/decisions/x.md', 'printf x <>docs/decisions/x.md', 'printf x <> docs/decisions/x.md'], c => blocked(sh(root, c), 'DELETION GUARD', c));
  silent(sh(root, 'cat < docs/decisions/x.md'), 'a plain input redirect');
});

test('H19 a worker report needs a backtick command, an existing path, or an Evidence line with text', t => {
  const {root} = repo(t);
  const stop = (message, active = false) => run(root, 'subagent-stop.mjs', {hook_event_name: 'SubagentStop', ...WORKER, last_assistant_message: message, stop_hook_active: active});
  const verdict = message => JSON.parse(stop(message).stdout);
  each(['Done and/or finished, nothing verified.', 'All finished.', 'Evidence:', 'Evidence:   \nmore text', 'No evidence was gathered.', 'See nothing/here.txt for details.', 'Look at ../outside/file.txt please.'],
    m => assert.equal(verdict(m).decision, 'block', m));
  each(['Ran `node --test`.', 'Changed src/a.ts and it passes.', 'Changed src\\a.ts.', 'Edited README via docs/a.md.', 'Evidence: green.', 'evidence: the suite exits 0'],
    m => assert.equal(verdict(m).decision, undefined, m));
  assert.equal(JSON.parse(stop('All finished.', true).stdout).decision, undefined, 'blocked once only');
});
