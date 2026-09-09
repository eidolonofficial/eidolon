import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parsePatch } from './codex-patch.mjs';
import { evaluateCodex, codexOutput, lifecycle } from './codex-hook.mjs';
import { bashEvaluators, writeEvaluators } from './suite-evaluators.mjs';
const script = join(dirname(fileURLToPath(import.meta.url)), 'codex-hook.mjs');
function tmp(t) { const p = realpathSync(mkdtempSync(join(tmpdir(), 'eidolon-codex-'))); t.after(() => rmSync(p, { recursive: true, force: true })); return p; }
const event = (cwd, tool_name, tool_input) => ({ cwd, session_id: 'codex-test', hook_event_name: 'PreToolUse', tool_name, tool_input });
const patch = body => '*** Begin Patch\n' + body + '\n*** End Patch\n';
const check = (cwd, body) => codexOutput(evaluateCodex(event(cwd, 'apply_patch', { command: patch(body) })));
function put(root, name, content) { const p = join(root, name); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); return p; }

test('Claude and Codex retain the original policies plus shared health and runtime protection', () => {
  assert.equal(bashEvaluators.length, 11); assert.equal(writeEvaluators.length, 7);
  for (const suite of [bashEvaluators,writeEvaluators]) {assert.ok(suite.some(fn=>fn.name==='evalManagedState'));assert.ok(suite.some(fn=>fn.name==='evalRuntimeIntegrity'));}
  assert.equal(bashEvaluators.at(-1).name, 'evalEvolveEngine');
});
test('Codex patch adds a file without performing the write', t => {
  const root = tmp(t); const changes = parsePatch(patch('*** Add File: foo.txt\n+hello'), root);
  assert.equal(changes[0].after, 'hello\n'); assert.equal(check(root, '*** Add File: foo.txt\n+hello').status, 0);
});
test('patch text mentioning a shell flag is not a shell command', t => {
  const root = tmp(t); assert.equal(check(root, '*** Add File: example.md\n+Run git push --force only with a separate reviewed procedure.').status, 0);
});
test('exact update preserves surrounding source', t => {
  const root = tmp(t); put(root, 'file.txt', 'a\nb\nc\n');
  assert.equal(parsePatch(patch('*** Update File: file.txt\n@@\n a\n-b\n+B\n c'), root)[0].after, 'a\nB\nc\n');
  assert.equal(readFileSync(join(root, 'file.txt'), 'utf8'), 'a\nb\nc\n');
});
test('multiple files and hunks are normalized independently', t => {
  const root = tmp(t); put(root, 'file.txt', 'a\nb\nc\nd\n');
  const out = parsePatch(patch('*** Update File: file.txt\n@@\n-a\n+A\n b\n@@\n c\n-d\n+D\n*** Add File: other.txt\n+new'), root);
  assert.equal(out.length, 2); assert.equal(out[0].after, 'A\nb\nc\nD\n');
});
test('end-of-file context and context anchors are supported', t => {
  const root = tmp(t); put(root, 'file.txt', 'heading\nsame\nheading2\nsame\n');
  assert.equal(parsePatch(patch('*** Update File: file.txt\n@@ heading2\n-same\n+last\n*** End of File'), root)[0].after, 'heading\nsame\nheading2\nlast\n');
});
test('ambiguous context is blocked rather than guessed', t => {
  const root = tmp(t); put(root, 'file.txt', 'same\nx\nsame\n');
  assert.throws(() => parsePatch(patch('*** Update File: file.txt\n@@\n-same\n+new'), root), /ambiguous/);
});
test('missing context is blocked', t => {
  const root = tmp(t); put(root, 'file.txt', 'old\n');
  assert.throws(() => parsePatch(patch('*** Update File: file.txt\n@@\n-other\n+new'), root));
});
test('delete is represented, not executed', t => {
  const root = tmp(t); put(root, 'file.txt', 'old\n');
  assert.equal(parsePatch(patch('*** Delete File: file.txt'), root)[0].kind, 'delete');
  assert.equal(readFileSync(join(root, 'file.txt'), 'utf8'), 'old\n');
});
test('move preserves updated proposed contents', t => {
  const root = tmp(t); put(root, 'old.txt', 'old\n');
  const out = parsePatch(patch('*** Update File: old.txt\n*** Move to: new.txt\n@@\n-old\n+new'), root)[0];
  assert.equal(out.kind, 'move'); assert.equal(out.after, 'new\n'); assert.equal(out.destination, join(root, 'new.txt'));
});
for (const name of ['../escape.txt', '.git/config', '.codex/hooks.json', '.codex/config.toml', '.agents/skills/eidolon/SKILL.md']) {
  test('protects path ' + name, t => {
    const root = tmp(t);
    if (name.startsWith('../')) assert.throws(() => check(root, '*** Add File: ' + name + '\n+changed'), /escapes project/);
    else assert.equal(check(root, '*** Add File: ' + name + '\n+changed').status, 2);
  });
}
test('symlink and dangling symlink targets are rejected', t => {
  const root = tmp(t), outside = tmp(t); put(outside, 'target', 'private');
  try { symlinkSync(join(outside, 'target'), join(root, 'link')); symlinkSync(join(outside, 'missing'), join(root, 'dangling')); }
  catch (e) { if (e.code === 'EPERM') { t.skip('Symlink privileges unavailable'); return; } throw e; }
  assert.throws(() => parsePatch(patch('*** Update File: link\n@@\n-private\n+changed'), root));
  assert.throws(() => parsePatch(patch('*** Add File: dangling\n+changed'), root));
});
test('deleting an append-only record is blocked', t => {
  const root = tmp(t); put(root, 'docs/decisions/record.md', 'one\ntwo\nthree\n');
  assert.equal(check(root, '*** Delete File: docs/decisions/record.md').status, 2);
});
test('small record deletion cannot hide inside a large whole-file update', t => {
  const root = tmp(t); put(root, 'docs/decisions/record.md', 'a\nb\nc\nd\ne\nf\n');
  assert.equal(check(root, '*** Update File: docs/decisions/record.md\n@@\n a\n-b\n c').status, 2);
});
test('record addition is permitted', t => {
  const root = tmp(t); put(root, 'docs/decisions/record.md', 'a\n');
  assert.equal(check(root, '*** Update File: docs/decisions/record.md\n@@\n a\n+b').status, 0);
});
test('record move is not a deletion bypass', t => {
  const root = tmp(t); put(root, 'docs/decisions/record.md', 'a\n');
  assert.equal(check(root, '*** Update File: docs/decisions/record.md\n*** Move to: other.md\n@@\n-a\n+b').status, 2);
});
test('evolve confirmation asks in policy but denies in Codex transport', t => {
  const root = tmp(t); const vs = evaluateCodex(event(root, 'Bash', { command: 'evolve-brief normalize run.yaml --confirmed true' }));
  assert.ok(vs.some(v => v.kind === 'ask')); const out = codexOutput(vs);
  assert.equal(out.status, 2); assert.equal(out.stdout, ''); assert.match(out.stderr, /MANUAL REVIEW/);
});
for (const name of ['spawn_agent', 'send_input']) test(name + ' sensitive work reaches attestation gate', t => {
  const root = tmp(t); const out = codexOutput(evaluateCodex(event(root, name, { message: 'deploy to production', agent_type: 'worker' })));
  assert.equal(out.status, 2); assert.match(out.stderr, /ATTESTATION/);
});
test('routine subagent work is allowed without optional services', t => {
  const root = tmp(t); assert.equal(codexOutput(evaluateCodex(event(root, 'spawn_agent', { message: 'read the README' }))).status, 0);
});
test('an existing orientation gate remains enforced', t => {
  const root = tmp(t); put(root, '.claude/eidolon-manifest.yaml', 'artifacts: hooks/orient-gate.mjs\n');
  assert.match(check(root, '*** Add File: source.js\n+const x=1;').stderr, /ORIENT/);
});
test('UTF-8, CRLF and filenames with spaces retain semantics', t => {
  const root = tmp(t); put(root, 'a b.txt', 'é\r\n');
  assert.equal(parsePatch(patch('*** Update File: a b.txt\n@@\n-é\n+猫'), root)[0].after, '猫\n');
});
test('invalid and binary patches fail closed', t => {
  const root = tmp(t); put(root, 'binary.dat', Buffer.from([0,1,2]));
  assert.throws(() => parsePatch(patch('*** Delete File: binary.dat'), root));
  assert.throws(() => parsePatch('not a patch', root));
  assert.throws(() => parsePatch(patch('*** Add File: a\n+x\n*** Add File: a\n+y'), root));
});
test('CLI malformed input blocks without echoing its input', t => {
  const root = tmp(t); const out = spawnSync(process.execPath, [script], { cwd: root, input: 'private-example-value not json', encoding: 'utf8' });
  assert.equal(out.status, 2); assert.doesNotMatch(out.stderr, /private-example-value/);
});
test('CLI valid patch exits successfully', t => {
  const root = tmp(t); const out = spawnSync(process.execPath, [script, '--project', root], { cwd: root,
    input: JSON.stringify(event(root, 'apply_patch', { command: patch('*** Add File: a.txt\n+hello') })), encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
});
test('session snapshots are keyed by session and framed as hypotheses', t => {
  const root = tmp(t); lifecycle({ cwd: root, session_id: 'one', hook_event_name: 'PreCompact' });
  const a = lifecycle({ cwd: root, session_id: 'one', hook_event_name: 'SessionStart' });
  const b = lifecycle({ cwd: root, session_id: 'two', hook_event_name: 'SessionStart' });
  assert.match(a.stdout, /hypothesis/); assert.doesNotMatch(b.stdout, /Saved facts/);
});
