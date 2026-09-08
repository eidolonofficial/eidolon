import test from 'node:test';
import assert from 'node:assert/strict';
import { routeSkills } from './skill-router.mjs';

const candidates = [
  {
    name: 'supabase-review',
    description: 'Review Supabase database, authentication and row-level security changes.',
    triggers: ['supabase auth', 'row level security'],
    signals: ['supabase/config.toml', '@supabase/'],
    risk: ['auth'],
    conflicts: []
  },
  {
    name: 'generic-auth',
    description: 'General authentication notes.',
    triggers: ['auth'],
    signals: [],
    risk: [],
    conflicts: []
  },
  {
    name: 'pdf-workflow',
    description: 'Work with PDF artifacts and page-level verification.',
    triggers: ['pdf artifact'],
    signals: ['.pdf'],
    risk: [],
    conflicts: []
  },
  {
    name: 'deploy-safety',
    description: 'Verify deployment rollback, health and release safety.',
    triggers: ['production deploy'],
    signals: ['deploy/'],
    risk: ['deployment'],
    conflicts: []
  }
];

test('narrow task + repo + risk evidence selects the specialist', () => {
  const r = routeSkills({
    task: 'Review the Supabase auth migration and RLS policy before merge',
    repoSignals: ['supabase/config.toml', 'package:@supabase/supabase-js'],
    riskTags: ['auth'],
    candidates
  }, candidates);
  assert.equal(r.gap, false);
  assert.equal(r.selected[0].name, 'supabase-review');
  assert.ok(r.selected[0].reasons.some((x) => x.startsWith('trigger:')));
  assert.ok(r.selected[0].reasons.some((x) => x.startsWith('repo:')));
  assert.ok(r.selected[0].reasons.some((x) => x.startsWith('risk:')));
  assert.ok(!r.selected.some((x) => x.name === 'generic-auth'));
});

test('a bare common token does not activate a skill by itself', () => {
  const r = routeSkills({ task: 'auth', repoSignals: [], riskTags: [], candidates }, candidates);
  assert.equal(r.gap, true);
});

test('explicit user selection wins when the skill is valid', () => {
  const r = routeSkills({
    task: 'Please use the PDF workflow on this document',
    explicitSkills: ['pdf-workflow'],
    repoSignals: [],
    riskTags: [],
    candidates
  }, candidates);
  assert.equal(r.selected[0].name, 'pdf-workflow');
  assert.equal(r.selected[0].explicit, true);
});

test('unrelated work produces a gap instead of a guessed skill', () => {
  const r = routeSkills({ task: 'Rename a CSS variable', repoSignals: ['src/app.css'], riskTags: [], candidates }, candidates);
  assert.equal(r.gap, true);
  assert.equal(r.selected.length, 0);
});

test('risk evidence can select a safety skill without magic words in the task', () => {
  const r = routeSkills({
    task: 'Ship the approved build',
    repoSignals: ['deploy/release.yml'],
    riskTags: ['deployment'],
    candidates
  }, candidates);
  assert.equal(r.selected[0].name, 'deploy-safety');
});

test('exclusions beat positive matches', () => {
  const local = [{
    name: 'db-migration',
    description: 'Review database migration changes.',
    triggers: ['database migration'],
    signals: [],
    excludes: ['documentation only']
  }];
  const r = routeSkills({ task: 'database migration documentation only', candidates: local }, local);
  assert.equal(r.gap, true);
  assert.match(r.rejected[0].rejectedBecause.join(','), /excluded/);
});

test('missing prerequisites fail closed', () => {
  const local = [{
    name: 'browser-check',
    description: 'Run browser verification for a visual change.',
    triggers: ['visual change'],
    requires: ['browser']
  }];
  const r = routeSkills({ task: 'Verify this visual change', availableCapabilities: [], candidates: local }, local);
  assert.equal(r.gap, true);
  assert.match(r.rejected[0].rejectedBecause.join(','), /missing-prerequisite/);
});

test('minimal set does not duplicate identical evidence', () => {
  const local = [
    { name: 'a', description: 'Terraform deployment review.', triggers: ['terraform deploy'] },
    { name: 'b', description: 'Terraform deployment review.', triggers: ['terraform deploy'] }
  ];
  const r = routeSkills({ task: 'terraform deploy', candidates: local }, local);
  assert.equal(r.selected.length, 1);
});
