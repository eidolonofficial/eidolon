// Dependency-free, byte-preserving installer for Claude Code and Codex.
// Dry-run unless --yes; replacing an existing skill also requires --replace.
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  realpathSync, renameSync, rmSync, writeFileSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { confinedPath } from '../hooks/codex-patch.mjs';
import {MANIFEST, stable, handlerKeys} from '../hooks/policy-manifest.mjs';
import {SHELL_TOOLS, DISPATCH_TOOLS} from '../hooks/operation.mjs';

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.git', '.github', '.agents', '.claude', '.codex', '.eidolon', '.venv', '__pycache__', 'node_modules', '.ci-evidence']);
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
      if (filtered && (SKIP.has(name) || name.includes('.eidolon-stage-'))) continue;
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
export function fingerprint(path) {
  if (!existsSync(path)) return null;
  if (lstatSync(path).isFile()) return hash(readFileSync(path));
  return hash([...inventory(path)].map(([key, v]) => key + ':' + hash(v.bytes) + ':' + (v.mode & 0o111)).join('\n'));
}
const planSeals = new WeakMap();
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

export function planInstall({ sources = [{ name: 'eidolon', source: SOURCE }], host = 'codex', project, home = homedir(), wireHooks = !!project, workType = 'standard', replace = false, dispatchContext = 'required' } = {}) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw Error('Node.js 22 or newer is required; nothing was installed');
  if (!['claude', 'codex', 'both'].includes(host)) throw Error('host must be claude, codex or both');
  if (!['standard','infrastructure'].includes(workType) || !['required','legacy'].includes(dispatchContext)) throw Error('Invalid work type');
  const root = realpathSync(resolve(project || home));
  const hosts = host === 'both' ? ['claude', 'codex'] : [host];
  const items = [], configurations = [];
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
      const commandWindows = process.platform === 'win32' ? 'node ' + [join(runtime, 'codex-entry.mjs'), '--project', root].map(winQuote).join(' ') : undefined;
      const handler = { type: 'command', command, commandWindows, timeout: 20, statusMessage: 'Eidolon policy checks' };
      const groups = Object.fromEntries(['PreToolUse', 'PermissionRequest', 'PostToolUse', 'SessionStart', 'PreCompact'].map(event => [event, [{ hooks: [handler] }]]));
      textItem(path, json(mergeGroups(readJson(path), groups)));
      configurations.push({path:'.codex/hooks.json', handlers:[...handlerKeys({hooks:groups})], deny:[]});
    } else {
      const path = join(root, '.claude', 'settings.json');
      const conf = readJson(path);
      const group = (matcher, file) => ({ matcher, hooks: [{ type: 'command', command: process.execPath, args: [join(runtime, file), '--project', root], timeout: 20 }] });
      const groups = {PreToolUse:[group(SHELL_TOOLS.join('|'),'guard-bash.mjs'),group('Write|Edit','guard-write.mjs'),group('.*advisor.*','advisor-guard.mjs'),group(DISPATCH_TOOLS.slice(0,2).join('|'),'guard-dispatch.mjs')],PostToolUse:[group('Write|Edit','post-tool-entry.mjs')]};
      mergeGroups(conf, groups);
      const floor = ['Bash(git push --force *)', 'Bash(git push * --force *)', 'Bash(git push -f *)', 'Bash(git push * -f *)', 'Bash(git config*core.hooksPath*)', 'Bash(git filter-branch *)', 'Bash(git filter-repo *)', 'Write(**/.claude/settings.local.json)', 'Edit(**/.claude/settings.local.json)'];
      for (const tool of ['Write','Edit']) for (const target of ['**/.claude/skills/eidolon/**','**/.agents/skills/eidolon/**','**/.eidolon/policy-manifest.json','**/.eidolon/sessions/**','**/.claude/security-grader-public.pem']) floor.push(tool+'('+target+')');
      for (const protectedPath of ['**/.claude/skills/eidolon/**','**/.agents/skills/eidolon/**','**/.eidolon/policy-manifest.json','**/.claude/security-grader-public.pem','**/.claude/eidolon-manifest.yaml']) for (const tool of ['Write','Edit']) floor.push(tool+'('+protectedPath+')');
      conf.permissions ??= {}; conf.permissions.deny = [...new Set([...(conf.permissions.deny || []), ...floor])];
      textItem(path, json(conf));
      configurations.push({path:'.claude/settings.json',handlers:[...handlerKeys({hooks:groups})],deny:[...new Set(floor)]});
    }
  }
  if (project && wireHooks) {
    const previous=readJson(join(root,MANIFEST));
    const keep=Array.isArray(previous.configurations)?previous.configurations.filter(c=>!configurations.some(n=>n.path===c.path)):[];
    textItem(join(root,MANIFEST),json({version:1,owner:'Eidolon',workType,dispatchContext,configurations:[...keep,...configurations],protectedPaths:['.claude/skills/eidolon','.agents/skills/eidolon',MANIFEST,'.claude/eidolon-manifest.yaml','.claude/security-grader-public.pem']}));
    const legacy=join(root,'.claude/eidolon-manifest.yaml');
    if (!existsSync(legacy)) textItem(legacy,'version: 1\npolicy_manifest: .eidolon/policy-manifest.json\n');
  }
  if (project) {
    const guide = '## Eidolon\nRead the installed references/orchestration-contract.md, then Eidolon SKILL.md before repository work. Preserve human consent gates.\nCodex: .agents/skills/eidolon/SKILL.md. Claude: .claude/skills/eidolon/SKILL.md.\nRun tests and report observed evidence. Never bypass a denied hook.\nCodex ask-tier operations remain blocked for manual operator review; a chat yes is not a bypass.';
    textItem(join(root, 'AGENTS.md'), markedText(join(root, 'AGENTS.md'), guide));
    if (hosts.includes('claude')) {
      const claudeGuide = [
        '## Eidolon for Claude Code',
        '',
        'Autonomous execution, consent-gated side effects. Claude is the engineer.',
        'Read .claude/skills/eidolon/SKILL.md for the native setup, build, and evolve workflow.',
        'Read .claude/skills/eidolon/references/current-platform-contract.md before assuming host behavior.',
        'Read .claude/skills/eidolon/references/orchestration-contract.md and .claude/skills/eidolon/references/persona-pipeline.md before dispatch.',
        'Choose the smallest sufficient skill set using .claude/skills/eidolon/references/skill-selection.md; work directly when delegation adds no evidence.',
        'Inspect the real project before changing it. Reuse answered questions and preserve existing instructions.',
        'Name the outcome before starting. Run the check and observe the state change before calling it done.',
        'Preview installation first. Apply only the exact approved plan; require separate replacement consent and retain backups.',
        'Keep Claude native permission checks intact. Never bypass a denied hook or manufacture consent through another tool.',
        'Keep controller and worker identity separate. A worker cannot clear state belonging to another actor or inherit controller authority.',
        'Before evolve work, read .claude/skills/eidolon/references/evolve-engine.md and .claude/skills/eidolon/engine/SECURITY.md. Approval binds to the exact plan digest, evaluator, inputs, runtime, and budget.',
        'Trusted-local execution is not an operating-system sandbox. Untrusted candidates require a disposable sandbox.',
        'Optional models and memory services require separate approval; preserve automatic-install holds.',
        'Write what broke to docs/fixes and what worked to docs/insights. Append or supersede history; retire only active guidance.',
        'Report executed evidence separately from inspection, native-client observations, and unresolved uncertainty.',
      ].join('\n');
      textItem(join(root, 'CLAUDE.md'), markedText(join(root, 'CLAUDE.md'), claudeGuide));
    }
    textItem(join(root, '.gitignore'), markedText(join(root, '.gitignore'), '# Eidolon local state and rollback copies\n.eidolon/backups/\n.eidolon/sessions/\n.eidolon/tasks/\n.eidolon/engine-approvals/\n.evolve_runs/\n.eidolon/install.lock/\n.claude/.drift-count\n.claude/.session-state\n.claude/.orient-gate.*.json'));
  }
  for (const item of items) item.original = fingerprint(item.path);
  const plan = {version:1, root, items, host, workType, dispatchContext, replace,
    sourcePins:sources.map(src=>({name:src.name,path:realpathSync(resolve(src.source)),fingerprint:sourceFingerprint(src.source)}))};
  plan.digest=planDigest(plan); planSeals.set(plan,plan.digest); return plan;
}

function sourceFingerprint(source) {
  return hash([...inventory(resolve(source),true)].map(([key,v])=>key+':'+hash(v.bytes)+':'+(v.mode&0o111)).join('\n'));
}
export function planDigest(plan) {
  return hash(stable({version:plan.version,root:plan.root,sourcePins:plan.sourcePins,replace:plan.replace,host:plan.host,workType:plan.workType,dispatchContext:plan.dispatchContext,
    items:plan.items.map(i=>({path:i.path,original:i.original,merge:i.merge,text:i.text,files:i.files?[...i.files].map(([name,f])=>[name,hash(f.bytes),f.mode]):null}))}));
}
function assertFresh(plan) {
  if(plan.version!==1 || planSeals.get(plan)!==plan.digest || plan.digest!==planDigest(plan)) throw Error('Installation plan changed; review a new preview');
  for(const source of plan.sourcePins) if(realpathSync(source.path)!==source.path || sourceFingerprint(source.path)!==source.fingerprint) throw Error('Installation source changed; review a new preview');
  for(const item of plan.items) {
    confinedPath(plan.root,plan.root,item.path);
    if(fingerprint(item.path)!==item.original) throw Error('Destination changed during installation or since preview; review a new preview');
  }
}
function durableJson(path,value) {
  const stage=path+'.journal-stage-'+randomUUID();
  const fd=openSync(stage,'wx',0o600);
  try {writeFileSync(fd,json(value),'utf8');fsyncSync(fd);} finally {closeSync(fd);}
  try {
    renameSync(stage,path);
    if(process.platform!=='win32') {
      const dir=openSync(dirname(path),'r');try{fsyncSync(dir);}finally{closeSync(dir);}
    }
  } finally {if(existsSync(stage))rmSync(stage);}
}
export function applyPlan(plan, {dryRun=true,replace=false,beforeCommit}={}) {
  const {root,items}=plan;
  assertFresh(plan);
  for(const item of items) if(!item.merge&&existsSync(item.path)&&(!replace||!plan.replace)) throw Error('Skill already exists; review it and use --replace to back it up before replacement');
  if(dryRun)return {dryRun:true,paths:items.map(i=>i.path),backups:null,planDigest:plan.digest};
  const id=randomUUID(),prepared=[],changed=[];
  const backups=confinedPath(root,root,'.eidolon/backups/'+id), lock=confinedPath(root,root,'.eidolon/install.lock');
  mkdirSync(dirname(lock),{recursive:true});
  try {mkdirSync(lock);} catch {throw Error('Another installation or an interrupted transaction holds .eidolon/install.lock. Inspect its owner and journal before recovery; nothing was replaced.');}
  durableJson(join(lock,'owner.json'),{pid:process.pid,planDigest:plan.digest,backups});
  let retainLock=false;
  const journal={version:1,planDigest:plan.digest,root,phase:'staging',changes:[]};
  const persist=()=>{mkdirSync(backups,{recursive:true});durableJson(join(backups,'journal.json'),journal);};
  try {
    assertFresh(plan);
    for(let i=0;i<items.length;i++) {
      const item=items[i],stage=item.path+'.eidolon-stage-'+id;
      mkdirSync(dirname(stage),{recursive:true});
      const record={...item,stage,backup:join(backups,String(i)),phase:'staged'};prepared.push(record);
      if(item.files) {
        mkdirSync(stage);
        for(const [name,file] of item.files) {const target=join(stage,name);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,file.bytes);chmodSync(target,file.mode);if(hash(readFileSync(target))!==hash(file.bytes))throw Error('Staged byte verification failed');}
        if(inventory(stage).size!==item.files.size)throw Error('Incomplete staged bundle');
      } else writeFileSync(stage,item.text,'utf8');
      record.installed=fingerprint(stage);
    }
    beforeCommit?.();
    assertFresh(plan);
    for(const item of prepared) {confinedPath(root,root,item.stage);if(fingerprint(item.stage)!==item.installed)throw Error('Staged installation changed; no reviewed bytes were replaced');}
    journal.phase='applying';
    journal.changes=prepared.map(x=>({path:x.path,stage:x.stage,backup:x.original===null?null:x.backup,original:x.original,installedSha256:x.installed,phase:x.phase}));persist();
    for(let i=0;i<prepared.length;i++) {
      const item=prepared[i];
      confinedPath(root,root,item.stage);
      if(fingerprint(item.stage)!==item.installed)throw Error('Staged installation changed before commit');
      confinedPath(root,root,item.path);
      if(fingerprint(item.path)!==item.original)throw Error('Destination changed during installation');
      if(item.original===item.installed){rmSync(item.stage,{recursive:true,force:true});journal.changes[i].phase='unchanged';persist();continue;}
      changed.push(item);journal.changes[i].phase='before-backup';persist();
      if(item.original!==null){renameSync(item.path,item.backup);item.phase='backed-up';}
      journal.changes[i].phase='before-install';persist();
      renameSync(item.stage,item.path);item.phase='installed';journal.changes[i].phase='installed';persist();
    }
    journal.phase='complete';persist();
    durableJson(join(backups,'receipt.json'),{createdAt:new Date().toISOString(),planDigest:plan.digest,changes:changed.map(x=>({path:x.path,backup:x.original===null?null:x.backup,installedSha256:x.installed}))});
    return {dryRun:false,changed:changed.length,paths:items.map(i=>i.path),backups,planDigest:plan.digest};
  } catch(error) {
    const failures=[];
    for(const item of [...changed].reverse()) {
      try {
        const now=fingerprint(item.path);
        if(item.phase==='installed') {
          if(now!==item.installed)throw Error('Concurrent content must be preserved');
          rmSync(item.path,{recursive:true,force:true});
        } else if(now!==null) {
          if(item.phase==='staged'&&now===item.original)continue;
          throw Error('Concurrent target must be preserved');
        }
        if(item.original!==null&&existsSync(item.backup))renameSync(item.backup,item.path);
      } catch {failures.push(item.path);}
    }
    if(existsSync(backups)){journal.phase=failures.length?'recovery-required':'rolled-back';journal.recoveryPaths=failures;persist();}
    if(failures.length){retainLock=true;throw Error('Install stopped. Concurrent content was preserved; manual recovery is required. Journal and backups: '+backups);}
    throw error;
  } finally {
    for(const item of prepared)if(existsSync(item.stage))rmSync(item.stage,{recursive:true,force:true});
    if(!retainLock)rmSync(lock,{recursive:true});
  }
}
export function install(options = {}) { const plan=planInstall(options); if(options.expectedPlan&&options.expectedPlan!==plan.digest)throw Error('Installation plan changed; review a new preview'); return applyPlan(plan, options); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), allowed = new Set(['--host', '--project', '--home', '--yes', '--replace', '--help', '--work-type', '--dispatch-context', '--expect-plan']);
    const options = { dryRun: true };
    for (let i = 0; i < args.length; i++) {
      const flag = args[i]; if (!allowed.has(flag)) throw Error('Unknown option');
      if (flag === '--help') { console.log('node scripts/install.mjs --host codex|claude|both [--project PATH | --home PATH] [--yes] [--replace]\nDefault: preview only. Home installs skills only; project installs also wire hooks.'); process.exit(0); }
      if (flag === '--yes') options.dryRun = false;
      else if (flag === '--replace') options.replace = true;
      else { const value = args[++i]; if (!value || value.startsWith('--')) throw Error('Missing option value'); options[flag==='--work-type'?'workType':flag==='--expect-plan'?'expectedPlan':flag==='--dispatch-context'?'dispatchContext':flag.slice(2)] = value; }
    }
    if (options.project && options.home) throw Error('Choose project or home, not both');
    console.log(json(install(options)));
  } catch (e) { console.error('EIDOLON INSTALL: ' + e.message); process.exitCode = 1; }
}
