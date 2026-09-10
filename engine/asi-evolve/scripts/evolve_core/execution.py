"""Exact argv execution for explicitly approved, trusted local evaluators.

This supervisor is not an operating-system sandbox. Never approve untrusted code
on a machine with sensitive files; use a disposable external sandbox instead.
"""
from __future__ import annotations

import os
from pathlib import Path
import shlex
import shutil
import signal
import string
import subprocess
import sys
import threading
import time

from .safety import (MAX_SPEC_BYTES, atomic_write, bounded_bytes, canonical,
                     checked_path, finite, integer, read_json, sha256, write_json)

_FIELDS = {'workspace_root', 'run_dir', 'step_dir', 'code_path', 'results_path', 'script_path', 'timeout_secs'}
_FIELDS |= {'quoted_' + field for field in tuple(_FIELDS)}
_LOG_LIMIT = 256 * 1024


def approved_argv(spec, workspace):
    """Parse BEFORE substituting paths. No interpolated string is sent to a shell."""
    evaluation = spec['evaluation']
    if evaluation.get('execution_mode') != 'trusted-local':
        raise PermissionError('Explicit trusted-local execution consent is required; this engine is not a sandbox')
    if evaluation['argv']:
        argv = list(evaluation['argv'])
    elif evaluation['command']:
        argv = shlex.split(evaluation['command'], posix=True)
    elif evaluation['script_path']:
        argv = ['python', '{script_path}', '{code_path}', '{results_path}']
    else:
        raise ValueError('No evaluator is configured')
    if not argv or len(argv) > 256:
        raise ValueError('Invalid evaluation argv')
    for token in argv:
        if not isinstance(token, str) or '\0' in token or len(token) > 32768:
            raise ValueError('Invalid argv token')
        if token in (';', '&', '&&', '|', '||', '>', '>>', '<'):
            raise ValueError('Shell operators are unsupported; use a reviewed script file')
        for _, field, format_spec, conversion in string.Formatter().parse(token):
            if field is not None and (field not in _FIELDS or format_spec or conversion):
                raise ValueError('Unsupported evaluation placeholder')
    if '{' in argv[0] or '}' in argv[0]:
        raise ValueError('The evaluator executable must be fixed')
    executable = sys.executable if argv[0] in ('python', 'python3') else shutil.which(argv[0])
    if not executable:
        raise ValueError('Evaluator executable is unavailable')
    executable = Path(executable).resolve(strict=True)
    if executable.suffix.lower() in ('.cmd', '.bat'):
        raise ValueError('Implicit batch-shell execution is unsupported')
    if any(token.casefold() in ('-c', '-command', '-encodedcommand', '-enc', '/c', '-ec', '-lc') for token in argv[1:]):
        raise ValueError('Inline interpreter commands are unsupported; pin a reviewed script file')
    argv[0] = str(executable)
    # Resolve a declared script once. Its contents are separately included in the plan digest.
    if evaluation['script_path']:
        script = checked_path(workspace, evaluation['script_path'])
        if evaluation['argv'] or evaluation['command']:
            supplied = [token for token in argv[1:] if token in ('{script_path}', '{quoted_script_path}', str(script), evaluation['script_path'])]
            if len(supplied) != 1:
                raise ValueError('The declared evaluator script must appear exactly once in argv')
    elif executable.stem.casefold().startswith(('python', 'pypy', 'node', 'ruby', 'perl', 'bash', 'sh', 'powershell', 'pwsh')):
        raise ValueError('Interpreter evaluations require an explicitly declared, hashed script_path')
    return argv


def render_argv(template, context):
    context = {str(k): str(v) for k, v in context.items()}
    # Legacy quoted_* means one argument, not quote characters inserted into an argument.
    context.update({'quoted_' + key: value for key, value in list(context.items())})
    result = [token.format_map(context) for token in template]
    if any('\0' in token for token in result):
        raise ValueError('Invalid rendered argv')
    return result


def clean_environment(step):
    """Do not forward API keys, PYTHONPATH, preload variables, or user model caches."""
    keep = {'PATH', 'SystemRoot', 'WINDIR', 'SYSTEMROOT', 'LANG', 'LC_ALL'}
    env = {key: value for key, value in os.environ.items() if key in keep}
    home, temporary = step / 'home', step / 'tmp'
    for path in (home, temporary):
        path.mkdir(exist_ok=True)
    env.update({'HOME': str(home), 'USERPROFILE': str(home), 'TMP': str(temporary),
                'TEMP': str(temporary), 'TMPDIR': str(temporary), 'XDG_CACHE_HOME': str(temporary),
                'PYTHONNOUSERSITE': '1', 'PYTHONDONTWRITEBYTECODE': '1',
                'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1',
                'OMP_NUM_THREADS': '1', 'OPENBLAS_NUM_THREADS': '1', 'EIDOLON_SUPERVISED': '1'})
    return env


def _terminate(process, *, job=None, grouped=True):
    if job is not None:
        job.terminate()
    elif grouped and os.name != 'nt':
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    if process.poll() is None:
        process.kill()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        raise RuntimeError('Evaluator could not be terminated; manual recovery is required')


def supervise(argv, workspace, step, timeout, *, isolated_group=True):
    integer(timeout, 'timeout', 1, 3600)
    overflow = threading.Event()
    buffers = [bytearray(), bytearray()]
    options = {'start_new_session': isolated_group} if os.name != 'nt' else {'creationflags': 0x00000004 | subprocess.CREATE_NEW_PROCESS_GROUP}  # CREATE_SUSPENDED
    process = subprocess.Popen(argv, shell=False, cwd=workspace, env=clean_environment(step),
                               stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, **options)
    job = None
    if os.name == 'nt':
        from .windows_job import WindowsJob
        job = WindowsJob(process)  # assign before any evaluator instruction runs
    def drain(stream, buffer):
        try:
            while True:
                chunk = stream.read(8192)
                if not chunk:
                    return
                remaining = _LOG_LIMIT - len(buffer)
                buffer.extend(chunk[:max(0, remaining)])
                if len(chunk) > remaining:
                    overflow.set()
        finally:
            stream.close()
    threads = [threading.Thread(target=drain, args=(stream, buffer), daemon=True)
               for stream, buffer in zip((process.stdout, process.stderr), buffers)]
    for thread in threads:
        thread.start()
    reason = ''
    deadline = time.monotonic() + timeout
    try:
        while process.poll() is None:
            if overflow.is_set() or time.monotonic() >= deadline:
                reason = 'output-limit' if overflow.is_set() else 'timeout'
                _terminate(process, job=job, grouped=isolated_group)
                break
            time.sleep(0.01)
        for thread in threads:
            thread.join(timeout=0.5)
        if any(thread.is_alive() for thread in threads):
            reason = reason or 'unclosed-descendant-output'
            _terminate(process, job=job, grouped=isolated_group)
        if overflow.is_set():
            reason = reason or 'output-limit'
    except BaseException:
        _terminate(process, job=job, grouped=isolated_group)
        raise
    finally:
        if job is not None:
            job.close()
        if isolated_group and os.name != 'nt':
            # Disallow background children surviving a completed evaluation.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        for thread in threads:
            thread.join(timeout=1)
        for filename, buffer in zip(('eval.stdout', 'eval.stderr'), buffers):
            atomic_write(step / filename, bytes(buffer))
    return process.returncode, reason


def validate_results(path, evaluation):
    value = read_json(path, MAX_SPEC_BYTES)
    if not isinstance(value, dict) or type(value.get('success')) is not bool:
        raise ValueError('Evaluator must emit an object with Boolean success')
    if value['success'] is not True:
        raise ValueError('Evaluator reported failure')
    key = evaluation['core_score']
    if key not in value:
        raise ValueError('Configured core score is missing from results')
    score = finite(value[key], key)
    minimum = evaluation.get('minimum_score')
    if minimum is not None and score < finite(minimum, 'minimum_score'):
        raise ValueError('Minimum score was not reached')
    # One canonical score: downstream ranking cannot accidentally select another metric.
    value['score'] = score
    value['eval_score'] = score
    return value, score


def evaluate_candidate(run_dir, spec, source, step_name):
    from .run_state import ensure_path_allowed, plan_for, workspace_root_for_run
    from .safety import portable_name
    workspace = workspace_root_for_run(run_dir)
    source = ensure_path_allowed(run_dir, source)
    code = bounded_bytes(source, 4 * 1024 * 1024)
    plan = plan_for(run_dir, spec)
    step = checked_path(workspace, run_dir / 'steps' / portable_name(step_name, 'step name'))
    if step.exists():
        raise FileExistsError('Step names are single-use; existing evidence is never reused')
    ledger_path = run_dir / 'runtime.json'
    ledger = read_json(ledger_path, MAX_SPEC_BYTES) if ledger_path.exists() else {'attempts': 0, 'stalled': 0, 'best': None}
    integer(ledger['attempts'], 'attempts', 0, 10000)
    integer(ledger['stalled'], 'stalled', 0, 10000)
    if ledger['attempts'] >= spec['budget']['max_rounds']:
        raise PermissionError('Approved evaluation budget exhausted')
    if spec['budget']['patience'] and ledger['stalled'] >= spec['budget']['patience']:
        raise PermissionError('Approved patience limit reached')
    step.mkdir(parents=True)
    atomic_write(step / 'code', code)
    ledger['attempts'] += 1
    # A crash consumes an attempt; it cannot produce a free retry or a success receipt.
    write_json(ledger_path, ledger)
    context = {'workspace_root': workspace, 'run_dir': run_dir, 'step_dir': step,
               'code_path': step / 'code', 'results_path': step / 'results.json',
               'script_path': checked_path(workspace, spec['evaluation']['script_path']) if spec['evaluation']['script_path'] else '',
               'timeout_secs': spec['evaluation']['timeout_secs']}
    argv = render_argv(plan['argv_template'], context)
    write_json(step / 'eval.argv.json', argv)
    rc, reason, score = None, '', None
    try:
        rc, reason = supervise(argv, workspace, step, spec['evaluation']['timeout_secs'])
        if rc != 0 or reason:
            raise ValueError(reason or 'nonzero-exit')
        # Reject a judge/source mutation during execution instead of certifying a stale plan.
        if plan_for(run_dir, spec)['digest'] != plan['digest'] or bounded_bytes(step / 'code') != code:
            raise ValueError('Evaluation inputs changed during execution')
        results, score = validate_results(step / 'results.json', spec['evaluation'])
    except (OSError, ValueError, TypeError, KeyError) as exc:
        # No traceback/payload/secret is reflected into a receipt. Logs stay bounded on disk.
        reason = reason or type(exc).__name__
        results = {'success': False, 'score': 0.0, 'eval_score': 0.0, 'error': reason}
    write_json(step / 'results.json', results)
    success = score is not None and results['success'] is True and rc == 0 and not reason
    if success and (ledger['best'] is None or score > finite(ledger['best'], 'best')):
        ledger.update(best=score, stalled=0)
    else:
        ledger['stalled'] += 1
    write_json(ledger_path, ledger)
    receipt = {'version': 1, 'plan_digest': plan['digest'], 'code_sha256': sha256(code),
               'results_sha256': sha256(bounded_bytes(step / 'results.json', MAX_SPEC_BYTES)),
               'return_code': rc, 'success': success, 'score': score if success else None,
               'step_name': step_name}
    write_json(step / 'evaluation-receipt.json', receipt)
    return {'results_path': str(step / 'results.json'), 'return_code': rc,
            'step_dir': str(step), 'success': success, 'failure_reason': reason}
