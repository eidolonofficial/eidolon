import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'guard-dispatch.mjs');
function dispatch(tool_name, description) {
  const cwd = mkdtempSync(join(tmpdir(), 'eidolon-dispatch-'));
  try {
    return spawnSync(process.execPath, [HOOK], {input: JSON.stringify({cwd, tool_name, tool_input: {description}}), encoding: 'utf8'});
  } finally { rmSync(cwd, {recursive: true, force: true}); }
}

test('a sensitive dispatch asks the human, for Agent and Task', () => {
  for (const tool of ['Agent', 'Task']) {
    const r = dispatch(tool, 'deploy to production');
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /security-policy\.md/);
  }
});

test('a routine dispatch and a non-dispatch tool exit 0 with no decision', () => {
  for (const [tool, text] of [['Agent', 'fix a typo in the README'], ['Bash', 'deploy to production']]) {
    const r = dispatch(tool, text);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }
});
