// Tests for the native pipeline hooks (N1 to N8, 2026-10-13): dispatch gates, lanes,
// SubagentStart/SubagentStop, hook-edit posture and leftovers. Every case drives the
// wired entry point in a throwaway git repo with crafted hook JSON, as Claude Code does.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync, execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync, realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {touchesHookSuite} from './lib.mjs';
import {protectedKind} from './shell-operation.mjs';

const HOOKS = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(HOOKS);
const SCOPES = {
  builder: {read: ['src/**', 'docs/'], write: ['src/**', 'docs/notes/', 'hooks/x.mjs']},
  scout: {read: ['**'], write: []},
  'code-reviewer': {read: ['**'], write: ['reports/**']},
};
const WORKER = {agent_id: 'w1', agent_type: 'builder'};
const DONE = 'Change src/a.ts.\nDone-check: node --test exits 0.';

function repo(t, {scopes = SCOPES, wave = true} = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'eidolon-pipe-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  execFileSync('git', ['init', '-q'], {cwd: root});
  const put = (path, text) => { const file = join(root, path); mkdirSync(dirname(file), {recursive: true}); writeFileSync(file, text); };
  put('hooks/lib.mjs', '// fixture\n');
  put('src/a.ts', 'export {};\n');
  put('.claude/settings.json', '{}\n');
  if (scopes) put('.claude/agent-scopes.json', JSON.stringify(scopes));
  put('.claude/session.jsonl', '{}\n'); // the session start the wave plan is judged against; written before the plan
  if (wave) put('.claude/waves/2026-10-13-test.md', '# wave plan\n\nSteps: build, verify, close the work item.\n');
  return {root, put};
}
const run = (root, script, event, env = {}) => spawnSync(process.execPath, [join(HOOKS, script), '--project', root], {
  cwd: root, encoding: 'utf8', timeout: 15000, env: {...process.env, ...env},
  input: JSON.stringify({cwd: root, session_id: 's1', transcript_path: join(root, '.claude/session.jsonl'), ...event}),
});
const dispatch = (root, input, extra = {}) => run(root, 'guard-dispatch.mjs', {tool_name: 'Agent', tool_input: {model: 'sonnet', ...input}, ...extra});
const wr = (root, file_path, extra = {}, tool = 'Write') => run(root, 'guard-write.mjs', {tool_name: tool, tool_input: {file_path, content: 'x'}, ...extra});
const sh = (root, command, extra = {}) => run(root, 'guard-bash.mjs', {tool_name: 'Bash', tool_input: {command}, ...extra});
const blocked = (r, label, what) => {
  assert.equal(r.status, 2, `${what}: expected block, got exit ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  assert.match(r.stderr, new RegExp(label), what);
};
const silent = (r, what) => assert.ok(r.status === 0 && r.stdout === '', `${what}: expected silent allow, got exit ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
const asked = (r, reason, what) => {
  assert.equal(r.status, 0, `${what}: expected ask (exit 0), got exit ${r.status}\nstderr: ${r.stderr}`);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'ask', `${what}: ${r.stdout}`);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, new RegExp(reason), what);
};
const logLines = root => readFileSync(join(root, '.claude/.dispatch-log.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));

test('N1a a worker may not dispatch', t => {
  const {root} = repo(t);
  blocked(dispatch(root, {subagent_type: 'Explore', prompt: 'look'}, WORKER), 'may not dispatch', 'agent_id worker');
  blocked(dispatch(root, {subagent_type: 'Explore', prompt: 'look'}, {transcript_path: join(root, 'x', 'subagents', 'agent-1.jsonl')}), 'may not dispatch', 'transcript worker');
});

test('N1b a write-capable dispatch with no done-check line asks; a done-check line passes', t => {
  const {root} = repo(t);
  asked(dispatch(root, {subagent_type: 'general-purpose', prompt: 'Refactor the parser please.'}), 'brief names no done-check', 'general-purpose');
  asked(dispatch(root, {prompt: 'Refactor the parser please.'}), 'brief names no done-check', 'no subagent_type');
  asked(dispatch(root, {subagent_type: 'builder', prompt: 'Refactor the parser please.'}), 'brief names no done-check', 'scopes entry with a write list');
  asked(dispatch(root, {subagent_type: 'code-reviewer', prompt: 'Fix reports.'}), 'brief names no done-check', 'scopes entry wins over the reviewer name');
  for (const line of ['Done-check: tests', 'done-check: tests', 'Acceptance: green'])
    silent(dispatch(root, {subagent_type: 'general-purpose', prompt: 'Refactor the parser.\n' + line}), line);
});

test('N1c a read-only dispatch needs no done-check', t => {
  const {root} = repo(t);
  for (const type of ['Explore', 'Plan', 'scout', 'cavecrew-investigator', 'cavecrew-reviewer'])
    silent(dispatch(root, {subagent_type: type, prompt: 'Look around.'}), type);
});

test('N1d no wave plan, a stale wave plan, or a plan older than the session asks; a fresh plan passes', t => {
  const none = repo(t, {wave: false});
  const brief = {subagent_type: 'general-purpose', prompt: DONE};
  asked(dispatch(none.root, brief), 'no wave plan for this session; write .claude/waves/<date>-<slug>.md', 'no waves dir');
  const stale = repo(t);
  const old = new Date('2020-01-01');
  utimesSync(join(stale.root, '.claude/waves/2026-10-13-test.md'), old, old);
  asked(dispatch(stale.root, brief), 'no wave plan for this session', 'older than 24 hours');
  const session = repo(t);
  const transcript = join(session.root, 'transcript.jsonl');
  writeFileSync(transcript, '{}\n');
  utimesSync(join(session.root, '.claude/waves/2026-10-13-test.md'), old, old);
  asked(dispatch(session.root, brief, {transcript_path: transcript}), 'no wave plan for this session', 'older than the transcript');
  silent(dispatch(repo(t).root, brief), 'fresh plan');
  silent(dispatch(repo(t).root, {subagent_type: 'Explore', prompt: 'look'}), 'read-only needs no plan');
});

test('N1e the asks compose into one reason, and the sensitive-keyword ask survives', t => {
  const {root} = repo(t, {wave: false});
  const out = JSON.parse(dispatch(root, {subagent_type: 'general-purpose', prompt: 'Deploy to production.'}).stdout);
  const why = out.hookSpecificOutput.permissionDecisionReason;
  assert.match(why, /security-policy\.md/); assert.match(why, /brief names no done-check/); assert.match(why, /no wave plan/);
});

test('N1f the dispatch log gets one line with the prompt hash, and a log failure never fails the hook', t => {
  const {root} = repo(t);
  const prompt = 'persona: architect\n' + DONE;
  silent(dispatch(root, {subagent_type: 'builder', model: 'sonnet', effort: 'high', description: 'do it', prompt}), 'logged dispatch');
  const [line] = logLines(root);
  assert.equal(line.agent_type, 'builder'); assert.equal(line.model, 'sonnet'); assert.equal(line.effort, 'high');
  assert.equal(line.description, 'do it'); assert.equal(line.persona, 'architect'); assert.equal(line.session_id, 's1');
  assert.deepEqual(line.write, SCOPES.builder.write);
  assert.equal(line.prompt_sha256, createHash('sha256').update(prompt).digest('hex'));
  assert.match(line.ts, /^\d{4}-\d\d-\d\dT/);
  silent(dispatch(root, {subagent_type: 'scout', prompt: 'seat: chair\nlook'}), 'second dispatch');
  const second = logLines(root)[1];
  assert.equal(second.persona, 'chair');
  assert.deepEqual(second.write, []);
  const broken = repo(t);
  mkdirSync(join(broken.root, '.claude/.dispatch-log.jsonl'));
  silent(dispatch(broken.root, {subagent_type: 'builder', prompt: DONE}), 'log path is a directory');
  const nolane = repo(t, {scopes: null});
  silent(dispatch(nolane.root, {subagent_type: 'general-purpose', prompt: DONE}), 'no scopes file');
  assert.equal(logLines(nolane.root)[0].write, null);
  assert.equal(logLines(nolane.root)[0].persona, null);
});

test('N2 SubagentStart injects the lane, the brief contract and the matching dispatch line', t => {
  const {root, put} = repo(t);
  put('.claude/.dispatch-log.jsonl', [
    {kind: 'dispatch', agent_type: 'builder', description: 'older', prompt_sha256: 'a'},
    {kind: 'dispatch', agent_type: 'builder', description: 'newest builder', prompt_sha256: 'b'},
    {kind: 'dispatch', agent_type: 'scout', description: 'other type', prompt_sha256: 'c'},
  ].map(l => JSON.stringify(l)).join('\n') + '\n');
  const r = run(root, 'subagent-start.mjs', {hook_event_name: 'SubagentStart', ...WORKER});
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'SubagentStart');
  const ctx = out.additionalContext;
  assert.match(ctx, /read: src\/\*\*, docs\//); assert.match(ctx, /write: src\/\*\*, docs\/notes\/, hooks\/x\.mjs/);
  assert.match(ctx, /1 to 2K token summary/); assert.match(ctx, /what you did not do/); assert.match(ctx, /cause, falsifier, evidence/);
  // the dispatch descriptions, quoted: a bare /older/ would also match "folders" in a macOS temp path
  assert.match(ctx, /newest builder/); assert.doesNotMatch(ctx, /"description":"(older|other type)"/);
  const bare = JSON.parse(run(root, 'subagent-start.mjs', {hook_event_name: 'SubagentStart', agent_id: 'w2', agent_type: 'nobody'}).stdout).hookSpecificOutput.additionalContext;
  assert.match(bare, /no lane recorded/);
  const none = repo(t, {scopes: null});
  assert.match(JSON.parse(run(none.root, 'subagent-start.mjs', {hook_event_name: 'SubagentStart', ...WORKER}).stdout).hookSpecificOutput.additionalContext, /no lane recorded/);
  const bad = spawnSync(process.execPath, [join(HOOKS, 'subagent-start.mjs')], {cwd: root, input: 'not json', encoding: 'utf8'});
  assert.equal(bad.status, 0, 'fails open');
});

test('N3 SubagentStop blocks once without evidence, passes with stop_hook_active or evidence, and logs the outcome', t => {
  const {root} = repo(t);
  const stop = (message, active) => run(root, 'subagent-stop.mjs', {hook_event_name: 'SubagentStop', ...WORKER, last_assistant_message: message, stop_hook_active: active});
  const first = stop('All finished.', false);
  assert.equal(first.status, 0, first.stderr);
  const verdict = JSON.parse(first.stdout);
  assert.equal(verdict.decision, 'block');
  assert.equal(verdict.reason, 'Before you finish: name the command or file that proves your done-check, the paths you changed, and what you did not do.');
  for (const [message, what] of [['All finished.', 'stop_hook_active'], ['Changed src/a.ts and it passes.', 'path token'], ['Ran `node --test`.', 'backtick command'], ['Evidence: green.', 'evidence word']]) {
    const r = stop(message, what === 'stop_hook_active');
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.decision, undefined, what);
    assert.equal(out.hookSpecificOutput.hookEventName, 'SubagentStop');
    assert.equal(out.hookSpecificOutput.additionalContext, 'worker builder stopped; verify its done-check by state before accepting its report');
  }
  const outcomes = logLines(root);
  assert.deepEqual(outcomes.map(l => l.evidence), [false, false, true, true, true]);
  assert.equal(outcomes[0].agent_id, 'w1'); assert.equal(outcomes[0].agent_type, 'builder');
  const bad = spawnSync(process.execPath, [join(HOOKS, 'subagent-stop.mjs')], {cwd: root, input: '{', encoding: 'utf8'});
  assert.equal(bad.status, 0, 'fails open');
});

test('N4 lane prefix matching: ** is the subtree, a trailing slash is a directory, a file is exact', async () => {
  const {inRoots} = await import('./lanes.mjs');
  assert.ok(inRoots('src/a/b.ts', ['src/**'])); assert.ok(inRoots('src', ['src/**']));
  assert.ok(!inRoots('srcx/a.ts', ['src/**'])); assert.ok(!inRoots('docs/a.md', ['src/**']));
  assert.ok(inRoots('docs/a.md', ['docs/'])); assert.ok(inRoots('hooks/x.mjs', ['hooks/x.mjs']));
  assert.ok(!inRoots('hooks/x.mjs.bak', ['hooks/x.mjs'])); assert.ok(inRoots('anything/at/all', ['**']));
  assert.ok(!inRoots('src/a.ts', []));
});

test('N4 a worker Write or Edit outside its write roots is blocked; inside passes', t => {
  const {root, put} = repo(t);
  put('docs/a.md', 'x\n');
  blocked(wr(root, 'docs/a.md', WORKER), 'WRITE LANE GUARD', 'Write outside');
  blocked(wr(root, join(root, 'config.json'), WORKER), 'WRITE LANE GUARD', 'absolute Write outside');
  assert.match(wr(root, 'docs/a.md', WORKER).stderr, /builder/);
  blocked(run(root, 'guard-write.mjs', {tool_name: 'Edit', tool_input: {file_path: 'docs/a.md', old_string: 'x', new_string: 'y'}, ...WORKER}), 'WRITE LANE GUARD', 'Edit outside');
  silent(wr(root, 'src/deep/new.ts', WORKER), 'Write inside src/**');
  silent(wr(root, 'docs/notes/n.md', WORKER), 'Write inside docs/notes/');
});

test('N4 a worker shell mutation outside its write roots is blocked; reads and /dev/null are not', t => {
  const {root} = repo(t);
  for (const c of ['echo x > docs/a.md', 'cp src/a.ts docs/b.md', 'rm docs/a.md', 'echo x >> docs/a.md', "sed -i 's/a/b/' docs/a.md", 'tee docs/a.md'])
    blocked(sh(root, c, WORKER), 'WRITE LANE GUARD', c);
  for (const c of ['cat docs/a.md', 'ls docs', 'echo hi 2>/dev/null', 'echo x > src/new.ts', 'cp docs/a.md src/b.ts', 'grep a docs/a.md > src/out.txt'])
    silent(sh(root, c, WORKER), c);
});

test('N4 no lane verdict for the controller, a worker without agent_type, or an agent with no entry', t => {
  const {root} = repo(t);
  silent(wr(root, 'docs/a.md'), 'controller');
  silent(sh(root, 'echo x > docs/a.md'), 'controller shell');
  silent(wr(root, 'docs/a.md', {agent_id: 'w1'}), 'worker without agent_type');
  silent(wr(root, 'docs/a.md', {agent_id: 'w1', agent_type: 'unlisted'}), 'agent_type with no entry');
  silent(wr(root, 'docs/a.md', {agent_type: 'builder'}), 'agent_type on the controller');
  silent(wr(repo(t, {scopes: null}).root, 'docs/a.md', WORKER), 'no scopes file');
});

test('N4 EIDOLON_HOOK_DEBUG=1 records the input keys, never the values', t => {
  const {root} = repo(t);
  silent(wr(root, 'src/a.ts', WORKER), 'no debug');
  assert.ok(!existsSync(join(root, '.claude/.hook-debug.jsonl')));
  silent(run(root, 'guard-write.mjs', {tool_name: 'Write', tool_input: {file_path: 'src/a.ts', content: 'SECRETBODY'}, ...WORKER}, {EIDOLON_HOOK_DEBUG: '1'}), 'debug run');
  const text = readFileSync(join(root, '.claude/.hook-debug.jsonl'), 'utf8');
  const entry = JSON.parse(text.trim().split('\n').pop());
  for (const key of ['agent_id', 'agent_type', 'tool_name', 'tool_input', 'session_id', 'cwd']) assert.ok(entry.keys.includes(key), key);
  for (const value of ['builder', 'SECRETBODY', 'w1', 'src/a.ts']) assert.ok(!text.includes(value), value);
});

test('N5 the repo settings wire every hook in the exec form, with the PowerShell deny mirrors', {skip: !existsSync(join(REPO, '.claude/settings.json')) && 'the repo settings are not bundled'}, () => {
  const conf = JSON.parse(readFileSync(join(REPO, '.claude/settings.json'), 'utf8'));
  const wired = Object.entries(conf.hooks).flatMap(([event, groups]) => groups.flatMap(g => g.hooks.map(h => {
    assert.equal(h.type, 'command'); assert.equal(h.command, 'node');
    assert.match(h.args[0], /^\$\{CLAUDE_PROJECT_DIR\}\/hooks\/[a-z-]+\.mjs$/);
    assert.deepEqual(h.args.slice(1), ['--project', '${CLAUDE_PROJECT_DIR}']);
    return `${event} ${g.matcher ?? ''} ${h.args[0].split('/').pop()}`;
  })));
  assert.deepEqual(wired.sort(), [
    'PostToolUse Write|Edit post-tool-entry.mjs',
    'PreToolUse Agent|Task guard-dispatch.mjs',
    'PreToolUse Bash|PowerShell guard-bash.mjs',
    'PreToolUse Write|Edit guard-write.mjs',
    'SubagentStart  subagent-start.mjs',
    'SubagentStop  subagent-stop.mjs',
  ]);
  const deny = conf.permissions.deny, git = deny.filter(r => r.startsWith('Bash(git'));
  assert.ok(git.length >= 6);
  for (const rule of git) assert.ok(deny.includes(rule.replace('Bash(', 'PowerShell(')), rule);
  assert.deepEqual(conf.env, {CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '1'});
  assert.equal(conf.effortLevel, 'xhigh'); assert.equal(conf.maxEffortLevel, 'max');
});

test('N6 the controller editing a hook asks; a worker editing a hook is blocked', t => {
  const {root} = repo(t);
  const worker = {transcript_path: '/x/subagents/agent-1.jsonl'};
  for (const p of ['hooks/lib.mjs', 'hooks/new-guard.mjs']) {
    asked(wr(root, p), 'editing the governance hooks; confirm', 'controller Write ' + p);
    blocked(wr(root, p, worker), 'HOOK INTEGRITY GUARD', 'worker Write ' + p);
  }
  const edit = {tool_name: 'Edit', tool_input: {file_path: 'hooks/lib.mjs', old_string: 'fixture', new_string: 'changed'}};
  asked(run(root, 'guard-write.mjs', edit), 'editing the governance hooks; confirm', 'controller Edit');
  blocked(run(root, 'guard-write.mjs', {...edit, ...worker}), 'HOOK INTEGRITY GUARD', 'worker Edit');
  asked(sh(root, 'cp x hooks/lib.mjs'), 'editing the governance hooks; confirm', 'controller shell');
  blocked(sh(root, 'cp x hooks/lib.mjs', worker), 'HOOK INTEGRITY GUARD', 'worker shell');
  blocked(sh(root, 'rm hooks/lib.mjs'), 'HOOK INTEGRITY GUARD', 'removing a hook stays a block');
});

test('N7 an unparseable command under a persona that forbids hook tampering gives no persona verdict', t => {
  const {root, put} = repo(t);
  put('.claude/active-persona.json', JSON.stringify({persona: 'p', anchors: ['a'], anti_behaviors: {floor: ['disable-or-route-around-hook'], specific: []}}));
  silent(run(root, 'persona-conduct-guard.mjs', {tool_name: 'Bash', tool_input: {command: 'rm hooks/lib.mjs "unterminated'}}), 'ShellParseError becomes no verdict');
});

test('N7 touchesHookSuite reads cwd, root and shell language from the event', t => {
  const {root} = repo(t);
  assert.equal(touchesHookSuite('rm lib.mjs', {cwd: join(root, 'hooks'), eidolon_root: root}), true);
  assert.equal(touchesHookSuite('rm a.ts', {cwd: join(root, 'src'), eidolon_root: root}), false);
  assert.equal(touchesHookSuite('echo `"; Remove-Item hooks/lib.mjs', {cwd: root, eidolon_root: root, shell_language: 'powershell'}), true);
});

test('N7 the retired .claude/security-* authority entry is gone', t => {
  const {root} = repo(t);
  assert.equal(protectedKind('.claude/security-x.json', root, root), null);
  assert.equal(protectedKind('.claude/settings.json', root, root), 'authority');
});

test('N7 the orient hooks do not claim an enforced gate', t => {
  for (const f of ['codebase-memory-orient.mjs', 'graphify-orient.mjs', 'mempalace-orient.mjs']) {
    const text = readFileSync(join(HOOKS, f), 'utf8');
    assert.ok(!/ENFORCED/.test(text), f + ' still says ENFORCED');
    assert.ok(!/orient-gate BLOCKS/i.test(text), f + ' still claims a blocking gate');
    assert.match(text, /orientation is advisory; read the graph and the memory before editing source/, f);
  }
  const {root, put} = repo(t);
  put('graphify-out/GRAPH_REPORT.md', '## God Nodes\n- core\n');
  const r = spawnSync(process.execPath, [join(HOOKS, 'graphify-orient.mjs')], {cwd: root, input: JSON.stringify({cwd: root}), encoding: 'utf8'});
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.ok(!/ENFORCED/.test(ctx)); assert.match(ctx, /orientation is advisory/);
});

test('N7 a Write outside the project root (a plan file, a scratchpad) gets no verdict', t => {
  const {root} = repo(t);
  const outside = realpathSync.native(mkdtempSync(join(tmpdir(), 'eidolon-outside-')));
  t.after(() => rmSync(outside, {recursive: true, force: true}));
  const plan = join(outside, 'plan.md');
  silent(wr(root, plan), 'controller');
  blocked(wr(root, plan, WORKER), 'WRITE LANE GUARD', 'a worker with a lane may not write outside the project root');
  // Round 5: a record-shaped path outside the root asks the controller; other outside writes stay unjudged.
  asked(wr(root, join(outside, 'docs', 'decisions', 'x.md')), 'RUNTIME INTEGRITY GUARD', 'record-shaped path outside the root');
  blocked(wr(root, '.claude/skills/eidolon/x.md', {}), 'RUNTIME INTEGRITY GUARD', 'managed paths inside the root stay blocked');
});

test('N7 .gitignore drops the orient gate and ignores the pipeline runtime files', {skip: !existsSync(join(REPO, '.gitignore')) && 'the repository .gitignore is not bundled'}, () => {
  const lines = readFileSync(join(REPO, '.gitignore'), 'utf8').split(/\r?\n/);
  assert.ok(!lines.includes('.claude/.orient-gate.*.json'));
  for (const entry of ['.claude/.dispatch-log.jsonl', '.claude/.hook-debug.jsonl', '.claude/waves/']) assert.ok(lines.includes(entry), entry);
});
