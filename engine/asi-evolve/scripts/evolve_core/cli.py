"""CLI entrypoints for the Evolve skill."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from difflib import unified_diff
from pathlib import Path
from typing import Any, Dict, List, Optional

from .best_snapshot import BestSnapshotManager
from .cognition import Cognition
from .database import Database
from .run_state import (
    append_round_log,
    build_run_dir,
    compute_missing_fields_for_workspace,
    deep_merge,
    ensure_path_allowed,
    ensure_run_layout,
    flatten_list,
    initialize_cognition_seed_file,
    load_run_spec,
    load_structured_file,
    normalize_spec_path,
    require_evolve_ready,
    save_run_spec,
    workspace_root_for_run,
    write_preflight_summary,
)
from .sampling_config import (
    SAMPLING_CONFIG_IMMUTABLE_ERROR,
    build_database_sampling_config,
    configured_sampling_algorithm,
    configured_sample_n,
    run_has_recorded_nodes,
    sampling_config_fingerprint,
    validate_custom_sampler_for_workspace,
)
from .structures import CognitionItem, Node
from .file_lock import InterProcessFileLock
from .safety import (MAX_SPEC_BYTES, MAX_TEXT_BYTES, atomic_write, bounded_bytes,
    bounded_text, canonical, checked_path, finite, integer, portable_name, read_json,
    run_directory, sha256, write_json)
from .run_state import approve_plan, approval_valid, plan_for, resolve_path
from .execution import evaluate_candidate



def emit_json(payload: Dict[str, Any]) -> int:
    print(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False))
    return 0


def parse_bool(value: Optional[str]) -> Optional[bool]:
    if value is None:
        return None
    lowered = value.strip().lower()
    if lowered in {"1", "true", "yes", "y"}:
        return True
    if lowered in {"0", "false", "no", "n"}:
        return False
    raise argparse.ArgumentTypeError(f"Invalid boolean value: {value}")


def build_database(run_dir: Path, spec: Dict[str, Any]) -> Database:
    algorithm, sampling_kwargs = build_database_sampling_config(
        spec,
        workspace_root_for_run(run_dir),
    )
    return Database(
        storage_dir=Path(run_dir) / "database_data",
        sampling_algorithm=algorithm,
        sampling_kwargs=sampling_kwargs,
    )


def build_cognition(run_dir: Path) -> Cognition:
    return Cognition(storage_dir=Path(run_dir) / "cognition_data", score_threshold=0.0)


def extract_seed_items(markdown_path: Path) -> List[CognitionItem]:
    text = bounded_text(Path(markdown_path), MAX_SPEC_BYTES)
    items: List[CognitionItem] = []
    for raw_block in re.findall(r"```json\s*(.*?)```", text, re.DOTALL):
        payload = json.loads(raw_block)
        if isinstance(payload, dict):
            payload = [payload]
        for raw_item in payload:
            items.append(
                CognitionItem(
                    content=raw_item.get("content", ""),
                    source=raw_item.get("source", ""),
                    metadata=raw_item.get("metadata", {}),
                    id=raw_item.get("id"),
                )
            )
    return items


def command_context(
    workspace_root: Path,
    run_dir: Path,
    step_dir: Path,
    code_path: Path,
    results_path: Path,
    script_path: Optional[str],
    timeout_secs: int,
) -> Dict[str, str]:
    raw = {
        "workspace_root": str(workspace_root),
        "run_dir": str(run_dir),
        "step_dir": str(step_dir),
        "code_path": str(code_path),
        "results_path": str(results_path),
        "script_path": script_path or "",
        "timeout_secs": str(timeout_secs),
    }
    quoted = {
        f"quoted_{key}": f'"{value}"' if value else '""'
        for key, value in raw.items()
    }
    return {**raw, **quoted}


def cmd_brief_normalize(args: argparse.Namespace) -> int:
    workspace_root = Path(args.workspace_root or Path.cwd()).resolve()
    run_dir = build_run_dir(workspace_root, args.run_name)
    ensure_run_layout(run_dir)
    spec = load_run_spec(run_dir)
    original_sampling = sampling_config_fingerprint(spec)
    prior_approval = dict(spec["approval"])

    if args.spec_file:
        spec = deep_merge(spec, load_structured_file(Path(args.spec_file)))

    if args.objective is not None:
        spec["objective"] = args.objective
    if args.core_score is not None:
        spec["evaluation"]["core_score"] = args.core_score
    if args.secondary_metric is not None:
        spec["evaluation"]["secondary_metrics"] = flatten_list(args.secondary_metric)
    if args.evaluation_command is not None:
        spec["evaluation"]["command"] = args.evaluation_command
    if args.evaluation_script_path is not None:
        spec["evaluation"]["script_path"] = normalize_spec_path(
            workspace_root, args.evaluation_script_path
        )
    if args.evaluation_timeout_secs is not None:
        spec["evaluation"]["timeout_secs"] = args.evaluation_timeout_secs
    if args.success_criterion is not None:
        spec["evaluation"]["success_criteria"] = flatten_list(args.success_criterion)
    if args.max_rounds is not None:
        spec["budget"]["max_rounds"] = args.max_rounds
    if args.patience is not None:
        spec["budget"]["patience"] = args.patience
    if args.stop_condition is not None:
        spec["stop_conditions"] = flatten_list(args.stop_condition)
    if args.writable_path is not None:
        spec["mutation_scope"]["writable_paths"] = [
            normalize_spec_path(workspace_root, value)
            for value in flatten_list(args.writable_path)
        ]
    if args.primary_target is not None:
        spec["mutation_scope"]["primary_targets"] = [
            normalize_spec_path(workspace_root, value)
            for value in flatten_list(args.primary_target)
        ]
    if args.sampling_algorithm is not None:
        spec["sampling"]["algorithm"] = args.sampling_algorithm
    if args.sample_n is not None:
        spec["sampling"]["sample_n"] = args.sample_n
    if args.sampling_feature is not None:
        spec["sampling"]["feature_dimensions"] = flatten_list(args.sampling_feature)
    if args.sampling_feature_bins is not None:
        spec["sampling"]["feature_bins"] = args.sampling_feature_bins
    if args.sampling_custom_sampler_path is not None:
        spec["sampling"]["custom_sampler_path"] = normalize_spec_path(
            workspace_root, args.sampling_custom_sampler_path
        )
    if args.sampling_custom_sampler_class is not None:
        spec["sampling"]["custom_sampler_class"] = args.sampling_custom_sampler_class
    if args.cognition_source_mode is not None:
        spec["cognition"]["source_mode"] = args.cognition_source_mode
    if args.seed_file is not None:
        spec["cognition"]["seed_files"] = [
            normalize_spec_path(workspace_root, value) for value in flatten_list(args.seed_file)
        ]
    if args.seed_note is not None:
        spec["cognition"]["seed_notes"] = flatten_list(args.seed_note)
    # A supplied spec file cannot grant authority. Only the explicit digest-confirming
    # command, reviewed by the operator through the host, can publish a receipt.
    spec['approval'] = {'confirmed': False}
    if getattr(args, 'execution_mode', None) is not None:
        spec['evaluation']['execution_mode'] = args.execution_mode

    missing = compute_missing_fields_for_workspace(spec, workspace_root)
    custom_sampler_error = validate_custom_sampler_for_workspace(spec, workspace_root)
    if args.confirmed is True and missing:
        detail = ""
        if custom_sampler_error:
            detail = f" Custom sampler validation failed: {custom_sampler_error}"
        raise SystemExit(
            "Cannot confirm preflight while required fields are missing: "
            + ", ".join(missing)
            + detail
        )

    if run_has_recorded_nodes(run_dir):
        updated_sampling = sampling_config_fingerprint(spec)
        if updated_sampling != original_sampling:
            raise SystemExit(SAMPLING_CONFIG_IMMUTABLE_ERROR)

    plan = plan_for(run_dir, spec) if not missing else None
    if args.confirmed is True:
        plan = approve_plan(run_dir, spec, getattr(args, 'expect_plan', None))
    elif args.confirmed is not False:
        spec['approval'] = prior_approval
        if not approval_valid(run_dir, spec):
            spec['approval'] = {'confirmed': False}
    spec_file = save_run_spec(run_dir, spec)
    summary_file = write_preflight_summary(run_dir, spec)
    seed_file = initialize_cognition_seed_file(run_dir, spec)
    return emit_json(
        {
            "confirmed": spec["approval"]["confirmed"],
            "plan_digest": plan["digest"] if plan else None,
            "execution_mode": spec["evaluation"]["execution_mode"],
            "missing_fields": missing,
            "custom_sampler_error": custom_sampler_error,
            "preflight_summary": str(summary_file),
            "run_dir": str(run_dir),
            "run_spec": str(spec_file),
            "seed_file": str(seed_file),
        }
    )


def cmd_eval_inspect(args: argparse.Namespace) -> int:
    preview = ""
    exists = False
    if args.script_path:
        script_path = Path(args.script_path).resolve()
        exists = script_path.exists()
        if exists:
            preview = "".join(script_path.read_text(encoding="utf-8").splitlines(True)[:20])
    else:
        script_path = None
    return emit_json(
        {
            "command": args.command or "",
            "exists": exists,
            "preview": preview,
            "script_path": str(script_path) if script_path else "",
        }
    )


def cmd_eval_run(args: argparse.Namespace) -> int:
    run_dir = run_directory(args.run_dir)
    spec = require_evolve_ready(run_dir)
    # Legacy overrides may not silently change the approved operation.
    for given, key in [(args.command, 'command'), (args.script_path, 'script_path'), (args.timeout, 'timeout_secs')]:
        if given is not None and given != spec['evaluation'][key]:
            raise PermissionError('Evaluator overrides require a new preflight approval')
    source = resolve_path(workspace_root_for_run(run_dir), args.code_path)
    result = evaluate_candidate(run_dir, spec, source, args.step_name or 'manual_step')
    append_round_log(run_dir, 'eval_run', result)
    emit_json(result)
    return 0 if result['success'] else 1


def cmd_cognition_init(args: argparse.Namespace) -> int:
    run_dir = run_directory(args.run_dir)
    ensure_run_layout(run_dir)
    cognition = build_cognition(run_dir)
    if args.reset:
        cognition.reset()

    seed_path = resolve_path(workspace_root_for_run(run_dir), args.seed_file) if args.seed_file else run_dir / 'cognition_seed.md'
    items = extract_seed_items(seed_path) if seed_path.exists() else []
    if items:
        cognition.add_batch(items)

    append_round_log(
        run_dir,
        "cognition_init",
        {"items_added": len(items), "seed_file": str(seed_path)},
    )
    return emit_json({"items_added": len(items), "total_items": len(cognition)})


def cmd_cognition_add(args: argparse.Namespace) -> int:
    run_dir = run_directory(args.run_dir)
    ensure_run_layout(run_dir)
    cognition = build_cognition(run_dir)
    items: List[CognitionItem] = []
    for text in flatten_list(args.item):
        items.append(
            CognitionItem(
                content=text,
                source=args.source or "",
                metadata={"kind": args.kind} if args.kind else {},
            )
        )
    if args.json_file:
        payload = load_structured_file(resolve_path(workspace_root_for_run(run_dir), args.json_file))
        if isinstance(payload, dict):
            payload = [payload]
        for raw_item in payload:
            items.append(
                CognitionItem(
                    content=raw_item.get("content", ""),
                    source=raw_item.get("source", ""),
                    metadata=raw_item.get("metadata", {}),
                )
            )
    cognition.add_batch(items)
    append_round_log(run_dir, "cognition_add", {"items_added": len(items)})
    return emit_json({"items_added": len(items), "total_items": len(cognition)})


def cmd_cognition_search(args: argparse.Namespace) -> int:
    run_dir = run_directory(args.run_dir)
    cognition = build_cognition(run_dir)
    matches = cognition.retrieve(args.query, top_k=args.top_k)
    return emit_json(
        {
            "matches": [
                {"content": item.content, "metadata": item.metadata, "score": score, "source": item.source}
                for item, score in matches
            ]
        }
    )


def cmd_db_sample(args: argparse.Namespace) -> int:
    run_dir = run_directory(args.run_dir)
    spec = require_evolve_ready(run_dir)
    db = build_database(run_dir, spec)
    configured_algorithm = configured_sampling_algorithm(spec)
    n = integer(args.n if args.n is not None else configured_sample_n(spec), 'sample count', 1, 10000)
    sampled = db.sample(n=n)
    append_round_log(run_dir, "db_sample", {"n": n, "algorithm": configured_algorithm})
    return emit_json({"nodes": [node.to_dict() for node in sampled]})


def cmd_db_record(args: argparse.Namespace) -> int:
    run_dir = run_directory(args.run_dir)
    spec = require_evolve_ready(run_dir)
    workspace = workspace_root_for_run(run_dir)
    step_name = portable_name(args.step_name, 'step name')
    step = checked_path(workspace, run_dir / 'steps' / step_name)
    if (step / 'node.json').exists():
        raise FileExistsError('This evaluated step has already been recorded')
    receipt = read_json(step / 'evaluation-receipt.json', MAX_SPEC_BYTES)
    if (receipt.get('version') != 1 or receipt.get('success') is not True
            or receipt.get('return_code') != 0 or receipt.get('step_name') != step_name
            or receipt.get('plan_digest') != plan_for(run_dir, spec)['digest']):
        raise PermissionError('A successful receipt for the current approved evaluator is required')
    code_path = ensure_path_allowed(run_dir, resolve_path(workspace, args.code_path))
    code = bounded_bytes(code_path, MAX_TEXT_BYTES)
    evaluated = bounded_bytes(step / 'code', MAX_TEXT_BYTES)
    if code != evaluated or sha256(code) != receipt['code_sha256']:
        raise PermissionError('Recorded code must exactly match the evaluated candidate')
    results_path = step / 'results.json'
    if args.results_file and resolve_path(workspace, args.results_file) != results_path:
        raise PermissionError('Only the evaluated result file may be recorded')
    if sha256(bounded_bytes(results_path, MAX_SPEC_BYTES)) != receipt['results_sha256']:
        raise PermissionError('Results changed after evaluation')
    results = read_json(results_path, MAX_SPEC_BYTES)
    score = finite(receipt['score'])
    if results.get('success') is not True or finite(results['score']) != score:
        raise PermissionError('Receipt and result score disagree')
    if args.score is not None and finite(args.score) != score:
        raise PermissionError('A caller may not replace the evaluated score')
    analysis = args.analysis or ''
    if args.analysis_file:
        analysis_path = ensure_path_allowed(run_dir, resolve_path(workspace, args.analysis_file))
        analysis = bounded_text(analysis_path, MAX_TEXT_BYTES)
    node = Node(name=args.name, parent=args.parent or [], motivation=args.motivation or '',
                code=code.decode('utf-8', errors='strict'), results=results, analysis=analysis,
                score=score, meta_info={'step_name': step_name, 'plan_digest': receipt['plan_digest']})
    db = build_database(run_dir, spec)
    # The database is authoritative across a crash between its commit and the convenience snapshot.
    if any(n.meta_info.get('step_name') == step_name for n in db.get_all()):
        raise FileExistsError('This step is already in the database; repair its derived snapshot')
    node_id, previous_nodes = db.add_with_previous_nodes(node)
    write_json(step / 'node.json', node.to_dict())
    if analysis:
        atomic_write(step / 'analysis.md', analysis)
    best_updated = not previous_nodes or score > max(n.score for n in previous_nodes)
    if best_updated:
        best = checked_path(workspace, run_dir / 'best' / step_name)
        best.mkdir(exist_ok=False)
        atomic_write(best / 'code', code)
        atomic_write(best / 'results.json', bounded_bytes(results_path, MAX_SPEC_BYTES))
    append_round_log(run_dir, 'db_record', {'node_id': node_id, 'score': score, 'step_name': step_name})
    return emit_json({'best_updated': best_updated, 'node_id': node_id, 'step_dir': str(step)})


def cmd_db_best(args: argparse.Namespace) -> int:
    run_dir = run_directory(args.run_dir)
    spec = require_evolve_ready(run_dir)
    db = build_database(run_dir, spec)
    nodes = db.get_all()
    if not nodes:
        return emit_json({"best": None})
    best = max(nodes, key=lambda node: node.score)
    return emit_json({"best": best.to_dict()})


def cmd_db_stats(args: argparse.Namespace) -> int:
    run_dir = run_directory(args.run_dir)
    spec = require_evolve_ready(run_dir)
    db = build_database(run_dir, spec)
    nodes, sampler_stats = db.snapshot()
    best_score = max((node.score for node in nodes), default=0.0)
    return emit_json(
        {
            "best_score": best_score,
            "sampler_stats": sampler_stats,
            "total_nodes": len(nodes),
        }
    )


def cmd_files_read(args: argparse.Namespace) -> int:
    run_dir = run_directory(args.run_dir)
    workspace_root = workspace_root_for_run(run_dir)
    target = Path(args.path)
    if not target.is_absolute():
        target = resolve_path(workspace_root, str(target))
    ensure_path_allowed(run_dir, target)
    return emit_json({"content": bounded_text(target, MAX_TEXT_BYTES), "path": str(target)})


def cmd_files_write(args: argparse.Namespace) -> int:
    run_dir = run_directory(args.run_dir)
    require_evolve_ready(run_dir)
    workspace_root = workspace_root_for_run(run_dir)
    target = Path(args.path)
    if not target.is_absolute():
        target = resolve_path(workspace_root, str(target))
    ensure_path_allowed(run_dir, target, write=True)

    if args.from_file:
        content_source = Path(args.from_file)
        if not content_source.is_absolute():
            content_source = resolve_path(workspace_root, str(content_source))
        ensure_path_allowed(run_dir, content_source)
        content = bounded_text(content_source, MAX_TEXT_BYTES)
    else:
        content = args.content or ""

    target.parent.mkdir(parents=True, exist_ok=True)
    if len(content.encode('utf-8')) > MAX_TEXT_BYTES:
        raise ValueError('Text is too large')
    atomic_write(target, content)
    append_round_log(run_dir, "file_write", {"path": str(target)})
    return emit_json({"bytes_written": len(content.encode("utf-8")), "path": str(target)})


def cmd_files_diff(args: argparse.Namespace) -> int:
    run_dir = run_directory(args.run_dir)
    workspace_root = workspace_root_for_run(run_dir)
    left = Path(args.path)
    right = Path(args.other_path)
    if not left.is_absolute():
        left = resolve_path(workspace_root, str(left))
    if not right.is_absolute():
        right = resolve_path(workspace_root, str(right))
    ensure_path_allowed(run_dir, left)
    ensure_path_allowed(run_dir, right)

    diff = "".join(
        unified_diff(
            bounded_text(left, MAX_TEXT_BYTES).splitlines(True),
            bounded_text(right, MAX_TEXT_BYTES).splitlines(True),
            fromfile=str(left),
            tofile=str(right),
        )
    )
    return emit_json({"diff": diff})


def cmd_summary_final(args: argparse.Namespace) -> int:
    run_dir = run_directory(args.run_dir)
    spec = require_evolve_ready(run_dir)
    db = build_database(run_dir, spec)
    nodes = db.get_all()
    best = max(nodes, key=lambda node: node.score) if nodes else None
    summary_lines = [
        "# Final Summary",
        "",
        f"- Objective: {spec.get('objective', '')}",
        f"- Total nodes: {len(nodes)}",
        f"- Best score: {best.score if best else 0.0}",
        f"- Best node: {best.name if best else 'none'}",
    ]
    if best:
        summary_lines.append(f"- Best motivation: {best.motivation}")
    summary_path = Path(run_dir) / "final_summary.md"
    atomic_write(summary_path, "\n".join(summary_lines) + "\n")
    append_round_log(run_dir, "summary_final", {"path": str(summary_path)})
    return emit_json({"summary_path": str(summary_path)})


def build_brief_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="evolve-brief")
    subparsers = parser.add_subparsers(dest="command", required=True)
    normalize = subparsers.add_parser("normalize")
    normalize.add_argument("--workspace-root")
    normalize.add_argument("--run-name", required=True)
    normalize.add_argument("--spec-file")
    normalize.add_argument("--objective")
    normalize.add_argument("--core-score")
    normalize.add_argument("--secondary-metric", action="append")
    normalize.add_argument("--evaluation-command")
    normalize.add_argument("--evaluation-script-path")
    normalize.add_argument("--evaluation-timeout-secs", type=int)
    normalize.add_argument("--success-criterion", action="append")
    normalize.add_argument("--max-rounds", type=int)
    normalize.add_argument("--patience", type=int)
    normalize.add_argument("--stop-condition", action="append")
    normalize.add_argument("--writable-path", action="append")
    normalize.add_argument("--primary-target", action="append")
    normalize.add_argument("--sampling-algorithm")
    normalize.add_argument("--sample-n", type=int)
    normalize.add_argument("--sampling-feature", action="append")
    normalize.add_argument("--sampling-feature-bins", type=int)
    normalize.add_argument("--sampling-custom-sampler-path")
    normalize.add_argument("--sampling-custom-sampler-class")
    normalize.add_argument("--cognition-source-mode")
    normalize.add_argument("--seed-file", action="append")
    normalize.add_argument("--seed-note", action="append")
    normalize.add_argument("--confirmed", type=parse_bool)
    normalize.add_argument("--expect-plan")
    normalize.add_argument("--execution-mode", choices=['trusted-local', 'unconfirmed'])
    normalize.set_defaults(func=cmd_brief_normalize)
    return parser


def build_eval_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="evolve-eval")
    subparsers = parser.add_subparsers(dest="command", required=True)
    inspect_cmd = subparsers.add_parser("inspect")
    inspect_cmd.add_argument("--script-path")
    inspect_cmd.add_argument("--command")
    inspect_cmd.set_defaults(func=cmd_eval_inspect)

    run_cmd = subparsers.add_parser("run")
    run_cmd.add_argument("--run-dir", required=True)
    run_cmd.add_argument("--code-path", required=True)
    run_cmd.add_argument("--step-name")
    run_cmd.add_argument("--command")
    run_cmd.add_argument("--script-path")
    run_cmd.add_argument("--timeout", type=int)
    run_cmd.set_defaults(func=cmd_eval_run)
    return parser


def build_cognition_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="evolve-cognition")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_cmd = subparsers.add_parser("init")
    init_cmd.add_argument("--run-dir", required=True)
    init_cmd.add_argument("--seed-file")
    init_cmd.add_argument("--reset", action="store_true")
    init_cmd.set_defaults(func=cmd_cognition_init)

    add_cmd = subparsers.add_parser("add")
    add_cmd.add_argument("--run-dir", required=True)
    add_cmd.add_argument("--item", action="append")
    add_cmd.add_argument("--json-file")
    add_cmd.add_argument("--kind")
    add_cmd.add_argument("--source")
    add_cmd.set_defaults(func=cmd_cognition_add)

    search_cmd = subparsers.add_parser("search")
    search_cmd.add_argument("--run-dir", required=True)
    search_cmd.add_argument("--query", required=True)
    search_cmd.add_argument("--top-k", type=int, default=5)
    search_cmd.set_defaults(func=cmd_cognition_search)
    return parser


def build_db_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="evolve-db")
    subparsers = parser.add_subparsers(dest="command", required=True)

    sample_cmd = subparsers.add_parser("sample")
    sample_cmd.add_argument("--run-dir", required=True)
    sample_cmd.add_argument("--n", type=int)
    sample_cmd.set_defaults(func=cmd_db_sample)

    record_cmd = subparsers.add_parser("record")
    record_cmd.add_argument("--run-dir", required=True)
    record_cmd.add_argument("--step-name", required=True)
    record_cmd.add_argument("--name", required=True)
    record_cmd.add_argument("--code-path", required=True)
    record_cmd.add_argument("--motivation")
    record_cmd.add_argument("--analysis")
    record_cmd.add_argument("--analysis-file")
    record_cmd.add_argument("--results-file")
    record_cmd.add_argument("--score", type=float)
    record_cmd.add_argument("--parent", type=int, action="append")
    record_cmd.set_defaults(func=cmd_db_record)

    best_cmd = subparsers.add_parser("best")
    best_cmd.add_argument("--run-dir", required=True)
    best_cmd.set_defaults(func=cmd_db_best)

    stats_cmd = subparsers.add_parser("stats")
    stats_cmd.add_argument("--run-dir", required=True)
    stats_cmd.set_defaults(func=cmd_db_stats)
    return parser


def build_files_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="evolve-files")
    subparsers = parser.add_subparsers(dest="command", required=True)

    read_cmd = subparsers.add_parser("read")
    read_cmd.add_argument("--run-dir", required=True)
    read_cmd.add_argument("--path", required=True)
    read_cmd.set_defaults(func=cmd_files_read)

    write_cmd = subparsers.add_parser("write")
    write_cmd.add_argument("--run-dir", required=True)
    write_cmd.add_argument("--path", required=True)
    write_cmd.add_argument("--content")
    write_cmd.add_argument("--from-file")
    write_cmd.set_defaults(func=cmd_files_write)

    diff_cmd = subparsers.add_parser("diff")
    diff_cmd.add_argument("--run-dir", required=True)
    diff_cmd.add_argument("--path", required=True)
    diff_cmd.add_argument("--other-path", required=True)
    diff_cmd.set_defaults(func=cmd_files_diff)
    return parser


def build_summary_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="evolve-summary")
    subparsers = parser.add_subparsers(dest="command", required=True)
    final_cmd = subparsers.add_parser("final")
    final_cmd.add_argument("--run-dir", required=True)
    final_cmd.set_defaults(func=cmd_summary_final)
    return parser


def main_for(entrypoint: str, argv: Optional[List[str]] = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    parsers = {
        "brief": build_brief_parser,
        "cognition": build_cognition_parser,
        "db": build_db_parser,
        "eval": build_eval_parser,
        "files": build_files_parser,
        "summary": build_summary_parser,
    }
    parser = parsers[entrypoint]()
    args = parser.parse_args(argv)
    try:
        if getattr(args, 'run_dir', None):
            run_dir = run_directory(args.run_dir)
        elif getattr(args, 'run_name', None):
            run_dir = build_run_dir(Path(args.workspace_root or Path.cwd()), args.run_name)
        else:
            return args.func(args)
        ensure_run_layout(run_dir)
        with InterProcessFileLock(run_dir / '.run.lock'):
            return args.func(args)
    except (OSError, ValueError, TypeError, KeyError, RecursionError) as exc:
        print('EVOLVE: operation refused (' + type(exc).__name__ + '). ' + str(exc), file=sys.stderr)
        return 2
