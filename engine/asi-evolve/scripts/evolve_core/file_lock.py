"""Bounded OS locks; never grow, replace, or unlink an active sentinel."""
from __future__ import annotations

import errno
import os
import time
from pathlib import Path

from .safety import checked_path, finite

if os.name == 'nt':
    import msvcrt
else:
    import fcntl


class InterProcessFileLock:
    """Serialize cooperating processes. This is not an ACL against the same user."""

    def __init__(self, path: Path, timeout: float = 30):
        self.path = Path(path)
        self.timeout = finite(timeout, 'lock timeout')
        if self.timeout <= 0 or self.timeout > 3600:
            raise ValueError('Invalid lock timeout')
        self._handle = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        checked_path(self.path.parent.resolve(), self.path)
        fd = os.open(self.path, os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        self._handle = os.fdopen(fd, 'r+b', buffering=0)
        try:
            # Windows locks one byte, including beyond EOF. Write only once under lock.
            deadline = time.monotonic() + self.timeout
            while True:
                try:
                    self._handle.seek(0)
                    if os.name == 'nt':
                        msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
                    else:
                        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except OSError as exc:
                    if exc.errno not in (errno.EACCES, errno.EAGAIN, errno.EDEADLK):
                        raise
                    if time.monotonic() >= deadline:
                        raise TimeoutError('Timed out waiting for engine state lock') from exc
                    time.sleep(0.025)
            if os.fstat(fd).st_size == 0:
                self._handle.write(b'\0')
                self._handle.flush()
            return self
        except BaseException:
            self._handle.close()
            self._handle = None
            raise

    def __exit__(self, exc_type, exc, tb):
        if self._handle is None:
            return
        try:
            self._handle.seek(0)
            if os.name == 'nt':
                msvcrt.locking(self._handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(self._handle.fileno(), fcntl.LOCK_UN)
        finally:
            self._handle.close()
            self._handle = None
