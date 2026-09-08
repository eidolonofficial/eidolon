// Read-only Git-native post-commit discovery. Never creates, invokes or repairs hooks.
import { spawnSync } from 'node:child_process';
import { accessSync, constants, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function inspectGitHooks(project = '.', { env = process.env } = {}) {
  const cwd = resolve(project);
  function git(at, args, allowUnset = false) {
    const r = spawnSync('git', ['-C', at, ...args], {
      env, encoding: 'utf8', timeout: 10000, windowsHide: true,
    });
    if (allowUnset && r.status === 1 && !r.stdout && !r.stderr) return null;
    if (r.error || r.status !== 0) {
      throw new Error(`Git hook discovery failed (${args.join(' ')}, exit ${r.status ?? 'unavailable'}); no default path assumed.`);
    }
    return r.stdout;
  }

  // Read the effective config first, including global/includes/worktree overrides.
  // -z preserves spaces; --path asks Git to expand tilde/prefix path syntax.
  const raw = git(cwd, ['config', '--path', '--null', '--get', 'core.hooksPath'], true);
  const configuredHooksPath = raw === null ? null : raw.replace(/\0$/, '');
  if (configuredHooksPath === '') throw new Error('Empty core.hooksPath is ambiguous; no default path assumed.');
  const line = s => s.replace(/\r?\n$/, '');
  const bare = line(git(cwd, ['rev-parse', '--is-bare-repository'])) === 'true';
  const hookCwd = line(git(cwd, bare
    ? ['rev-parse', '--absolute-git-dir'] : ['rev-parse', '--show-toplevel']));
  if (!isAbsolute(hookCwd)) throw new Error('Git did not resolve an absolute hook working directory.');

  // The capture template requires a worktree. Bare repositories are inventoried,
  // but --check-post-commit never presents them as supported capture installs.
  if (configuredHooksPath === '/dev/null') return {
    bare, hookCwd, configuredHooksPath, hooksPath: '/dev/null', directoryState: 'disabled', hooks: [],
    postCommit: { path: null, status: 'disabled', executable: false },
  };
  const hooksPath = line(git(hookCwd, ['rev-parse', '--path-format=absolute', '--git-path', 'hooks']));
  if (!isAbsolute(hooksPath)) throw new Error('Git did not resolve an absolute hooks path; no default path assumed.');
  const postCommit = { path: join(hooksPath, 'post-commit'), status: 'missing', executable: false };
  const result = { bare, hookCwd, configuredHooksPath, hooksPath, directoryState: 'present', hooks: [], postCommit };
  const failure = e => e.code === 'ENOENT' ? 'missing' : e.code === 'ENOTDIR' ? 'not-directory' : 'inaccessible';
  try {
    if (!statSync(hooksPath).isDirectory()) {
      result.directoryState = postCommit.status = 'not-directory';
      return result;
    }
    result.hooks = readdirSync(hooksPath, { withFileTypes: true })
      .filter(e => (e.isFile() || e.isSymbolicLink()) && !e.name.endsWith('.sample'))
      .map(e => e.name).sort();
  } catch (e) {
    result.directoryState = postCommit.status = failure(e);
    return result;
  }
  try {
    if (!statSync(postCommit.path).isFile()) postCommit.status = 'not-file';
    else {
      accessSync(postCommit.path, constants.R_OK);
      postCommit.status = 'present';
      try { accessSync(postCommit.path, constants.X_OK); postCommit.executable = true; } catch { /* report only */ }
    }
  } catch (e) { postCommit.status = failure(e); }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const check = args.includes('--check-post-commit');
    const paths = args.filter(s => s !== '--check-post-commit');
    if (paths.length > 1 || paths.some(s => s.startsWith('-')) || args.length > paths.length + Number(check)) {
      throw new Error('Usage: node inspect-git-hooks.mjs [project] [--check-post-commit]');
    }
    const result = inspectGitHooks(paths[0]);
    console.log(JSON.stringify(result, null, 2));
    if (check && (result.bare || result.postCommit.status !== 'present' || !result.postCommit.executable)) process.exitCode = 1;
  } catch (e) {
    console.error(JSON.stringify({ error: e.message }));
    process.exitCode = 1;
  }
}
