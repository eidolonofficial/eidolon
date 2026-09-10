import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve, join} from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(join(root, name), 'utf8');
test('Claude has a direct native entry point, not an AGENTS import', () => {
  const text = read('CLAUDE.md');
  assert.doesNotMatch(text, /@(?:\.\/)?AGENTS\.md/i);
  assert.match(text, /^# .+ for Claude Code/m);
  for (const phrase of ["Autonomous execution, consent-gated side effects.", "Claude is the engineer.", "Stage 2.5", "EXTRACTED | INFERRED | AMBIGUOUS", "engine/SECURITY.md", "plan digest", "controller"]) assert.ok(text.includes(phrase), phrase);
});
test('Claude retains every shared repository-maintenance rule without delegation', () => {
  const shared = read('AGENTS.md').split('\n').slice(2).join('\n').trim();
  assert.ok(read('CLAUDE.md').includes(shared), 'Both entry points must carry the same maintenance rules');
});
test('Claude instruction references resolve in the shipped repository', () => {
  const text = read('CLAUDE.md');
  for (const match of text.matchAll(/`((?:references|skills\/(?:eidolon|setup)\/references|engine)\/[a-zA-Z0-9/_-]+\.md)`/g)) {
    assert.ok(existsSync(join(root, match[1])), match[1]);
  }
});
