"""Redacted full reachable-history scan with a deleted-secret detector self-test.

Requires Gitleaks 8.30.1. The CI downloads its explicitly SHA-256-pinned release.
Only exact, recomputed vendored-file digests are automatically triaged as benign.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import secrets
import subprocess
import tempfile


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args])


def scan(scanner, repo, report, config):
    result = subprocess.run([scanner, 'git', str(repo), '--log-opts=--all --full-history',
                             '--config', str(config), '--redact=100', '--ignore-gitleaks-allow',
                             '--max-decode-depth=3', '--max-archive-depth=3', '--no-banner',
                             '--report-format=json', '--report-path', str(report)],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=600)
    if result.returncode not in (0, 1) or not report.exists():
        raise RuntimeError('Secret scan did not complete; not a clean result')
    return json.loads(report.read_text(encoding='utf-8'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gitleaks', required=True)
    parser.add_argument('--repo', type=Path, default=Path.cwd())
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    repo = args.repo.resolve()
    if git(repo, 'rev-parse', '--is-shallow-repository').strip() != b'false':
        raise RuntimeError('Shallow history cannot satisfy the requested audit scope')
    subprocess.run(['git', '-C', str(repo), 'fsck', '--full'], check=True, capture_output=True)
    with tempfile.TemporaryDirectory(prefix='eidolon-history-audit-') as temporary:
        tmp = Path(temporary)
        config = tmp / 'scanner.toml'
        config.write_text('title = "Independent full history scan"\n[extend]\nuseDefault = true\n')
        probe = tmp / 'probe'; probe.mkdir()
        subprocess.run(['git', 'init', '-q', str(probe)], check=True)
        (probe / 'fixture.txt').write_text('github_token = "ghp_' + secrets.token_hex(18) + '"\n')
        for index in range(2):
            subprocess.run(['git', '-C', str(probe), 'add', '-A'], check=True)
            subprocess.run(['git', '-C', str(probe), '-c', 'user.name=Scanner self-test',
                            '-c', 'user.email=audit@example.invalid', 'commit', '-qm', str(index)], check=True)
            if index == 0:
                (probe / 'fixture.txt').unlink()
        if not scan(args.gitleaks, probe, tmp / 'probe.json', config):
            raise RuntimeError('Deleted-history self-test failed; no clean result is possible')
        matches = scan(args.gitleaks, repo, tmp / 'matches.json', config)
        classified = []
        for item in matches:
            benign = False
            if item['RuleID'] == 'generic-api-key' and item['File'] == 'vendor-lock.json':
                text = git(repo, 'show', item['Commit'] + ':vendor-lock.json').decode('utf-8')
                line = text.splitlines()[item['StartLine'] - 1]
                matched = re.fullmatch(r'\s*"([^"]+)": "([0-9a-f]{64})",?\s*', line)
                if matched:
                    name, digest = matched.groups()
                    if name in json.loads(text).get('files', {}):
                        content = git(repo, 'show', item['Commit'] + ':skills/' + name)
                        benign = hashlib.sha256(content).hexdigest() == digest
            classified.append({'rule': item['RuleID'], 'path': item['File'], 'line': item['StartLine'],
                               'commit': item['Commit'], 'fingerprint': item['Fingerprint'],
                               'classification': 'recomputed vendored content hash' if benign else 'requires review'})
        report = {'schema': 1, 'scanner': 'Gitleaks 8.30.1', 'deleted_history_self_test': True,
                  'head': git(repo, 'rev-parse', 'HEAD').decode().strip(),
                  'commits': int(git(repo, 'rev-list', '--all', '--count')),
                  'refs': git(repo, 'show-ref').decode().splitlines(),
                  'findings': classified,
                  'scope': 'All fetched reachable branches, tags and pull-request heads; not deleted/unadvertised server objects, LFS payloads or external stores'}
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        if any(item['classification'] == 'requires review' for item in classified):
            raise SystemExit(1)
        print(f"Scanned {report['commits']} reachable commits; {len(classified)} recomputed digest matches; no unresolved Gitleaks findings")


if __name__ == '__main__':
    main()
