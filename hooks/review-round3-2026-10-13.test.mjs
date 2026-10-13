// Tests for fix round 3 of the 2026-10-13 hook review. Same rules as the earlier review files: every case drives
// the wired entry point in a throwaway git repo, hook JSON on stdin, nothing is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync, execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readLog} from './dispatch-evaluators.mjs';

const HOOKS = dirname(fileURLToPath(import.meta.url));
const DONE = 'Change src/a.ts.\nDone-check: node --test exits 0.';

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), 'eidolon-r3-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  execFileSync('git', ['init', '-q'], {cwd: root});
  const put = (path, text) => { const file = join(root, path); mkdirSync(dirname(file), {recursive: true}); writeFileSync(file, text); };
  put('hooks/lib.mjs', '// fixture\n');
  put('src/a.ts', 'export {};\n');
  put('.claude/settings.json', '{}\n');
  put('.claude/agent-scopes.json', JSON.stringify({builder: {read: ['**'], write: ['src/**']}}));
  put('.claude/session.jsonl', '{}\n'); // the session start the wave plan is judged against; written before the plan
  put('.claude/waves/2026-10-13-test.md', '# wave plan\n\nSteps: build, verify, close the work item.\n');
  return {root, put};
}
const run = (root, script, event) => spawnSync(process.execPath, [join(HOOKS, script), '--project', root], {
  cwd: root, encoding: 'utf8', timeout: 20000, input: JSON.stringify({cwd: root, session_id: 's1', transcript_path: join(root, '.claude/session.jsonl'), ...event}),
});
const dispatch = (root, input) => run(root, 'guard-dispatch.mjs', {tool_name: 'Agent', tool_input: input});
const askedWith = r => { try { const h = JSON.parse(r.stdout).hookSpecificOutput; return h?.permissionDecision === 'ask' ? h.permissionDecisionReason : null; } catch { return null; } };
const asked = (r, needle, what) => { const why = askedWith(r); assert.ok(r.status === 0 && why && why.includes(needle), `${what}: expected an ask naming "${needle}", got exit ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`); };
const silent = (r, what) => assert.ok(r.status === 0 && r.stdout === '', `${what}: expected silent allow, got exit ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);

test('M1 a dispatch that names no model tier asks; a model on the call, an agent file model line or a plugin agent type satisfies it', t => {
  const {root, put} = repo(t);
  asked(dispatch(root, {subagent_type: 'general-purpose', prompt: DONE}), 'no model tier', 'no tier anywhere');
  asked(dispatch(root, {subagent_type: 'Explore', prompt: 'look around'}), 'no model tier', 'a read-only type still names a tier');
  silent(dispatch(root, {subagent_type: 'general-purpose', model: 'haiku', prompt: DONE}), 'model on the call');
  silent(dispatch(root, {subagent_type: 'caveman:cavecrew-builder', prompt: DONE}), 'plugin agent type');
  put('.claude/agents/builder.md', '---\nname: builder\nmodel: sonnet\ntools: Read, Edit\n---\nBuild inside src.\n');
  silent(dispatch(root, {subagent_type: 'builder', prompt: DONE}), 'agent file model line');
  asked(dispatch(root, {subagent_type: 'builder-two', prompt: DONE}), 'no model tier', 'an agent type with no file');
});

test('M2 the dispatch log records the tier the dispatch resolved to', t => {
  const {root, put} = repo(t);
  put('.claude/agents/builder.md', '---\nname: builder\nmodel: opus\n---\nBuild.\n');
  silent(dispatch(root, {subagent_type: 'builder', prompt: DONE}), 'agent file tier');
  silent(dispatch(root, {subagent_type: 'builder', model: 'haiku', prompt: DONE}), 'call tier wins');
  silent(dispatch(root, {subagent_type: 'caveman:cavecrew-reviewer', prompt: 'review src'}), 'plugin tier');
  assert.deepEqual(readLog(root).map(l => l.model), ['opus', 'haiku', 'plugin-defined']);
});
