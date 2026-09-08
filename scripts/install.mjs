// Dependency-free, byte-preserving installer for Claude Code and Codex.
// Dry-run unless --yes; replacing an existing skill also requires --replace.
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { confinedPath } from '../hooks/codex-patch.mjs';

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.git', '.github', '.agents', '.claude', '.codex', '.eidolon', '.venv', '__pycache__', 'node_modules']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const shQuote = value => "'" + value.replace(/'/g, "'\\''") + "'";
function winQuote(value) {
  if (/[\r\n"$`%!&|<>^]/.test(value)) throw Error('This Windows path contains unsupported shell characters');
  return '"' + value + '"';
}
export function inventory(root, filtered = false) {
  const files = new Map();
  function walk(dir, rel = '') {
    for (const name of readdirSync(dir).sort()) {
      if (filtered && SKIP.has(name)) continue;
      const path = join(dir, name), key = rel ? rel + '/' + name : name;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw Error('Symlinked source or destination is not supported');
      if (stat.isDirectory()) walk(path, key);
      else if (stat.isFile()) files.set(key, { bytes: readFileSync(path), mode: stat.mode & 0o777 });
      else throw Error('Special files are not supported');
    }
  }
  walk(root); return files;
}
function fingerprint(path) {
  if (!existsSync(path)) return null;
  if (lstatSync(path).isFile()) return hash(readFileSync(path));
  return hash([...inventory(path)].map(([key, v]) => key + ':' + hash(v.bytes) + ':' + (v.mode & 0o111)).join('\n'));
}
function bundle(source, host) {
  const files = inventory(source, true);
  if (!files.has('SKILL.md')) throw Error('Bundle has no SKILL.md');
  if (host === 'claude' && files.has('references/claude-workflow.md')) files.set('SKILL.md', files.get('references/claude-workflow.md'));
  if (host === 'codex') {
    const adapter = files.get('codex/SKILL.md');
    if (!adapter) throw Error('Bundle has no Codex skill adapter');
    if (!files.has('references/claude-workflow.md')) files.set('references/claude-workflow.md', files.get('SKILL.md'));
    files.set('SKILL.md', adapter);
  }
  return files;
}
function readJson(path) {
  if (!existsSync(path)) return {};
  const value = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  if (!value || Array.isArray(value) || typeof value !== 'object') throw Error('Configuration must be an object');
  return value;
}
function mergeGroups(config, groups) {
  config.hooks ??= {};
  if (Array.isArray(config.hooks) || typeof config.hooks !== 'object') throw Error('Invalid existing hooks');
  for (const [event, additions] of Object.entries(groups)) {
    const prior = config.hooks[event] ?? [];
    if (!Array.isArray(prior)) throw Error('Invalid existing hook groups');
    const keys = new Set(prior.map(x => JSON.stringify(x)));
    config.hooks[event] = [...prior, ...additions.filter(x => !keys.has(JSON.stringify(x)))];
  }
  return config;
}
function markedText(path, block) {
  const before = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (before.includes(block)) return before;
  return before + (before && !before.endsWith('\n') ? '\n' : '') + '\n' + block + '\n';
}

export function planInstall({ sources = [{ name: 'eidolon', source: SOURCE }], host = 'codex', project, home = homedir(), wireHooks = !!project } = {}) {
  if (!['claude', 'codex', 'both'].includes(host)) throw Error('host must be claude, codex or both');
  const root = realpathSync(resolve(project || home));
  const hosts = host === 'both' ? ['claude', 'codex'] : [host];
  const items = [];
  const textItem = (path, text) => items.push({ path: confinedPath(root, root, path), text, merge: true });
  for (const targetHost of hosts) {
    const parent = targetHost === 'codex' ? '.agents/skills' : '.claude/skills';
    for (const src of sources) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(src.name)) throw Error('Invalid skill name');
      const path = confinedPath(root, root, parent + '/' + src.name);
      items.push({ path, files: bundle(resolve(src.source), targetHost), merge: false });
    }
    if (!wireHooks) continue;
    if (!project || !sources.some(s => s.name === 'eidolon')) throw Error('Project hook wiring requires an Eidolon bundle');
    const runtime = join(root, parent, 'eidolon', 'hooks');
    if (targetHost === 'codex') {
      const path = join(root, '.codex', 'hooks.json');
      const command = [process.execPath, join(runtime, 'codex-entry.mjs'), '--project', root].map(shQuote).join(' ');
      // 'node' is unquoted so this works in both cmd.exe and PowerShell; Node must be on PATH.
      const commandWindows = 'node ' + [join(runtime, 'codex-entry.mjs'), '--project', root].map(winQuote).join(' ');
      const handler = { type: 'command', command, commandWindows, timeout: 20, statusMessage: 'Eidolon policy checks' };
      const groups = Object.fromEntries(['PreToolUse', 'PostToolUse', 'SessionStart', 'PreCompact'].map(event => [event, [{ hooks: [handler] }]]));
      textItem(path, json(mergeGroups(readJson(path), groups)));
    } else {
      const path = join(root, '.claude', 'settings.json');
      const conf = readJson(path);
      const group = (matcher, file) => ({ matcher, hooks: [{ type: 'command', command: process.execPath, args: [join(runtime, file)], timeout: 20 }] });
      mergeGroups(conf, { PreToolUse: [group('Bash', 'guard-bash.mjs'), group('Write|Edit', 'guard-write.mjs'),
        group('.*advisor.*', 'advisor-guard.mjs'), group('Task|Agent', 'dispatch-attestation-guard.mjs')] });
      const floor = ['Bash(git push --force *)', 'Bash(git push * --force *)', 'Bash(git push -f *)', 'Bash(git push * -f *)', 'Bash(git config*core.hooksPath*)', 'Bash(git filter-branch *)', 'Bash(git filter-repo *)', 'Write(**/.claude/settings.local.json)', 'Edit(**/.claude/settings.local.json)'];
      conf.permissions ??= {}; conf.permissions.deny = [...new Set([...(conf.permissions.deny || []), ...floor])];
      textItem(path, json(conf));
    }
  }
  if (project) {
    const guide = '## Eidolon\nRead the installed Eidolon SKILL.md before repository work. Preserve human consent gates.\nCodex: .agents/skills/eidolon/SKILL.md. Claude: .claude/skills/eidolon/SKILL.md.\nRun tests and report observed evidence. Never bypass a denied hook.\nCodex ask-tier operations remain blocked for manual operator review; a chat yes is not a bypass.';
    textItem(join(root, 'AGENTS.md'), markedText(join(root, 'AGENTS.md'), guide));
    if (hosts.includes('claude')) textItem(join(root, 'CLAUDE.md'), markedText(join(root, 'CLAUDE.md'), '@AGENTS.md'));
    textItem(join(root, '.gitignore'), markedText(join(root, '.gitignore'), '# Eidolon local state and rollback copies\n.eidolon/backups/\n.eidolon/sessions/\n.claude/.drift-count\n.claude/.session-state\n.claude/.orient-gate.*.json'));
  }
  return { root, items };
}

export function applyPlan({ root, items }, { dryRun = true, replace = false, beforeCommit } = {}) {
  const id = randomUUID(); const prepared = [], changed = [];
  const backups = confinedPath(root, root, '.eidolon/backups/' + id);
  // Fail before writing anything on a collision without explicit replacement consent.
  for (const item of items) {
    confinedPath(root, root, item.path);
    if (!item.merge && existsSync(item.path) && !replace) throw Error('Skill already exists; review it and use --replace to back it up before replacement');
    item.original = fingerprint(item.path);
  }
  if (dryRun) return { dryRun: true, paths: items.map(x => x.path), backups: null };
  try {
    // Prepare every item first. No target is changed by a partial copy.
    for (let i = 0; i < items.length; i++) {
      const item = items[i]; const stage = item.path + '.eidolon-stage-' + id;
      mkdirSync(dirname(stage), { recursive: true });
      prepared.push({ ...item, stage, backup: join(backups, String(i)) });
      if (item.files) {
        mkdirSync(stage);
        for (const [name, file] of item.files) {
          const target = join(stage, name); mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, file.bytes); chmodSync(target, file.mode);
          if (hash(readFileSync(target)) !== hash(file.bytes)) throw Error('Staged byte verification failed');
        }
        if (inventory(stage).size !== item.files.size) throw Error('Incomplete staged bundle');
      } else writeFileSync(stage, item.text, 'utf8');
    }
    beforeCommit?.(); // deterministic fault injection for rollback tests; not exposed by the CLI
    for (const item of prepared) {
      confinedPath(root, root, item.path);
      if (fingerprint(item.path) !== item.original) throw Error('Destination changed during installation');
      if (item.original === fingerprint(item.stage)) { rmSync(item.stage, { recursive: true, force: true }); continue; }
      mkdirSync(backups, { recursive: true });
      if (item.original !== null) renameSync(item.path, item.backup);
      changed.push(item);
      renameSync(item.stage, item.path);
    }
    if (changed.length) {
      writeFileSync(join(backups, 'receipt.json'), json({ createdAt: new Date().toISOString(),
        changes: changed.map(x => ({ path: x.path, backup: x.original === null ? null : x.backup,
          installedSha256: fingerprint(x.path) })) }));
    }
    return { dryRun: false, changed: changed.length, paths: items.map(x => x.path), backups: changed.length ? backups : null };
  } catch (error) {
    const failures = [];
    for (const item of changed.reverse()) {
      try { rmSync(item.path, { recursive: true, force: true }); if (item.original !== null) renameSync(item.backup, item.path); }
      catch { failures.push(item.path); }
    }
    if (failures.length) throw Error('Install failed and rollback needs manual recovery. Backups retained at ' + backups);
    throw error;
  } finally {
    for (const item of prepared) if (existsSync(item.stage)) rmSync(item.stage, { recursive: true, force: true });
  }
}
export function install(options = {}) { return applyPlan(planInstall(options), options); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), allowed = new Set(['--host', '--project', '--home', '--yes', '--replace', '--help']);
    const options = { dryRun: true };
    for (let i = 0; i < args.length; i++) {
      const flag = args[i]; if (!allowed.has(flag)) throw Error('Unknown option');
      if (flag === '--help') { console.log('node scripts/install.mjs --host codex|claude|both [--project PATH | --home PATH] [--yes] [--replace]\nDefault: preview only. Home installs skills only; project installs also wire hooks.'); process.exit(0); }
      if (flag === '--yes') options.dryRun = false;
      else if (flag === '--replace') options.replace = true;
      else { const value = args[++i]; if (!value || value.startsWith('--')) throw Error('Missing option value'); options[flag.slice(2)] = value; }
    }
    if (options.project && options.home) throw Error('Choose project or home, not both');
    console.log(json(install(options)));
  } catch (e) { console.error('EIDOLON INSTALL: ' + e.message); process.exitCode = 1; }
}
