import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve, join} from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(join(root, name), 'utf8');
test('Claude has a direct native entry point', () => {
  assert.ok(existsSync(join(root, 'CLAUDE.md')));
  assert.match(read('CLAUDE.md'), /^# .+ for Claude Code/m);
});
test('Claude instruction references resolve in the shipped repository', () => {
  const text = read('CLAUDE.md');
  for (const match of text.matchAll(/`((?:references|skills\/(?:eidolon|setup)\/references)\/[a-zA-Z0-9/_-]+\.md)`/g)) {
    assert.ok(existsSync(join(root, match[1])), match[1]);
  }
});
