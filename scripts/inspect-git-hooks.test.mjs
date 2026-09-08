import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectGitHooks } from './inspect-git-hooks.mjs';
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(source, 'scripts/inspect-git-hooks.mjs');

function fixture(t) {
  // Git reports physical paths, including macOS /var -> /private/var.
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'eidolon-hooks-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const project = join(base, 'project with spaces');
  const home = join(base, 'home');
  mkdirSync(home);
  // Fixtures cannot read the operator's config, execute their hooks, or leak Git state.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));
  Object.assign(env, { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: home,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(home, 'gitconfig'), GIT_TERMINAL_PROMPT: '0' });
  function git(args, cwd = project) {
    const r = spawnSync('git', args, { cwd, env, encoding: 'utf8', timeout: 15000, windowsHide: true });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr || r.error}`);
    return r.stdout.trim();
  }
  git(['init', '--quiet', '--template=', project], base);
  git(['config', 'user.name', 'Hook fixture']);
  git(['config', 'user.email', 'hook-fixture@example.invalid']);
  git(['config', 'commit.gpgSign', 'false']);
  const inspect = (cwd = project) => inspectGitHooks(cwd, { env });
  const cli = (cwd = project) => spawnSync(process.execPath, [script, cwd, '--check-post-commit'], { env, encoding: 'utf8' });
  const hook = directory => {
    mkdirSync(directory, { recursive: true });
    const path = join(directory, 'post-commit');
    writeFileSync(path, '#!/bin/sh\nprintf "fired\\n" >> .hook-fired\n', { mode: 0o755 });
    chmodSync(path, 0o755);
    return path;
  };
  return { base, project, home, env, git, inspect, cli, hook };
}
const samePath = (a, b) => assert.equal(resolve(a), resolve(b));

// This regression fails against #4's literal Stage 1 and Stage 9 instructions.
test('Stages 1, 7, 9 and 10 use the same effective-path contract on both hosts', () => {
  const skill = readFileSync(join(source, 'SKILL.md'), 'utf8');
  const stage = n => skill.split(`#### Stage ${n} - `)[1].split('\n#### Stage ')[0];
  for (const n of [1, 7, 9]) assert.match(stage(n), /inspect-git-hooks\.mjs/);
  assert.doesNotMatch(stage(1), /ls \.git\/hooks/);
  assert.doesNotMatch(stage(9), /is-inside-work-tree[^\n]*post-commit path valid/);
  assert.match(stage(9), /--check-post-commit/);
  assert.match(stage(10), /<effective-post-commit-path>/);
  assert.match(readFileSync(join(source, 'codex/SKILL.md'), 'utf8'), /inspect-git-hooks\.mjs/);
  assert.match(readFileSync(join(source, 'references/git-hooks-path.md'), 'utf8'), /never.*overwrite/i);
});

test('unset config uses Git default hooks, without creating a missing directory', t => {
  const f = fixture(t), before = f.git(['status', '--porcelain']);
  const r = f.inspect();
  assert.equal(r.configuredHooksPath, null);
  samePath(r.hooksPath, join(f.project, '.git/hooks'));
  assert.equal(r.directoryState, 'missing');
  assert.equal(f.cli().status, 1);
  assert.equal(existsSync(r.hooksPath), false);
  assert.equal(f.git(['status', '--porcelain']), before);
  f.hook(r.hooksPath);
  assert.equal(f.cli().status, 0);
  assert.equal(existsSync(join(f.project, '.hook-fired')), false);
});

test('tracked core.hooksPath is discovered and actually fires on commit; dead default is untouched', t => {
  const f = fixture(t), effective = join(f.project, '.githooks');
  f.git(['config', 'core.hooksPath', '.githooks']);
  const hook = f.hook(effective), bytes = readFileSync(hook);
  writeFileSync(join(effective, 'ignored.sample'), 'sample');
  const r = f.inspect();
  samePath(r.hooksPath, effective);
  assert.deepEqual(r.hooks, ['post-commit']);
  assert.equal(r.postCommit.status, 'present');
  assert.equal(f.cli().status, 0);
  assert.equal(existsSync(join(f.project, '.hook-fired')), false, 'inspection must not execute hooks');
  assert.equal(existsSync(join(f.project, '.git/hooks')), false);
  f.git(['add', '.githooks']);
  f.git(['commit', '--quiet', '-m', 'fixture: tracked capture']);
  assert.equal(readFileSync(join(f.project, '.hook-fired'), 'utf8'), 'fired\n');
  assert.deepEqual(readFileSync(hook), bytes);
});

test('relative hook paths resolve from the working-tree root, not a nested caller', t => {
  const f = fixture(t), nested = join(f.project, 'src/nested');
  mkdirSync(nested, { recursive: true });
  f.git(['config', 'core.hooksPath', 'hooks with spaces']);
  f.hook(join(f.project, 'hooks with spaces'));
  const r = f.inspect(nested);
  samePath(r.hookCwd, f.project);
  samePath(r.hooksPath, join(f.project, 'hooks with spaces'));
  assert.equal(f.cli(nested).status, 0);
});

test('absolute external hook paths are inspected read-only and never relocated', t => {
  const f = fixture(t), hooks = join(f.base, 'shared hooks');
  f.hook(hooks);
  const bytes = readFileSync(join(hooks, 'post-commit'));
  f.git(['config', 'core.hooksPath', hooks]);
  samePath(f.inspect().hooksPath, hooks);
  assert.equal(f.cli().status, 0);
  assert.deepEqual(readFileSync(join(hooks, 'post-commit')), bytes);
  assert.equal(existsSync(join(f.project, '.git/hooks')), false);
});

test('global, include-file, tilde and local override values follow Git precedence', t => {
  const f = fixture(t), shared = join(f.home, 'shared hooks');
  f.hook(shared);
  f.git(['config', '--global', 'core.hooksPath', '~/shared hooks']);
  samePath(f.inspect().hooksPath, shared);
  const included = join(f.base, 'included.config');
  writeFileSync(included, '[core]\n\thooksPath = .included-hooks\n');
  f.git(['config', 'include.path', included]);
  samePath(f.inspect().hooksPath, join(f.project, '.included-hooks'));
  f.git(['config', '--unset', 'include.path']);
  f.git(['config', 'core.hooksPath', '.local-hooks']);
  samePath(f.inspect().hooksPath, join(f.project, '.local-hooks'));
});

test('linked worktree resolves shared default hooks and worktree-specific relative hooks', t => {
  const f = fixture(t), worktree = join(f.base, 'linked tree');
  f.git(['commit', '--quiet', '--allow-empty', '-m', 'fixture: initial']);
  f.git(['worktree', 'add', '--quiet', '-b', 'fixture-linked', worktree]);
  assert.ok(readFileSync(join(worktree, '.git'), 'utf8').startsWith('gitdir:'));
  samePath(f.inspect(worktree).hooksPath, join(f.project, '.git/hooks'));
  f.git(['config', 'core.hooksPath', '.shared-relative']);
  samePath(f.inspect(worktree).hooksPath, join(worktree, '.shared-relative'));
  f.git(['config', 'extensions.worktreeConfig', 'true']);
  f.git(['config', '--worktree', 'core.hooksPath', '.per-tree-hooks'], worktree);
  f.hook(join(worktree, '.per-tree-hooks'));
  samePath(f.inspect(worktree).hooksPath, join(worktree, '.per-tree-hooks'));
  assert.equal(f.cli(worktree).status, 0);
  f.git(['commit', '--quiet', '--allow-empty', '-m', 'fixture: linked capture'], worktree);
  assert.equal(readFileSync(join(worktree, '.hook-fired'), 'utf8'), 'fired\n');
  assert.equal(existsSync(join(f.project, '.git/hooks')), false);
});

test('missing configured hook never falls back to a present default', t => {
  const f = fixture(t);
  f.hook(join(f.project, '.git/hooks'));
  f.git(['config', 'core.hooksPath', '.missing']);
  const r = f.inspect();
  samePath(r.hooksPath, join(f.project, '.missing'));
  assert.equal(r.postCommit.status, 'missing');
  assert.equal(f.cli().status, 1);
  assert.equal(existsSync(r.hooksPath), false);
});

test('disabled, malformed and non-repository inputs fail verification without repair', t => {
  const f = fixture(t);
  f.git(['config', 'core.hooksPath', '/dev/null']);
  assert.equal(f.inspect().directoryState, 'disabled');
  assert.equal(f.cli().status, 1);
  f.git(['config', 'core.hooksPath', 'not-a-directory']);
  writeFileSync(join(f.project, 'not-a-directory'), 'do not replace');
  assert.equal(f.inspect().directoryState, 'not-directory');
  assert.equal(f.cli().status, 1);
  assert.throws(() => f.inspect(f.base), /discovery failed/);
  // A malformed config is not an unset config, and must never select default hooks.
  writeFileSync(join(f.project, '.git/config'), '[malformed\n');
  assert.throws(() => f.inspect(), /discovery failed/);
  assert.equal(f.cli().status, 1);
});

test('non-file and non-executable post-commit do not pass existence-only verification', t => {
  const f = fixture(t), hooks = join(f.project, '.githooks');
  f.git(['config', 'core.hooksPath', '.githooks']);
  mkdirSync(join(hooks, 'post-commit'), { recursive: true });
  assert.equal(f.inspect().postCommit.status, 'not-file');
  assert.equal(f.cli().status, 1);
  rmSync(join(hooks, 'post-commit'), { recursive: true });
  const hook = f.hook(hooks);
  if (process.platform !== 'win32') {
    chmodSync(hook, 0o644);
    assert.equal(f.inspect().postCommit.executable, false);
    assert.equal(f.cli().status, 1);
  }
  assert.deepEqual(readdirSync(hooks), ['post-commit']);
});

test('bare repositories are inventoried but not claimed as supported capture installs', t => {
  const f = fixture(t), bare = join(f.base, 'bare.git');
  f.git(['init', '--bare', '--quiet', '--template=', bare]);
  f.hook(join(bare, 'hooks'));
  const r = f.inspect(bare);
  assert.equal(r.bare, true);
  samePath(r.hooksPath, join(bare, 'hooks'));
  assert.equal(f.cli(bare).status, 1);
});
