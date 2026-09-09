"""Bounded data, portable paths and durable writes; no proposed code executes here.

This is an Eidolon-maintained hardening layer, not an operating-system sandbox.
The host's permissions remain responsible for enforcing operator-only authority.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import tempfile
from typing import Any

MAX_DATA_BYTES = 64 * 1024 * 1024
MAX_SPEC_BYTES = 1024 * 1024
MAX_TEXT_BYTES = 4 * 1024 * 1024
MAX_ITEMS = 10000
_RESERVED_NAMES = re.compile(r"^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", re.I)
_AUTHORITY_PARTS = {'.git', '.claude', '.agents', '.codex', '.eidolon'}


def portable_name(value: str, label: str = 'name') -> str:
    if (not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,79}', value)
            or value.endswith('.') or _RESERVED_NAMES.match(value)):
        raise ValueError(f'{label} must be a single portable, non-reserved path component')
    return value


def _is_link(info: os.stat_result) -> bool:
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, 'st_file_attributes', 0) & 0x400)


def checked_path(root: Path, path: Path | str, *, allow_root: bool = False) -> Path:
    """Confine lexically before resolving, rejecting links and Windows reparse points."""
    root = Path(root).resolve(strict=True)
    path = Path(path)
    absolute = Path(os.path.abspath(path if path.is_absolute() else root / path))
    try:
        parts = absolute.relative_to(root).parts
    except ValueError as exc:
        raise PermissionError('Path escapes the approved workspace') from exc
    if not parts and not allow_root:
        raise PermissionError('An operation must name a path below the workspace')
    current = root
    for part in parts:
        if any(c in part for c in ('\0', '\r', '\n', ':')) or part.endswith((' ', '.')):
            raise PermissionError('Unsupported or ambiguous path component')
        current /= part
        try:
            info = current.lstat()
        except FileNotFoundError:
            continue
        if _is_link(info):
            raise PermissionError('Linked or redirected paths require operator review')
        if stat.S_ISREG(info.st_mode) and info.st_nlink != 1:
            raise PermissionError('Multiply linked files are not supported')
    return absolute


def run_directory(value: Path | str) -> Path:
    """Only WORKSPACE/.evolve_runs/RUN is a run, not an arbitrary pair of parents."""
    path = Path(os.path.abspath(value))
    portable_name(path.name, 'run name')
    if path.parent.name != '.evolve_runs':
        raise ValueError('Run directory must be WORKSPACE/.evolve_runs/RUN')
    workspace = path.parent.parent.resolve(strict=True)
    return checked_path(workspace, workspace / '.evolve_runs' / path.name)


def bounded_bytes(path: Path, limit: int = MAX_DATA_BYTES) -> bytes:
    path = Path(path)
    info = path.lstat()
    if _is_link(info) or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise PermissionError('Only ordinary, non-linked data files are supported')
    if info.st_size > limit:
        raise ValueError('Input exceeds its documented size limit')
    flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_BINARY', 0)
    fd = os.open(path, flags)
    with os.fdopen(fd, 'rb') as handle:
        opened = os.fstat(handle.fileno())
        if opened.st_ino != info.st_ino or opened.st_dev != info.st_dev:
            raise PermissionError('Input changed while being opened')
        data = handle.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Input exceeds its documented size limit')
    return data


def bounded_text(path: Path, limit: int = MAX_DATA_BYTES) -> str:
    return bounded_bytes(path, limit).decode('utf-8-sig', errors='strict')


def _no_constant(value: str) -> None:
    raise ValueError('Non-finite JSON numbers are not accepted')


def _unique_object(pairs: list[tuple[str, Any]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON object keys are not accepted')
        result[key] = value
    return result


def read_json(path: Path, limit: int = MAX_DATA_BYTES) -> Any:
    return json.loads(bounded_text(path, limit), parse_constant=_no_constant, object_pairs_hook=_unique_object)


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf-8')


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def atomic_write(path: Path, content: str | bytes) -> None:
    """Write in the target directory, fsync, then replace. Never follow a target link."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    checked_path(path.parent, path)
    data = content.encode('utf-8') if isinstance(content, str) else content
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '.', suffix='.tmp', dir=path.parent)
    stage = Path(temporary)
    try:
        with os.fdopen(fd, 'wb') as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        checked_path(path.parent, path)
        os.replace(stage, path)
        if os.name != 'nt':
            directory_fd = os.open(path.parent, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
    finally:
        stage.unlink(missing_ok=True)


def write_json(path: Path, value: Any) -> None:
    atomic_write(path, canonical(value) + b'\n')


def integer(value: Any, name: str, minimum: int = 0, maximum: int = MAX_ITEMS) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(f'{name} must be an integer in [{minimum}, {maximum}]')
    return value


def finite(value: Any, name: str = 'score') -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f'{name} must be a finite number')
    return float(value)


def strings(value: Any, name: str, *, nonempty: bool = False) -> list[str]:
    if (not isinstance(value, list) or len(value) > 256 or (nonempty and not value)
            or any(not isinstance(item, str) or not item.strip() or len(item) > 32768 for item in value)):
        raise ValueError(f'{name} must be a bounded list of nonempty strings')
    return value


def authority_path(workspace: Path, target: Path) -> bool:
    if target.is_relative_to(Path(__file__).resolve().parents[2]):
        return True
    parts = target.relative_to(workspace).parts
    lowered = [p.casefold() for p in parts]
    if any(p in _AUTHORITY_PARTS for p in lowered):
        return True
    if lowered and (lowered[0] == 'hooks' or lowered[0] in ('decisions.md', 'decision.md')):
        return True
    return len(lowered) >= 2 and lowered[0] == 'docs' and lowered[1] in ('fixes', 'insights', 'decisions')
