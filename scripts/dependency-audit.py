"""Check every pinned version against PyPI; optionally materialize wheel-hash locks.

No package or model code is imported. Resolution is a separate maintainer operation;
this consumes the already reviewed universal resolver output, including markers.
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
NORMALIZE = lambda text: re.sub(r'[-_.]+', '-', text).lower()
LIMIT = 8 * 1024 * 1024


def metadata(pair):
    name, version = pair
    url = 'https://pypi.org/pypi/' + name + '/' + version + '/json'
    request = urllib.request.Request(url, headers={'User-Agent': 'Eidolon dependency audit/1'})
    with urllib.request.urlopen(request, timeout=30) as response:
        if not response.geturl().startswith('https://pypi.org/'):
            raise ValueError('Unexpected metadata authority for ' + name + '==' + version)
        raw = response.read(LIMIT + 1)
    if len(raw) > LIMIT:
        raise ValueError('Package metadata exceeds audit limit for ' + name + '==' + version)
    data = json.loads(raw)
    if NORMALIZE(data['info']['name']) != NORMALIZE(name) or data['info']['version'] != version:
        raise ValueError('Package metadata identity mismatch for ' + name + '==' + version)
    hashes = sorted({item['digests']['sha256'] for item in data['urls']
                     if item.get('packagetype') == 'bdist_wheel' and not item.get('yanked')})
    if any(not re.fullmatch('[0-9a-f]{64}', value) for value in hashes):
        raise ValueError('Invalid wheel digest for ' + name + '==' + version)
    advisories = [{'id': item['id'], 'aliases': item.get('aliases', []),
                   'fixed_in': item.get('fixed_in', []), 'withdrawn': item.get('withdrawn')}
                  for item in data.get('vulnerabilities', []) if not item.get('withdrawn')]
    return pair, {'name': name, 'version': version, 'wheel_hashes': hashes,
                  'advisories': advisories, 'metadata_sha256': hashlib.sha256(raw).hexdigest()}


def audit(*, write_locks=False, report_path=None):
    resolution_path = ROOT / 'security/dependency-resolution.json'
    resolution_bytes = resolution_path.read_bytes()
    resolution = json.loads(resolution_bytes)
    profiles = resolution['profiles']
    pairs = set()
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
              'source': 'PyPI version metadata', 'resolution_sha256': hashlib.sha256(resolution_bytes).hexdigest(),
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
                      '# Source: security/dependency-resolution.json; do not edit hashes manually.']
            for line, entry in zip(lines, entries):
                if not entry['wheel_hashes']:
                    raise ValueError('No approved wheels for ' + line)
                chunks.append(line + ' \\\n' + ' \\\n'.join('    --hash=sha256:' + digest for digest in entry['wheel_hashes']))
            path = ROOT / 'engine' / ('requirements-' + profile + '.lock')
            path.write_text('\n'.join(chunks) + '\n', encoding='utf-8', newline='\n')
        print(f'{profile}: {len(entries)} version pairs, {vulnerable} affected packages, automatic install blocked={profile in blocked}')
    if report_path:
        path = Path(report_path); path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    return 1 if failed else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write-locks', action='store_true', help='Maintainer-only: materialize reviewed exact pins; inspect and commit the diff')
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    try:
        sys.exit(audit(write_locks=args.write_locks, report_path=args.report))
    except Exception as exc:
        print('Dependency audit did not complete: ' + type(exc).__name__ + ': ' + str(exc), file=sys.stderr)
        sys.exit(2)
