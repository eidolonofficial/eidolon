// Round 5: the installer wires every hook entry with "onFailure": "block" (live result on Claude Code 2.1.206: the key is accepted and the
// settings load; that host still fails open on a missing hook, and 2.1.295 or newer blocks), and its .gitignore block names the worker scratch directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install as installOnce, planInstall } from './install.mjs';

const install = o => installOnce(o?.dryRun === false && !o.expectedPlan ? { ...o, expectedPlan: planInstall(o).digest } : o);
function tmp(t) { const p = realpathSync.native(mkdtempSync(join(tmpdir(), 'eidolon-install-r5-'))); t.after(() => rmSync(p, { recursive: true, force: true })); return p; }

test('R5-16 every wired hook entry carries onFailure block, and a reinstall changes nothing', t => {
  const root = tmp(t);
  install({ project: root, dryRun: false });
  const settings = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'));
  const entries = Object.values(settings.hooks).flatMap(groups => groups.flatMap(g => g.hooks));
  assert.equal(entries.length, 6, 'six wired hook entries');
  for (const entry of entries) assert.equal(entry.onFailure, 'block', 'onFailure on ' + entry.args[0]);
  assert.equal(install({ project: root, dryRun: false, replace: true }).changed, 0, 'an identical reinstall changes nothing');
});

test('R5-12 the .gitignore block lists the worker scratch directory', t => {
  const root = tmp(t);
  install({ project: root, dryRun: false });
  const lines = readFileSync(join(root, '.gitignore'), 'utf8').split(/\r?\n/);
  assert.ok(lines.includes('.eidolon/scratch/'), 'the block ignores .eidolon/scratch/');
});
