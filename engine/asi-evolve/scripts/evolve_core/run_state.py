"""Run-spec persistence, preflight gating, and path guards."""

from __future__ import annotations

import copy
import json
import os
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import yaml
from .safety import (MAX_SPEC_BYTES, MAX_DATA_BYTES, MAX_TEXT_BYTES, authority_path,
    atomic_write, bounded_bytes, bounded_text, canonical, checked_path, finite,
    integer, portable_name, read_json, run_directory, sha256, strings, write_json)


from .sampling_config import (
    DEFAULT_ISLAND_FEATURE_BINS,
    DEFAULT_ISLAND_FEATURE_DIMENSIONS,
    sampling_summary_lines,
    validate_custom_sampler_for_workspace as validate_sampling_custom_sampler_for_workspace,
)


DEFAULT_RUN_SPEC: Dict[str, Any] = {
    "objective": "",
    "evaluation": {
        "core_score": "",
        "secondary_metrics": [],
        "command": "",
        "argv": [],
        "input_paths": [],
        "minimum_score": None,
        "execution_mode": "unconfirmed",
        "script_path": "",
        "timeout_secs": 0,
        "success_criteria": [],
    },
    "budget": {
        "max_rounds": 0,
        "patience": 0,
    },
    "stop_conditions": [],
    "mutation_scope": {
        "writable_paths": [],
        "primary_targets": [],
    },
    "sampling": {
        "algorithm": "ucb1",
        "sample_n": 3,
        "feature_dimensions": list(DEFAULT_ISLAND_FEATURE_DIMENSIONS),
        "feature_bins": DEFAULT_ISLAND_FEATURE_BINS,
        "custom_sampler_path": "",
        "custom_sampler_class": "",
    },
    "cognition": {
        "source_mode": "",
        "seed_files": [],
        "seed_notes": [],
    },
    "approval": {
        "confirmed": False,
    },
}

REQUIRED_FIELD_CHECKS = {
    "objective": lambda spec: bool(str(spec.get("objective", "")).strip()),
    "evaluation.execution_mode": lambda spec: spec["evaluation"]["execution_mode"] == "trusted-local",
    "evaluation.core_score": lambda spec: bool(
        str(spec.get("evaluation", {}).get("core_score", "")).strip()
    ),
    "evaluation.command_or_script": lambda spec: bool(
        str(spec.get("evaluation", {}).get("command", "")).strip()
        or str(spec.get("evaluation", {}).get("script_path", "")).strip()
        or spec.get("evaluation", {}).get("argv", [])
    ),
    "evaluation.timeout_secs": lambda spec: int(
        spec.get("evaluation", {}).get("timeout_secs", 0) or 0
    )
    > 0,
    "evaluation.success_criteria": lambda spec: bool(
        spec.get("evaluation", {}).get("success_criteria")
    ),
    "budget.max_rounds": lambda spec: int(spec.get("budget", {}).get("max_rounds", 0) or 0)
    > 0,
    "budget.patience": lambda spec: int(spec.get("budget", {}).get("patience", 0) or 0) >= 0,
    "stop_conditions": lambda spec: bool(spec.get("stop_conditions")),
    "mutation_scope.writable_paths": lambda spec: bool(
        spec.get("mutation_scope", {}).get("writable_paths")
    ),
    "mutation_scope.primary_targets": lambda spec: bool(
        spec.get("mutation_scope", {}).get("primary_targets")
    ),
    "sampling.algorithm": lambda spec: bool(
        str(spec.get("sampling", {}).get("algorithm", "")).strip()
    ),
    "sampling.sample_n": lambda spec: int(spec.get("sampling", {}).get("sample_n", 0) or 0) > 0,
    "sampling.custom_sampler": lambda spec: (
        str(spec.get("sampling", {}).get("algorithm", "")).strip() != "custom"
        or (
            bool(str(spec.get("sampling", {}).get("custom_sampler_path", "")).strip())
            and bool(str(spec.get("sampling", {}).get("custom_sampler_class", "")).strip())
        )
    ),
    "cognition.source_mode": lambda spec: bool(
        str(spec.get("cognition", {}).get("source_mode", "")).strip()
    ),
}


def default_run_spec() -> Dict[str, Any]:
    return copy.deepcopy(DEFAULT_RUN_SPEC)


def deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    merged = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = copy.deepcopy(value)
    return merged


def build_run_dir(workspace_root: Path, run_name: str) -> Path:
    workspace_root = Path(workspace_root).resolve(strict=True)
    return checked_path(workspace_root, workspace_root / '.evolve_runs' / portable_name(run_name, 'run name'))


def ensure_run_layout(run_dir: Path) -> Dict[str, Path]:
    run_dir = run_directory(run_dir)
    layout = {
        "run_dir": run_dir,
        "best": run_dir / "best",
        "cognition_data": run_dir / "cognition_data",
        "database_data": run_dir / "database_data",
        "steps": run_dir / "steps",
    }
    run_dir.mkdir(parents=True, exist_ok=True)
    for path in layout.values():
        checked_path(workspace_root_for_run(run_dir), path)
        path.mkdir(parents=True, exist_ok=True)
    round_log = run_dir / "round_log.jsonl"
    if not round_log.exists():
        atomic_write(round_log, "")
    return layout


def workspace_root_for_run(run_dir: Path) -> Path:
    run_dir = run_directory(run_dir)
    return run_dir.parent.parent


def spec_path(run_dir: Path) -> Path:
    return run_directory(run_dir) / "run_spec.yaml"


def load_run_spec(run_dir: Path) -> Dict[str, Any]:
    path = spec_path(run_dir)
    if not path.exists():
        return default_run_spec()
    loaded = load_structured_file(path)
    if not isinstance(loaded, dict):
        raise ValueError('Run spec must be an object')
    spec = deep_merge(default_run_spec(), loaded)
    validate_spec(spec)
    return spec


def save_run_spec(run_dir: Path, spec: Dict[str, Any]) -> Path:
    path = spec_path(run_dir)
    validate_spec(spec)
    atomic_write(path, yaml.safe_dump(spec, allow_unicode=True, sort_keys=False))
    return path


def normalize_spec_path(workspace_root: Path, raw_path: str) -> str:
    return resolve_path(workspace_root, raw_path).relative_to(Path(workspace_root).resolve()).as_posix()


def resolve_path(workspace_root: Path, raw_path: str) -> Path:
    return checked_path(Path(workspace_root), raw_path)


def compute_missing_fields(spec: Dict[str, Any]) -> List[str]:
    return compute_missing_fields_for_workspace(spec)


def compute_missing_fields_for_workspace(
    spec: Dict[str, Any],
    workspace_root: Optional[Path] = None,
) -> List[str]:
    validate_spec(spec)
    missing = []
    for field, check in REQUIRED_FIELD_CHECKS.items():
        if not check(spec):
            missing.append(field)
    custom_sampler_error = validate_custom_sampler_for_workspace(spec, workspace_root)
    if custom_sampler_error:
        missing.append("sampling.custom_sampler_valid")
    return missing


def validate_custom_sampler_for_workspace(
    spec: Dict[str, Any],
    workspace_root: Optional[Path] = None,
) -> str:
    return validate_sampling_custom_sampler_for_workspace(spec, workspace_root)


def write_preflight_summary(run_dir: Path, spec: Dict[str, Any]) -> Path:
    workspace_root = workspace_root_for_run(run_dir)
    missing = compute_missing_fields_for_workspace(spec, workspace_root)
    confirmed = approval_valid(run_dir, spec)
    status = "READY" if confirmed and not missing else "PENDING"
    lines = [
        "# Preflight Summary",
        "",
        f"- Status: `{status}`",
        f"- Objective: {spec.get('objective', '') or '(missing)'}",
        f"- Core score: {spec.get('evaluation', {}).get('core_score', '') or '(missing)'}",
        f"- Secondary metrics: {', '.join(spec.get('evaluation', {}).get('secondary_metrics', [])) or '(none)'}",
        f"- Evaluation command: {spec.get('evaluation', {}).get('command', '') or '(missing)'}",
        f"- Evaluation script: {spec.get('evaluation', {}).get('script_path', '') or '(missing)'}",
        f"- Evaluation timeout (s): {spec.get('evaluation', {}).get('timeout_secs', 0) or '(missing)'}",
        f"- Success criteria: {', '.join(spec.get('evaluation', {}).get('success_criteria', [])) or '(missing)'}",
        f"- Budget: max_rounds={spec.get('budget', {}).get('max_rounds', 0)}, patience={spec.get('budget', {}).get('patience', 0)}",
        f"- Stop conditions: {', '.join(spec.get('stop_conditions', [])) or '(missing)'}",
        f"- Writable paths: {', '.join(spec.get('mutation_scope', {}).get('writable_paths', [])) or '(missing)'}",
        f"- Primary targets: {', '.join(spec.get('mutation_scope', {}).get('primary_targets', [])) or '(missing)'}",
        *sampling_summary_lines(spec, workspace_root),
        f"- Cognition source mode: {spec.get('cognition', {}).get('source_mode', '') or '(missing)'}",
        f"- Cognition seed files: {', '.join(spec.get('cognition', {}).get('seed_files', [])) or '(none)'}",
        f"- Cognition seed notes: {', '.join(spec.get('cognition', {}).get('seed_notes', [])) or '(none)'}",
        f"- Approval confirmed: {confirmed}",
    ]
    lines.extend(
        [
            "",
            "## Missing fields",
        ]
    )
    if missing:
        lines.extend([f"- {field}" for field in missing])
    else:
        lines.append("- none")

    path = Path(run_dir) / "preflight_summary.md"
    atomic_write(path, "\n".join(lines) + "\n")
    return path


def initialize_cognition_seed_file(run_dir: Path, spec: Dict[str, Any]) -> Path:
    path = Path(run_dir) / "cognition_seed.md"
    if path.exists():
        return path

    notes = spec.get("cognition", {}).get("seed_notes", [])
    lines = [
        "# Cognition Seed Draft",
        "",
        f"- source_mode: {spec.get('cognition', {}).get('source_mode', '') or 'pending'}",
        "- Fill this file during preflight and keep the JSON blocks machine-readable.",
        "",
        "## Notes",
    ]
    if notes:
        lines.extend([f"- {note}" for note in notes])
    else:
        lines.append("- Add user-provided or approved research notes here.")
    lines.extend(
        [
            "",
            "## JSON seeds",
            "",
            "```json",
            "[",
            '  {',
            '    "content": "Replace this with a reusable heuristic or observation.",',
            '    "source": "user",',
            '    "metadata": {"kind": "heuristic"}',
            "  }",
            "]",
            "```",
            "",
        ]
    )
    atomic_write(path, "\n".join(lines))
    return path


def require_evolve_ready(run_dir: Path) -> Dict[str, Any]:
    spec = load_run_spec(run_dir)
    missing = compute_missing_fields_for_workspace(spec, workspace_root_for_run(run_dir))
    if missing:
        raise ValueError(
            "Preflight is incomplete. Missing fields: " + ", ".join(missing)
        )
    if not approval_valid(run_dir, spec):
        raise PermissionError("Preflight approval is absent or stale; review the exact current plan again.")
    return spec


def ensure_path_allowed(run_dir: Path, target_path: Path, *, write: bool = False) -> Path:
    spec = load_run_spec(run_dir)
    run_dir = run_directory(run_dir)
    workspace = workspace_root_for_run(run_dir)
    target = checked_path(workspace, target_path)
    if authority_path(workspace, target):
        raise PermissionError('Engine helpers cannot access agent authority or historical records')
    if target.is_relative_to(workspace / '.evolve_runs'):
        if not target.is_relative_to(run_dir):
            raise PermissionError('Another run is outside this run scope')
        rel = target.relative_to(run_dir)
        if write and (not rel.parts or rel.parts[0] != 'candidates'):
            raise PermissionError('Only run candidates are writable through the file helper; run controls and evidence are reserved')
        return target
    if write:
        for protected in immutable_inputs(spec, workspace):
            if target == protected:
                raise PermissionError('Evaluation inputs and custom sampler source are immutable after review')
    allowed = [resolve_path(workspace, raw) for raw in spec['mutation_scope']['writable_paths']]
    if any(target == path or target.is_relative_to(path) for path in allowed):
        return target
    raise PermissionError('Path is outside the approved mutation scope')


def append_round_log(run_dir: Path, event: str, payload: Dict[str, Any]) -> Path:
    entry = {
        "timestamp": datetime.now().isoformat(),
        "event": event,
        "payload": payload,
    }
    path = Path(run_dir) / "round_log.jsonl"
    prior = bounded_bytes(path) if path.exists() else b''
    updated = prior + canonical(entry) + b'\n'
    if len(updated) > MAX_DATA_BYTES:
        raise ValueError('Run log capacity exceeded; retain this run and start a new one')
    atomic_write(path, updated)
    return path


class StrictLoader(yaml.SafeLoader):
    def compose_node(self, parent, index):
        if self.check_event(yaml.AliasEvent):
            raise ValueError('YAML aliases are not accepted in engine configuration')
        self._depth = getattr(self, '_depth', 0) + 1
        if self._depth > 32:
            raise ValueError('Configuration nesting is too deep')
        try:
            return super().compose_node(parent, index)
        finally:
            self._depth -= 1

    def construct_mapping(self, node, deep=False):
        result = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if not isinstance(key, str) or key in result:
                raise ValueError('Configuration keys must be unique strings')
            result[key] = self.construct_object(value_node, deep=deep)
        return result


def load_structured_file(path: Path):
    path = Path(path)
    if path.suffix.lower() == '.json':
        value = read_json(path, MAX_SPEC_BYTES)
    else:
        value = yaml.load(bounded_text(path, MAX_SPEC_BYTES), Loader=StrictLoader)
    if value is None:
        return {}
    canonical(value)  # reject non-JSON YAML values and non-finite numbers
    return value


def flatten_list(values: Iterable[str] | None) -> List[str]:
    if not values:
        return []
    return [value for value in values if value]


def validate_spec(spec):
    if not isinstance(spec, dict):
        raise ValueError('Run spec must be an object')
    canonical(spec)
    for section in ('evaluation', 'budget', 'mutation_scope', 'sampling', 'cognition', 'approval'):
        if not isinstance(spec.get(section), dict):
            raise ValueError('Invalid run spec section: ' + section)
    if type(spec['approval'].get('confirmed')) is not bool:
        raise ValueError('approval.confirmed must be a Boolean, not a truthy value')
    for name, value in [('objective', spec['objective']), ('core_score', spec['evaluation']['core_score']),
                        ('command', spec['evaluation']['command']), ('script_path', spec['evaluation']['script_path'])]:
        if not isinstance(value, str) or len(value) > 32768 or '\0' in value:
            raise ValueError('Invalid text field: ' + name)
    for name in ('secondary_metrics', 'success_criteria', 'argv', 'input_paths'):
        strings(spec['evaluation'][name], 'evaluation.' + name)
    integer(spec['evaluation']['timeout_secs'], 'timeout_secs', 0, 3600)
    if spec['evaluation']['minimum_score'] is not None:
        finite(spec['evaluation']['minimum_score'], 'minimum_score')
    for key in ('max_rounds', 'patience'):
        integer(spec['budget'][key], key, 0, 10000)
    for section, keys in [('mutation_scope', ('writable_paths', 'primary_targets')),
                          ('cognition', ('seed_files', 'seed_notes'))]:
        for key in keys:
            strings(spec[section][key], section + '.' + key)
    strings(spec['stop_conditions'], 'stop_conditions')
    integer(spec['sampling']['sample_n'], 'sample_n', 1, 10000)
    integer(spec['sampling']['feature_bins'], 'feature_bins', 1, 1000)
    strings(spec['sampling']['feature_dimensions'], 'feature_dimensions')
    if spec['sampling']['algorithm'] not in ('ucb1', 'greedy', 'random', 'island', 'custom'):
        raise ValueError('Unknown sampling algorithm')
    for key in ('custom_sampler_path', 'custom_sampler_class'):
        if not isinstance(spec['sampling'][key], str) or len(spec['sampling'][key]) > 4096:
            raise ValueError('Invalid sampler specification')


def immutable_inputs(spec, workspace):
    names = list(spec['evaluation']['input_paths'])
    if spec['evaluation']['script_path']:
        names.append(spec['evaluation']['script_path'])
    if spec['sampling']['algorithm'] == 'custom':
        names.append(spec['sampling']['custom_sampler_path'])
    paths = set()
    for name in names:
        path = resolve_path(workspace, name)
        if path.is_dir():
            for entry in path.rglob('*'):
                checked_path(workspace, entry)
                if entry.is_file():
                    paths.add(entry)
                    if len(paths) > 10000:
                        raise ValueError('Too many evaluation input files')
        else:
            paths.add(path)
    return sorted(paths)


def plan_for(run_dir, spec):
    from .execution import approved_argv
    validate_spec(spec)
    workspace = workspace_root_for_run(run_dir)
    for raw in spec['mutation_scope']['writable_paths'] + spec['mutation_scope']['primary_targets']:
        path = resolve_path(workspace, raw)
        if authority_path(workspace, path):
            raise PermissionError('Agent authority is not an engine mutation scope')
    clean = copy.deepcopy(spec)
    clean['approval'] = {'confirmed': False}
    inputs = {str(path.relative_to(workspace)): sha256(bounded_bytes(path, MAX_TEXT_BYTES))
              for path in immutable_inputs(spec, workspace)}
    argv = approved_argv(spec, workspace)
    executable = Path(argv[0])
    interpreter_digest = sha256(bounded_bytes(executable, MAX_DATA_BYTES))
    import importlib.metadata
    runtime_root = Path(__file__).resolve().parent
    runtime_hashes = {str(path.relative_to(runtime_root)): sha256(bounded_bytes(path, MAX_TEXT_BYTES))
                      for path in sorted(runtime_root.rglob('*.py'))}
    dependencies = {name: importlib.metadata.version(name) for name in ('numpy', 'PyYAML')}
    plan = {'runtime_hashes': runtime_hashes, 'dependency_versions': dependencies,
            'version': 1, 'workspace': str(workspace), 'run_dir': str(run_directory(run_dir)),
            'spec': clean, 'input_hashes': inputs, 'argv_template': argv,
            'executable_sha256': interpreter_digest}
    return {**plan, 'digest': sha256(canonical(plan))}


def approval_path(run_dir):
    workspace = workspace_root_for_run(run_dir)
    key = sha256(str(run_directory(run_dir)).encode('utf-8'))
    return checked_path(workspace, workspace / '.eidolon' / 'engine-approvals' / (key + '.json'))


def approve_plan(run_dir, spec, expected_digest):
    plan = plan_for(run_dir, spec)
    if not isinstance(expected_digest, str) or expected_digest != plan['digest']:
        raise PermissionError('Approval must name the digest of the exact reviewed plan')
    # Host hooks must obtain operator consent for this command. A file is not an OS identity proof.
    write_json(approval_path(run_dir), {'version': 1, 'run_dir': plan['run_dir'],
               'digest': plan['digest'], 'approved_at': datetime.now().isoformat()})
    spec['approval'] = {'confirmed': True, 'plan_digest': plan['digest']}
    return plan


def approval_valid(run_dir, spec):
    if spec['approval'].get('confirmed') is not True:
        return False
    try:
        plan = plan_for(run_dir, spec)
        receipt = read_json(approval_path(run_dir), MAX_SPEC_BYTES)
        return (receipt.get('version') == 1 and receipt.get('run_dir') == plan['run_dir']
                and receipt.get('digest') == plan['digest'] == spec['approval'].get('plan_digest'))
    except (OSError, ValueError, TypeError, KeyError):
        return False
