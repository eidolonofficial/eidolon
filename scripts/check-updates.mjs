// scripts/check-updates.mjs
// Advisory update check: compares this copy's version with the latest Hearth release on GitHub
// (Hearth is the distribution of Eidolon and Setup) and prints one line. It never throws and never
// blocks: no answer within the timeout, or any error, is reported as a skip with exit code 0.
//
//   node scripts/check-updates.mjs            # one line; cached for a day
//   node scripts/check-updates.mjs --force    # ask GitHub even if the cache is fresh
//   node scripts/check-updates.mjs --json     # the result object
//
// Environment: EIDOLON_UPDATE_CHECK=0 turns the check off; EIDOLON_RELEASE_API replaces the API URL
// (tests, mirrors); EIDOLON_UPDATE_CACHE replaces the cache file (default: the OS temp dir).
// The request carries no data beyond a fixed user agent. Nothing is written except the cache file.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const RELEASE_API = 'https://api.github.com/repos/eidolonofficial/Hearth/releases/latest';
export const RELEASES_PAGE = 'https://github.com/eidolonofficial/Hearth/releases';
const DAY = 24 * 60 * 60 * 1000;

export function parseVersion(text) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(text ?? ''));
  return m ? m.slice(1, 4).map(Number) : null;
}

export function isNewer(candidate, current) {
  const a = parseVersion(candidate), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// The installed version is the first release heading of this copy's own CHANGELOG.md.
export function installedVersion(skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')) {
  try {
    const m = /^## v(\d+\.\d+\.\d+)/m.exec(readFileSync(join(skillRoot, 'CHANGELOG.md'), 'utf8'));
    return m ? m[1] : null;
  } catch { return null; }
}

export async function latestRelease({ fetch: f = globalThis.fetch, url = process.env.EIDOLON_RELEASE_API || RELEASE_API, timeoutMs = 3000 } = {}) {
  const res = await f(url, { headers: { 'User-Agent': 'eidolon-update-check', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw Error('HTTP ' + res.status);
  const body = await res.json();
  const version = parseVersion(body.tag_name);
  if (!version) throw Error('no version in tag ' + body.tag_name);
  return { tag: body.tag_name, version: version.join('.'), url: body.html_url || RELEASES_PAGE };
}

export async function checkForUpdate({ current, fetch: f, url, timeoutMs, cacheFile = process.env.EIDOLON_UPDATE_CACHE || join(tmpdir(), 'eidolon-update-check.json'), force = false, now = Date.now(), env = process.env } = {}) {
  if (env.EIDOLON_UPDATE_CHECK === '0') return { skipped: 'EIDOLON_UPDATE_CHECK=0', current };
  if (!current) return { skipped: 'installed version unknown', current };
  let latest = null;
  if (!force) {
    try { const c = JSON.parse(readFileSync(cacheFile, 'utf8')); if (now - c.checkedAt < DAY && c.latest?.version) latest = c.latest; } catch {}
  }
  if (!latest) {
    try { latest = await latestRelease({ fetch: f, url, timeoutMs }); }
    catch (e) { return { skipped: 'no answer from GitHub: ' + (e?.message || e), current }; }
    try { mkdirSync(dirname(cacheFile), { recursive: true }); writeFileSync(cacheFile, JSON.stringify({ checkedAt: now, latest })); } catch {}
  }
  return { current, latest: latest.version, url: latest.url, newer: isNewer(latest.version, current) };
}

export function describe(result) {
  if (result.skipped) return 'Update check skipped: ' + result.skipped;
  return result.newer
    ? `UPDATE AVAILABLE: Hearth v${result.latest} (installed v${result.current}). Release: ${result.url}`
    : `Eidolon is up to date (v${result.current}).`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const result = await checkForUpdate({ current: installedVersion(), force: args.includes('--force') });
  console.log(args.includes('--json') ? JSON.stringify(result) : describe(result));
}
