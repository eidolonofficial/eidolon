// Regression tests for the 2026-10-13 independent audit of the hook suite (R1 to R10).
// Every case drives the wired entry point (guard-bash.mjs or guard-write.mjs) in a
// throwaway git repo, the way Claude Code runs it: hook JSON on stdin, exit code asserted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync, execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HOOKS = dirname(fileURLToPath(import.meta.url));

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), 'eidolon-reds-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  execFileSync('git', ['init', '-q'], {cwd: root});
  const put = (path, text) => { const file = join(root, path); mkdirSync(dirname(file), {recursive: true}); writeFileSync(file, text); };
  put('docs/decisions/x.md', 'original\n');
  put('docs/fixes/FIX-1.md', 'original\n');
  put('hooks/guard-bash.mjs', '// fixture\n');
  put('hooks/lib.mjs', '// fixture\n');
  put('tools/hooks/guard-bash.mjs', '// fixture\n');
  put('tools/hooks/extra.mjs', '// fixture\n');
  put('src/hooks/useAuth.ts', 'export {};\n');
  put('.claude/settings.json', '{}\n');
  return root;
}
const call = (root, script, event) => spawnSync(process.execPath, [join(HOOKS, script), '--project', root], {
  cwd: root, encoding: 'utf8', input: JSON.stringify({cwd: root, ...event}), timeout: 15000,
});
const sh = (root, command, tool = 'Bash') => call(root, 'guard-bash.mjs', {tool_name: tool, tool_input: {command}});
const wr = (root, file_path, content) => call(root, 'guard-write.mjs', {tool_name: 'Write', tool_input: {file_path, content}});
const blocked = (r, label, what) => {
  assert.equal(r.status, 2, `${what}: expected block, got exit ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  assert.match(r.stderr, new RegExp(label), what);
};
const silent = (r, what) => assert.ok(r.status === 0 && r.stdout === '', `${what}: expected silent allow, got exit ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
const asked = (r, label, what) => {
  assert.equal(r.status, 0, `${what}: expected ask (exit 0), got exit ${r.status}\nstderr: ${r.stderr}`);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'ask', what);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, new RegExp(label), what);
};

test('R1 append-only guard resolves the path: dot and double-slash spellings still block an emptying Write', t => {
  const root = repo(t);
  for (const p of ['docs/decisions/x.md', 'docs/./decisions/x.md', 'docs//decisions/x.md', 'docs/fixes/../decisions/x.md', 'src/../docs/decisions/x.md'])
    blocked(wr(root, p, ''), 'APPEND-ONLY RECORD GUARD', p);
  assert.equal(wr(root, 'docs/decisions/x.md', 'original\nappended\n').status, 0, 'a pure append stays allowed');
});

test('R2 destructive ops on a record or hook resolve cd segments and dot segments', t => {
  const root = repo(t);
  const cmds = ['cd docs; rm decisions/x.md', 'cd docs && rm decisions/x.md', 'cd docs || rm decisions/x.md', 'rm docs/./decisions/x.md', 'rm docs/fixes/../decisions/x.md'];
  for (const c of cmds) {
    blocked(sh(root, c), 'DELETION GUARD', c);
    blocked(call(root, 'protected-paths-guard.mjs', {tool_name: 'Bash', tool_input: {command: c}}), 'PROTECTED PATHS GUARD', 'standalone protected-paths: ' + c);
    blocked(call(root, 'deletion-guard.mjs', {tool_name: 'Bash', tool_input: {command: c}}), 'DELETION GUARD', 'standalone deletion: ' + c);
  }
  blocked(call(root, 'protected-paths-guard.mjs', {tool_name: 'Bash', tool_input: {command: 'cd hooks && rm lib.mjs'}}), 'PROTECTED PATHS GUARD', 'cd hooks');
  silent(sh(root, 'cd docs; ls decisions'), 'read after cd');
  silent(sh(root, 'cd src; rm hooks/useAuth.ts'), 'application hooks dir after cd');
});

test('R3 a record cannot be overwritten from the shell; appends stay allowed', t => {
  const root = repo(t), rec = 'docs/decisions/x.md';
  for (const c of [
    `cat > ${rec} <<EOF\nhello\nEOF`, `: > ${rec}`, `echo x > ${rec}`, `echo x >${rec}`, `echo x 1> ${rec}`, `echo x >| ${rec}`, `cp /dev/null ${rec}`,
    `sed -i 's/a/b/' ${rec}`, `sed --in-place -e 's/a/b/' ${rec}`, `tee ${rec}`, `echo x | tee ${rec}`, `mv /tmp/new.md ${rec}`, `dd if=/dev/null of=${rec}`,
  ]) blocked(sh(root, c), 'DELETION GUARD', c);
  for (const c of [`Clear-Content ${rec}`, `Set-Content ${rec} -Value y`, `sc ${rec} y`, `Out-File ${rec}`, `'y' | Out-File -FilePath ${rec}`, `Remove-Item ${rec}`, `ri ${rec}`, `erase ${rec}`, `del ${rec}`, `echo y > ${rec}`])
    blocked(sh(root, c, 'PowerShell'), 'DELETION GUARD', 'PowerShell ' + c);
  for (const c of [`echo x >> ${rec}`, `tee -a ${rec}`, `echo x | tee --append ${rec}`, `cat ${rec}`, `cp ${rec} /tmp/backup.md`, `sed -n 1p ${rec}`, `grep a ${rec} > out.txt`])
    silent(sh(root, c), c);
  for (const c of [`Add-Content ${rec} y`, `ac ${rec} y`, `Get-Content ${rec}`, `'y' | Out-File -Append ${rec}`, `echo y >> ${rec}`])
    silent(sh(root, c, 'PowerShell'), 'PowerShell ' + c);
});

test('R4 a hooksPath override through the environment or --config-env is blocked', t => {
  const root = repo(t);
  const cmds = [
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/tmp/x git commit -m y',
    "GIT_CONFIG_PARAMETERS='core.hooksPath=/tmp/x' git commit -m y",
    `GIT_CONFIG_PARAMETERS="'core.hookspath'='/tmp/x'" git commit -m y`,
    'git --config-env=core.hooksPath=VAR commit -m y',
    'git --config-env core.hooksPath=VAR commit -m y',
    'export GIT_CONFIG_PARAMETERS=core.hooksPath=/tmp/x; git commit -m y',
  ];
  for (const c of cmds) {
    blocked(sh(root, c), 'COMMIT QUALITY GUARD', c);
    blocked(call(root, 'hook-integrity-guard.mjs', {tool_name: 'Bash', tool_input: {command: c}}), 'HOOK INTEGRITY GUARD', 'standalone hook-integrity: ' + c);
  }
  silent(sh(root, 'GIT_AUTHOR_NAME=x git commit --allow-empty -m y'), 'ordinary env prefix');
});

test('R5 combined short flags: -nm is --no-verify plus a message', t => {
  const root = repo(t);
  for (const c of ['git commit -nm "msg"', 'git commit -anm "msg"', 'git commit -nm "docs: explain --no-verify"', 'git commit -n -m msg'])
    blocked(sh(root, c), 'COMMIT QUALITY GUARD', c);
  silent(sh(root, 'git commit --allow-empty -am "msg"'), '-am');
  silent(sh(root, 'git commit --allow-empty -m n'), 'message text n');
});

test('R6 plus-refspec force push, inline alias hiding commit, and --no-veri abbreviation', t => {
  const root = repo(t);
  for (const c of [
    'git push origin +main', 'git push origin +refs/heads/a:refs/heads/a', 'git push -fu origin main',
    "git -c alias.ci='commit --no-verify' ci -m x", "git -c alias.ci='!git commit -n' ci -m x",
    'git commit --no-veri -m x', 'git push --no-veri origin main',
  ]) blocked(sh(root, c), 'COMMIT QUALITY GUARD', c);
  silent(sh(root, 'git push --force-with-lease origin main'), 'lease');
  silent(sh(root, "git -c alias.ci='commit -v' ci --allow-empty -m x"), 'harmless alias');
});

test('R7 overwriting a hook: the controller is asked, a worker is blocked, for shell forms and for Write/Edit', t => {
  const root = repo(t), worker = {transcript_path: join(root, '.claude', 'subagents', 'agent-1.jsonl')};
  const confirm = 'editing the governance hooks; confirm';
  for (const c of ['cp x hooks/lib.mjs', '> hooks/lib.mjs', 'echo x > hooks/lib.mjs', 'echo x >> hooks/lib.mjs', "sed -i 's/a/b/' hooks/lib.mjs", 'tee hooks/lib.mjs', 'cp x tools/hooks/extra.mjs']) {
    asked(sh(root, c), 'HOOK INTEGRITY GUARD: ' + confirm, c);
    blocked(call(root, 'guard-bash.mjs', {tool_name: 'Bash', tool_input: {command: c}, ...worker}), 'HOOK INTEGRITY GUARD', 'worker ' + c);
  }
  asked(sh(root, 'Set-Content hooks/lib.mjs y', 'PowerShell'), confirm, 'PowerShell Set-Content');
  for (const p of ['hooks/lib.mjs', 'hooks/new-guard.mjs', join(root, 'hooks', 'lib.mjs'), 'tools/hooks/extra.mjs']) {
    asked(wr(root, p, 'x'), confirm, 'Write ' + p);
    blocked(call(root, 'guard-write.mjs', {tool_name: 'Write', tool_input: {file_path: p, content: 'x'}, ...worker}), 'HOOK INTEGRITY GUARD', 'worker Write ' + p);
  }
  const edit = {tool_name: 'Edit', tool_input: {file_path: 'hooks/lib.mjs', old_string: 'fixture', new_string: 'changed'}};
  asked(call(root, 'guard-write.mjs', edit), confirm, 'Edit hook');
  blocked(call(root, 'guard-write.mjs', {...edit, ...worker}), 'HOOK INTEGRITY GUARD', 'worker Edit hook');
  silent(wr(root, 'src/hooks/useAuth.ts', 'export const a = 1;\n'), 'application hooks dir');
  silent(sh(root, 'cp hooks/lib.mjs /tmp/lib-copy.mjs'), 'reading a hook');
});

test('R8 an interpreter inline body naming an authority path asks', t => {
  const root = repo(t);
  for (const [c, tool] of [
    [`node -e "require('fs').writeFileSync('.claude/settings.json', '{}')"`, 'Bash'],
    [`python -c "open('.claude/settings.json','w').write('{}')"`, 'Bash'],
    [`pwsh -Command "Set-Content .claude/settings.json '{}'"`, 'PowerShell'],
    [`node -e "require('fs').rmSync('hooks',{recursive:true})"`, 'Bash'],
    [`python -c "open('.eidolon/policy-manifest.json','w')"`, 'Bash'],
    [`bash -c 'echo {} > .claude/settings.local.json'`, 'Bash'],
  ]) asked(sh(root, c, tool), 'RUNTIME INTEGRITY GUARD', c);
  silent(sh(root, `node -e "console.log(1)"`), 'harmless node -e');
  silent(sh(root, `python -c "print(1)"`), 'harmless python -c');
});

test('R9 heredoc bodies are opaque; an unparseable command asks, never blocks', t => {
  const root = repo(t);
  silent(sh(root, "cat <<'EOF'\nit's done\nEOF"), 'heredoc with an apostrophe');
  silent(sh(root, "cat <<-EOF\n\tit's \"done\nEOF\necho after"), 'indented heredoc, stray quotes');
  silent(sh(root, "Set-Content note.txt @'\nit's done\n'@", 'PowerShell'), 'PowerShell here-string');
  blocked(sh(root, "cat <<'EOF' > docs/decisions/x.md\nit's\nEOF"), 'DELETION GUARD', 'heredoc overwriting a record');
  blocked(sh(root, "cat <<'EOF'\nit's\nEOF\nrm docs/decisions/x.md"), 'DELETION GUARD', 'command after a heredoc is still parsed');
  asked(sh(root, 'echo "unterminated'), 'could not parse this command', 'unterminated quote');
  asked(sh(root, 'git commit -m "unterminated'), 'could not parse this command', 'unterminated quote in a git commit');
});

test('R10 PowerShell tool parity: deletes, git bypass flags, record and hook mutation', t => {
  const root = repo(t);
  for (const c of ['Remove-Item hooks/guard-bash.mjs', 'ri hooks/guard-bash.mjs', 'del hooks/guard-bash.mjs', 'erase hooks/guard-bash.mjs', 'Remove-Item -Recurse -Force hooks'])
    blocked(sh(root, c, 'PowerShell'), 'HOOK INTEGRITY GUARD', 'PowerShell ' + c);
  blocked(sh(root, 'Remove-Item -Recurse .git', 'PowerShell'), 'RUNTIME INTEGRITY GUARD', 'PowerShell Remove-Item .git');
  for (const c of ['git commit -n -m x', 'git commit -nm x', 'git push origin +main', 'git push --force origin main', 'git commit --no-veri -m x'])
    blocked(sh(root, c, 'PowerShell'), 'COMMIT QUALITY GUARD', 'PowerShell ' + c);
  blocked(sh(root, 'Set-Location docs; Remove-Item decisions\\x.md', 'PowerShell'), 'DELETION GUARD', 'PowerShell cd then delete');
  blocked(sh(root, 'Clear-Content docs/./decisions/x.md', 'PowerShell'), 'DELETION GUARD', 'PowerShell dot segment');
  silent(sh(root, 'git commit --allow-empty -m x', 'PowerShell'), 'PowerShell plain commit');
});
