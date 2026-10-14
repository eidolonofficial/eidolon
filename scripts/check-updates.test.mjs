// The update check is advisory: one GET to the Hearth releases API, at most once a day, never a throw,
// never a block. These tests inject fetch, point the CLI at a local server, and keep the cache in a temp dir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseVersion, isNewer, installedVersion, latestRelease, checkForUpdate, describe, RELEASE_API } from './check-updates.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'check-updates.mjs');
// The local server lives in this process, so the CLI runs asynchronously; a blocking spawn would starve it.
function run(args, env) {
  return new Promise(ok => {
    const p = spawn(process.execPath, [script, ...args], { env });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => { stdout += d; });
    p.stderr.on('data', d => { stderr += d; });
    p.on('close', status => ok({ status, stdout, stderr }));
  });
}
function temp(t) { const p = mkdtempSync(join(tmpdir(), 'eidolon-update-')); t.after(() => rmSync(p, { recursive: true, force: true })); return p; }
function fakeFetch(status, body) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init }); return { ok: status === 200, status, json: async () => body }; };
  f.calls = calls;
  return f;
}
function serve(t, body, status = 200) {
  return new Promise(ok => {
    const server = createServer((req, res) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); });
    server.listen(0, '127.0.0.1', () => ok('http://127.0.0.1:' + server.address().port + '/latest'));
    t.after(() => server.close());
  });
}

test('versions parse from tags and compare numerically', () => {
  assert.deepEqual(parseVersion('v0.1.10'), [0, 1, 10]);
  assert.deepEqual(parseVersion('Hearth 2.0.0'), [2, 0, 0]);
  assert.equal(parseVersion('main'), null);
  assert.equal(isNewer('v0.1.10', '0.1.9'), true);
  assert.equal(isNewer('v0.1.1', '0.1.1'), false);
  assert.equal(isNewer('v0.0.9', '0.1.0'), false);
  assert.equal(isNewer('nonsense', '0.1.0'), false);
  assert.equal(isNewer('v1.0.0', null), false);
});

test('the installed version is the first release heading of the skill changelog', t => {
  const dir = temp(t);
  writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\ntext\n\n## v0.1.1 (2026-10-14)\n\n## v0.1.0 (2026-10-13)\n');
  assert.equal(installedVersion(dir), '0.1.1');
  assert.equal(installedVersion(join(dir, 'missing')), null);
  assert.match(installedVersion(), /^\d+\.\d+\.\d+$/, 'the repo changelog itself');
});

test('latestRelease reads the tag and page from the GitHub answer and sends a user agent', async () => {
  const f = fakeFetch(200, { tag_name: 'v0.2.0', html_url: 'https://github.com/eidolonofficial/Hearth/releases/tag/v0.2.0' });
  const r = await latestRelease({ fetch: f });
  assert.deepEqual(r, { tag: 'v0.2.0', version: '0.2.0', url: 'https://github.com/eidolonofficial/Hearth/releases/tag/v0.2.0' });
  assert.equal(f.calls[0].url, RELEASE_API);
  assert.equal(f.calls[0].init.headers['User-Agent'], 'eidolon-update-check');
  assert.ok(f.calls[0].init.signal instanceof AbortSignal);
  await assert.rejects(latestRelease({ fetch: fakeFetch(404, {}) }), /HTTP 404/);
  await assert.rejects(latestRelease({ fetch: fakeFetch(200, { tag_name: 'latest' }) }), /no version/);
});

test('checkForUpdate reports newer, equal, opt-out, unknown and offline without throwing', async t => {
  const dir = temp(t), cacheFile = join(dir, 'cache.json');
  const newer = await checkForUpdate({ current: '0.1.1', fetch: fakeFetch(200, { tag_name: 'v0.1.2', html_url: 'u' }), cacheFile, env: {} });
  assert.deepEqual(newer, { current: '0.1.1', latest: '0.1.2', url: 'u', newer: true });
  assert.match(describe(newer), /^UPDATE AVAILABLE: Hearth v0\.1\.2 \(installed v0\.1\.1\)\. Release: u$/);
  const same = await checkForUpdate({ current: '0.1.2', fetch: fakeFetch(200, { tag_name: 'v0.1.2', html_url: 'u' }), cacheFile: join(dir, 'c2.json'), env: {} });
  assert.equal(same.newer, false);
  assert.equal(describe(same), 'Eidolon is up to date (v0.1.2).');
  const off = await checkForUpdate({ current: '0.1.1', fetch: () => { throw Error('must not be called'); }, cacheFile: join(dir, 'c3.json'), env: { EIDOLON_UPDATE_CHECK: '0' } });
  assert.equal(off.skipped, 'EIDOLON_UPDATE_CHECK=0');
  const unknown = await checkForUpdate({ current: null, fetch: () => { throw Error('must not be called'); }, cacheFile: join(dir, 'c4.json'), env: {} });
  assert.equal(unknown.skipped, 'installed version unknown');
  const offline = await checkForUpdate({ current: '0.1.1', fetch: async () => { throw Error('ECONNREFUSED'); }, cacheFile: join(dir, 'c5.json'), env: {} });
  assert.match(offline.skipped, /no answer from GitHub: ECONNREFUSED/);
  assert.equal(existsSync(join(dir, 'c5.json')), false, 'a failed check is not cached');
});

test('a fresh cache answers for a day; a stale one and --force ask again', async t => {
  const dir = temp(t), cacheFile = join(dir, 'cache.json');
  const first = fakeFetch(200, { tag_name: 'v0.1.2', html_url: 'u' });
  await checkForUpdate({ current: '0.1.1', fetch: first, cacheFile, env: {}, now: 1000 });
  assert.equal(JSON.parse(readFileSync(cacheFile, 'utf8')).latest.version, '0.1.2');
  const second = fakeFetch(200, { tag_name: 'v0.1.3', html_url: 'u3' });
  const cached = await checkForUpdate({ current: '0.1.1', fetch: second, cacheFile, env: {}, now: 1000 + 23 * 3600 * 1000 });
  assert.equal(cached.latest, '0.1.2');
  assert.equal(second.calls.length, 0);
  const stale = await checkForUpdate({ current: '0.1.1', fetch: second, cacheFile, env: {}, now: 1000 + 25 * 3600 * 1000 });
  assert.equal(stale.latest, '0.1.3');
  const forced = await checkForUpdate({ current: '0.1.1', fetch: fakeFetch(200, { tag_name: 'v0.1.4', html_url: 'u4' }), cacheFile, env: {}, now: 1000 + 25 * 3600 * 1000, force: true });
  assert.equal(forced.latest, '0.1.4');
});

test('the CLI prints one line, exits 0, and stays quiet about a server that does not answer', async t => {
  const dir = temp(t);
  const url = await serve(t, { tag_name: 'v99.0.0', html_url: 'https://example.invalid/r' });
  const env = { ...process.env, EIDOLON_RELEASE_API: url, EIDOLON_UPDATE_CACHE: join(dir, 'cache.json') };
  delete env.EIDOLON_UPDATE_CHECK;
  let r = await run([], env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^UPDATE AVAILABLE: Hearth v99\.0\.0 \(installed v\d+\.\d+\.\d+\)\. Release: https:\/\/example\.invalid\/r\n$/);
  r = await run(['--json'], env);
  assert.equal(JSON.parse(r.stdout).newer, true);
  // A closed port: the check reports a skip on stdout and nothing on stderr.
  r = await run(['--force'], { ...env, EIDOLON_RELEASE_API: 'http://127.0.0.1:9/latest', EIDOLON_UPDATE_CACHE: join(dir, 'c2.json') });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^Update check skipped: no answer from GitHub: /);
  assert.equal(r.stderr, '');
  r = await run([], { ...env, EIDOLON_UPDATE_CHECK: '0' });
  assert.equal(r.stdout, 'Update check skipped: EIDOLON_UPDATE_CHECK=0\n');
});
