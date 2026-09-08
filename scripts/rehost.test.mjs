import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { install } from './install.mjs';
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
test('an installed Codex skill can provision Claude without losing its original workflow', t => {
  const home = mkdtempSync(join(tmpdir(), 'eidolon-rehost-'));
  const project = mkdtempSync(join(tmpdir(), 'eidolon-rehost-'));
  t.after(() => { rmSync(home, {recursive:true,force:true}); rmSync(project, {recursive:true,force:true}); });
  install({ home, dryRun: false });
  install({ project, host: 'both', dryRun: false, sources: [{ name: 'eidolon', source: join(home, '.agents/skills/eidolon') }] });
  assert.equal(readFileSync(join(project, '.claude/skills/eidolon/SKILL.md'), 'utf8'), readFileSync(join(source, 'SKILL.md'), 'utf8'));
  assert.match(readFileSync(join(project, '.agents/skills/eidolon/SKILL.md'), 'utf8'), /Eidolon for Codex/);
});
