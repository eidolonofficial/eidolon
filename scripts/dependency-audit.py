"""Audit each reviewed conditional package version without importing package code.

Wheel locks generated here are review candidates, not automatic release approval.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PIN = re.compile(r'^([A-Za-z0-9_.-]+)==([A-Za-z0-9_.+!-]+)(?:\s*;\s*(.+))?$')
NORMALIZE = lambda value: re.sub(r'[-_.]+', '-', value).lower()
LIMIT = 8 * 1024 * 1024


def same_release(left, right):
    """PEP 440 numeric release padding only; other spellings must match exactly."""
    if left == right:
        return True
    if not all(isinstance(value, str) and re.fullmatch(r'[0-9]+(?:\.[0-9]+)*', value)
               for value in (left, right)):
        return False
    a, b = [tuple(map(int, value.split('.'))) for value in (left, right)]
    size = max(len(a), len(b))
    return a + (0,) * (size-len(a)) == b + (0,) * (size-len(b))


def metadata(pair):
    name, version = pair
    request = urllib.request.Request('https://pypi.org/pypi/' + name + '/' + version + '/json',
                                     headers={'User-Agent': 'Eidolon dependency audit/1'})
    with urllib.request.urlopen(request, timeout=30) as response:
        if not response.geturl().startswith('https://pypi.org/'):
            raise ValueError('Unexpected metadata authority for ' + name + '==' + version)
        raw = response.read(LIMIT + 1)
    if len(raw) > LIMIT:
        raise ValueError('Package metadata exceeds audit limit for ' + name + '==' + version)
    data = json.loads(raw)
    if NORMALIZE(data['info']['name']) != NORMALIZE(name) or not same_release(data['info']['version'], version):
        raise ValueError('Package metadata identity mismatch for ' + name + '==' + version)
    hashes = sorted({item['digests']['sha256'] for item in data['urls']
                     if item.get('packagetype') == 'bdist_wheel' and not item.get('yanked')})
    if any(not re.fullmatch('[0-9a-f]{64}', value) for value in hashes):
        raise ValueError('Invalid wheel digest for ' + name + '==' + version)
    advisories = [{'id': item['id'], 'aliases': item.get('aliases', []),
                   'fixed_in': item.get('fixed_in', []), 'withdrawn': item.get('withdrawn')}
                  for item in data.get('vulnerabilities', []) if not item.get('withdrawn')]
    return pair, {'name': name, 'version': version, 'reported_version': data['info']['version'],
                  'wheel_hashes': hashes, 'advisories': advisories,
                  'metadata_sha256': hashlib.sha256(raw).hexdigest()}


def audit(*, write_locks=False, report_path=None):
    source = (ROOT / 'security/dependency-resolution.json').read_bytes()
    resolution = json.loads(source)
    profiles, pairs = resolution['profiles'], set()
    for profile, lines in profiles.items():
        if not re.fullmatch('[a-z0-9-]+', profile) or len(lines) > 1000:
            raise ValueError('Invalid dependency profile')
        for line in lines:
            match = PIN.fullmatch(line)
            if not match:
                raise ValueError('Dependency inputs must be exact version pins')
            pairs.add(match.group(1, 2))
    with ThreadPoolExecutor(max_workers=6) as pool:
        records = dict(pool.map(metadata, sorted(pairs)))
    report = {'schema': 1, 'checked_at': datetime.now(timezone.utc).isoformat(),
              'source': 'PyPI version metadata', 'resolution_sha256': hashlib.sha256(source).hexdigest(),
              'profiles': {}, 'query_errors': []}
    failed = False
    blocked = resolution['automatic_install_blocked']
    for profile, lines in profiles.items():
        entries = [records[PIN.fullmatch(line).group(1, 2)] for line in lines]
        report['profiles'][profile] = {'version_pairs': len(entries),
                                      'automatic_install_blocked': profile in blocked,
                                      'dependencies': entries}
        vulnerable = sum(bool(entry['advisories']) for entry in entries)
        if vulnerable and profile not in blocked:
            failed = True
        if write_locks and profile not in blocked:
            chunks = ['# Reviewed universal pins. Wheel-only, hash-checked installation required.',
                      '# Generated for review from security/dependency-resolution.json.']
            for line, entry in zip(lines, entries):
                if not entry['wheel_hashes']:
                    raise ValueError('No approved wheels for ' + line)
                chunks.append(line + ' \\\n' + ' \\\n'.join('    --hash=sha256:' + digest for digest in entry['wheel_hashes']))
            (ROOT / 'engine' / ('requirements-' + profile + '.lock')).write_text(
                '\n'.join(chunks) + '\n', encoding='utf-8', newline='\n')
        print(f'{profile}: {len(entries)} version pairs, {vulnerable} affected packages, automatic install blocked={profile in blocked}')
    if report_path:
        path = Path(report_path); path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    return 1 if failed else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write-locks', action='store_true')
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    try:
        sys.exit(audit(write_locks=args.write_locks, report_path=args.report))
    except Exception as exc:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps({'schema': 1, 'complete': False,
            'error_type': type(exc).__name__, 'error': str(exc)}, indent=2) + '\n', encoding='utf-8')
        print('Dependency audit did not complete: ' + type(exc).__name__ + ': ' + str(exc), file=sys.stderr)
        sys.exit(2)
