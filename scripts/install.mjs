// Dependency-free, byte-preserving installer for Claude Code.
// Dry-run unless --yes; replacing an existing skill also requires --replace.
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  realpathSync, renameSync, rmSync, writeFileSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { confinedPath } from '../hooks/confined-path.mjs';
import {MANIFEST, stable, handlerKeys} from '../hooks/policy-manifest.mjs';
import {SHELL_TOOLS, DISPATCH_TOOLS} from '../hooks/operation.mjs';

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.git', '.github', '.claude', '.eidolon', '.venv', '__pycache__', 'node_modules', '.ci-evidence']);
const PROJECT_DIR = '${CLAUDE_PROJECT_DIR}';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
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
function bundle(source) {
  const files = inventory(source, true);
  if (!files.has('SKILL.md')) throw Error('Bundle has no SKILL.md');
  return files;
}
// Verify every bundled file against a vendor lock: {sources:{name:commit}, files:{'name/rel/path':sha256}}.
function verifyLock(lockPath, sources) {
  let lock;
  try { lock = JSON.parse(readFileSync(resolve(lockPath), 'utf8').replace(/^\uFEFF/, '')); }
  catch (e) { throw Error('Cannot read lock file ' + lockPath + ': ' + e.message); }
  if (!lock || typeof lock.files !== 'object' || !lock.files || typeof lock.sources !== 'object' || !lock.sources) throw Error('Invalid lock file ' + lockPath + ': expected sources and files objects');
  for (const { name, source } of sources) {
    if (!Object.hasOwn(lock.sources, name)) throw Error('Lock file does not cover source ' + name);
    const actual = inventory(resolve(source), true);
    for (const [rel, file] of actual) {
      const key = name + '/' + rel;
      if (!Object.hasOwn(lock.files, key)) throw Error('Source file is not in the lock: ' + key);
      if (hash(file.bytes) !== lock.files[key]) throw Error('Source file does not match the lock: ' + key);
    }
    for (const key of Object.keys(lock.files)) if (key.startsWith(name + '/') && !actual.has(key.slice(name.length + 1))) throw Error('Locked source file is missing: ' + key);
  }
}
// Minimal unified diff (LCS, 3 lines of context); inputs are small configuration files.
function unifiedDiff(before, after, name) {
  const split = s => { if (!s) return []; const l = s.split('\n'); if (l.at(-1) === '') l.pop(); return l; };
  const a = split(before), b = split(after), n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { ops.push([' ', a[i]]); i++; j++; }
    else if (i < n && (j === m || dp[i + 1][j] >= dp[i][j + 1])) ops.push(['-', a[i++]]);
    else ops.push(['+', b[j++]]);
  }
  const changes = ops.flatMap((o, p) => o[0] === ' ' ? [] : [p]);
  if (!changes.length) return '';
  const CONTEXT = 3, groups = []; let [start, end] = [changes[0], changes[0]];
  for (const p of changes.slice(1)) { if (p - end <= 2 * CONTEXT + 1) end = p; else { groups.push([start, end]); start = end = p; } }
  groups.push([start, end]);
  const aBefore = [0], bBefore = [0];
  for (const [kind] of ops) { aBefore.push(aBefore.at(-1) + (kind === '+' ? 0 : 1)); bBefore.push(bBefore.at(-1) + (kind === '-' ? 0 : 1)); }
  const out = ['--- ' + (before ? 'a/' + name : '/dev/null'), '+++ b/' + name];
  for (const [s, e] of groups) {
    const lo = Math.max(0, s - CONTEXT), hi = Math.min(ops.length - 1, e + CONTEXT), slice = ops.slice(lo, hi + 1);
    const aCount = slice.filter(o => o[0] !== '+').length, bCount = slice.filter(o => o[0] !== '-').length;
    out.push('@@ -' + (aCount ? aBefore[lo] + 1 : aBefore[lo]) + ',' + aCount + ' +' + (bCount ? bBefore[lo] + 1 : bBefore[lo]) + ',' + bCount + ' @@');
    for (const [kind, line] of slice) out.push(kind + line);
  }
  return out.join('\n') + '\n';
}
// Create a directory tree and report the topmost directory this call made, so a failed run can undo it.
function mkdirTracked(dir, created) {
  let top = null;
  for (let d = resolve(dir); !existsSync(d); d = dirname(d)) top = d;
  mkdirSync(dir, { recursive: true });
  if (top) created.push(top);
}
function pruneEmpty(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) { const child = join(dir, name); if (lstatSync(child).isDirectory()) pruneEmpty(child); }
  if (!readdirSync(dir).length) rmSync(dir, { recursive: true });
}
function readJson(path) {
  if (!existsSync(path)) return {};
  const value = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  if (!value || Array.isArray(value) || typeof value !== 'object') throw Error('Configuration must be an object');
  return value;
}
// A handler is Eidolon-owned when any token of its command or args is one of our hook files.
const OWNED_HOOKS = new Set(['guard-bash.mjs', 'guard-write.mjs', 'guard-dispatch.mjs', 'post-tool-entry.mjs', 'subagent-start.mjs', 'subagent-stop.mjs']);
const isOwned = h => !!h && [h.command, ...(Array.isArray(h.args) ? h.args : [])].some(s =>
  typeof s === 'string' && s.split(/\s+/).some(tok => OWNED_HOOKS.has(basename(tok.replace(/["']/g, '').replaceAll('\\', '/')))));
// Owned handlers are dropped and the fresh groups take the place of the first dropped group; foreign groups never move.
function mergeGroups(config, groups) {
  config.hooks ??= {};
  if (Array.isArray(config.hooks) || typeof config.hooks !== 'object') throw Error('Invalid existing hooks');
  for (const [event, additions] of Object.entries(groups)) {
    const prior = config.hooks[event] ?? [];
    if (!Array.isArray(prior)) throw Error('Invalid existing hook groups');
    const kept = []; let at = -1;
    for (const group of prior) {
      if (!Array.isArray(group?.hooks) || !group.hooks.some(isOwned)) { kept.push(group); continue; }
      if (at < 0) at = kept.length;
      const foreign = group.hooks.filter(h => !isOwned(h));
      if (foreign.length) kept.push({ ...group, hooks: foreign });
    }
    kept.splice(at < 0 ? kept.length : at, 0, ...additions);
    config.hooks[event] = kept;
  }
  return config;
}
function markedText(path, block) {
  const before = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (before.includes(block)) return before;
  return before + (before && !before.endsWith('\n') ? '\n' : '') + '\n' + block + '\n';
}

export function planInstall({ sources = [{ name: 'eidolon', source: SOURCE }], project, home = homedir(), wireHooks = !!project, workType = 'standard', replace = false, lock } = {}) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw Error('Node.js 22 or newer is required; nothing was installed');
  if (!['standard','infrastructure'].includes(workType)) throw Error('Invalid work type');
  const root = realpathSync(resolve(project || home));
  if (project) {
    // Hooks wired at the home directory would apply to every project on the machine.
    const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
    let userHome = null; try { userHome = realpathSync(homedir()); } catch {}
    if (userHome && same(root, userHome)) throw Error('Refusing to install into the home directory; choose a project directory (use --home to install user skills)');
  }
  if (lock) verifyLock(lock, sources);
  const items = [], configurations = [];
  const textItem = (path, text) => items.push({ path: confinedPath(root, root, path), text, merge: true });
  for (const src of sources) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(src.name)) throw Error('Invalid skill name');
    const path = confinedPath(root, root, '.claude/skills/' + src.name);
    items.push({ path, files: bundle(resolve(src.source)), merge: false });
  }
  if (wireHooks) {
    if (!project || !sources.some(s => s.name === 'eidolon')) throw Error('Project hook wiring requires an Eidolon bundle');
    const path = join(root, '.claude', 'settings.json');
    const conf = readJson(path);
    const group = (matcher, file) => ({ matcher, hooks: [{ type: 'command', command: 'node', args: [PROJECT_DIR + '/.claude/skills/eidolon/hooks/' + file, '--project', PROJECT_DIR], timeout: 20 }] });
    const groups = {PreToolUse:[group(SHELL_TOOLS.join('|'),'guard-bash.mjs'),group('Write|Edit','guard-write.mjs'),group(DISPATCH_TOOLS.join('|'),'guard-dispatch.mjs')],PostToolUse:[group('Write|Edit','post-tool-entry.mjs')]};
    mergeGroups(conf, groups);
    conf.env = { ...conf.env, CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '1' }; conf.effortLevel = 'xhigh'; conf.maxEffortLevel = 'max';
    const gitRules = ['git push --force *', 'git push * --force *', 'git push -f *', 'git push * -f *', 'git config*core.hooksPath*', 'git filter-branch *', 'git filter-repo *'];
    const floor = [...gitRules.flatMap(r => ['Bash(' + r + ')', 'PowerShell(' + r + ')']), 'Write(**/.claude/settings.local.json)', 'Edit(**/.claude/settings.local.json)'];
    for (const tool of ['Write','Edit']) for (const target of ['**/.claude/skills/eidolon/**','**/.eidolon/policy-manifest.json','**/.eidolon/sessions/**','**/.claude/eidolon-manifest.yaml']) floor.push(tool+'('+target+')');
    conf.permissions ??= {}; conf.permissions.deny = [...new Set([...(conf.permissions.deny || []), ...floor])];
    textItem(path, json(conf));
    configurations.push({path:'.claude/settings.json',handlers:[...handlerKeys({hooks:groups})],deny:[...new Set(floor)]});
  }
  if (project && wireHooks) {
    const previous=readJson(join(root,MANIFEST));
    const keep=Array.isArray(previous.configurations)?previous.configurations.filter(c=>!configurations.some(n=>n.path===c.path)):[];
    textItem(join(root,MANIFEST),json({version:1,owner:'Eidolon',workType,configurations:[...keep,...configurations],protectedPaths:['.claude/skills/eidolon',MANIFEST,'.claude/eidolon-manifest.yaml']}));
    const legacy=join(root,'.claude/eidolon-manifest.yaml');
    if (!existsSync(legacy)) textItem(legacy,'version: 1\npolicy_manifest: .eidolon/policy-manifest.json\n');
  }
  if (project) {
    const claudeGuide = [
      '## Eidolon for Claude Code',
      '',
      'Autonomous execution, consent-gated side effects. Claude is the engineer.',
      'Read .claude/skills/eidolon/SKILL.md for the native setup and build workflow.',
      'Read .claude/skills/eidolon/references/current-platform-contract.md before assuming host behavior.',
      'Inspect the real project before changing it. Reuse answered questions and preserve existing instructions.',
      'Name the outcome before starting. Run the check and observe the state change before calling it done.',
      'Preview installation first. Apply only the exact approved plan; require separate replacement consent and retain backups.',
      'Keep Claude native permission checks intact. Never bypass a denied hook or manufacture consent through another tool.',
      'Keep controller and worker identity separate. A worker cannot clear state belonging to another actor or inherit controller authority.',
      'Optional models and memory services require separate approval; preserve automatic-install holds.',
      'Write what broke to docs/fixes and what worked to docs/insights. Append or supersede history; retire only active guidance.',
      'Report executed evidence separately from inspection, native-client observations, and unresolved uncertainty.',
    ].join('\n');
    textItem(join(root, 'CLAUDE.md'), markedText(join(root, 'CLAUDE.md'), claudeGuide));
    textItem(join(root, '.gitignore'), markedText(join(root, '.gitignore'), '# Eidolon local state and rollback copies\n.eidolon/backups/\n.eidolon/sessions/\n.eidolon/tasks/\n.eidolon/install.lock/\n.claude/.drift-count\n.claude/.session-state\n.claude/.orient-gate.*.json'));
  }
  for (const item of items) item.original = fingerprint(item.path);
  const plan = {version:1, root, items, workType, replace,
    sourcePins:sources.map(src=>({name:src.name,path:realpathSync(resolve(src.source)),fingerprint:sourceFingerprint(src.source)}))};
  plan.digest=planDigest(plan); planSeals.set(plan,plan.digest); return plan;
}

function sourceFingerprint(source) {
  return hash([...inventory(resolve(source),true)].map(([key,v])=>key+':'+hash(v.bytes)+':'+(v.mode&0o111)).join('\n'));
}
export function planDigest(plan) {
  return hash(stable({version:plan.version,root:plan.root,sourcePins:plan.sourcePins,replace:plan.replace,workType:plan.workType,
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
export function applyPlan(plan, {dryRun=true,replace=false,beforeCommit,afterRename}={}) {
  const {root,items}=plan;
  assertFresh(plan);
  for(const item of items) if(!item.merge&&existsSync(item.path)&&(!replace||!plan.replace)) throw Error('Skill already exists; review it and use --replace to back it up before replacement');
  if(dryRun)return {dryRun:true,paths:items.map(i=>i.path),backups:null,planDigest:plan.digest,previews:previewsOf(plan)};
  const id=randomUUID(),prepared=[],changed=[],created=[];
  const backups=confinedPath(root,root,'.eidolon/backups/'+id), lock=confinedPath(root,root,'.eidolon/install.lock');
  mkdirTracked(dirname(lock),created);
  try {mkdirSync(lock);} catch {for(const dir of created)pruneEmpty(dir);throw Error('Another installation or an interrupted transaction holds .eidolon/install.lock. Inspect its owner and journal before recovery; nothing was replaced.');}
  durableJson(join(lock,'owner.json'),{pid:process.pid,planDigest:plan.digest,backups});
  let retainLock=false,failed=false;
  const journal={version:1,planDigest:plan.digest,root,phase:'staging',changes:[]};
  const persist=()=>{mkdirTracked(backups,created);durableJson(join(backups,'journal.json'),journal);};
  try {
    assertFresh(plan);
    for(let i=0;i<items.length;i++) {
      const item=items[i],stage=item.path+'.eidolon-stage-'+id;
      mkdirTracked(dirname(stage),created);
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
      if(item.original!==null){renameSync(item.path,item.backup);item.phase='backed-up';afterRename?.({index:i,path:item.path,step:'backup'});}
      journal.changes[i].phase='before-install';persist();
      renameSync(item.stage,item.path);item.phase='installed';journal.changes[i].phase='installed';persist();afterRename?.({index:i,path:item.path,step:'install'});
    }
    if(!changed.length){rmSync(backups,{recursive:true,force:true});return {dryRun:false,changed:0,paths:items.map(i=>i.path),backups:null,planDigest:plan.digest};}
    journal.phase='complete';persist();
    durableJson(join(backups,'receipt.json'),{createdAt:new Date().toISOString(),planDigest:plan.digest,changes:changed.map(x=>({path:x.path,backup:x.original===null?null:x.backup,installedSha256:x.installed}))});
    return {dryRun:false,changed:changed.length,paths:items.map(i=>i.path),backups,planDigest:plan.digest};
  } catch(error) {
    failed=true;const failures=[];
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
    if(failed)for(const dir of created)pruneEmpty(dir);
  }
}
function previewsOf(plan) {
  const out = [];
  for (const item of plan.items) {
    if (item.files) continue;
    const current = existsSync(item.path) ? readFileSync(item.path, 'utf8') : null;
    if (current === item.text) continue;
    const rel = relative(plan.root, item.path).replaceAll(sep, '/');
    out.push(rel === '.claude/settings.json' ? { path: item.path, diff: unifiedDiff(current, item.text, rel) } : { path: item.path, text: item.text });
  }
  return out;
}
export function install(options = {}) { const plan=planInstall(options); if(options.expectedPlan&&options.expectedPlan!==plan.digest)throw Error('Installation plan changed; review a new preview'); return applyPlan(plan, options); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), allowed = new Set(['--project', '--home', '--yes', '--replace', '--help', '--work-type', '--expect-plan', '--lock']);
    const options = { dryRun: true };
    for (let i = 0; i < args.length; i++) {
      const flag = args[i]; if (!allowed.has(flag)) throw Error('Unknown option');
      if (flag === '--help') { console.log('node scripts/install.mjs [--project PATH | --home PATH] [--yes] [--replace] [--lock vendor-lock.json]\nDefault: preview only. Home installs skills only; project installs also wire hooks.'); process.exit(0); }
      if (flag === '--yes') options.dryRun = false;
      else if (flag === '--replace') options.replace = true;
      else { const value = args[++i]; if (!value || value.startsWith('--')) throw Error('Missing option value'); options[flag==='--work-type'?'workType':flag==='--expect-plan'?'expectedPlan':flag.slice(2)] = value; }
    }
    if (options.project && options.home) throw Error('Choose project or home, not both');
    const result = install(options);
    if (!result.dryRun) console.log(json(result));
    else {
      console.log('EIDOLON INSTALL PREVIEW (nothing written)\nplan: ' + result.planDigest + '\n');
      for (const path of result.paths) {
        console.log(path);
        const preview = result.previews.find(p => p.path === path);
        if (preview) console.log((preview.diff ?? preview.text).trimEnd().split('\n').map(l => '    | ' + l).join('\n'));
      }
    }
  } catch (e) { console.error('EIDOLON INSTALL: ' + e.message); process.exitCode = 1; }
}
