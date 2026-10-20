"""LocalBlobStore — the blob store on a local directory (dev, tests, single host).

Layout: ``<root>/<prefix>/<key>`` — the same keys the GCS backend uses.

Generations: the file's ``st_mtime_ns``, forced strictly increasing on every write of the
same key (``max(now_ns, previous + 1)``), so it survives restarts with no sidecar files.

Atomicity: every operation holds a process-wide ``threading.Lock`` per root AND an
exclusive ``fcntl.flock`` on ``<root>/.lock`` (so the bank script and the server sharing a
directory never interleave). Writes go to a hidden temp file in the same directory and
are moved into place with ``os.replace`` (readers never see a half-written object).
Blocking file I/O runs in a worker thread.
"""

from __future__ import annotations

import asyncio
import contextlib
import fcntl
import os
import threading
import time
import uuid
from collections.abc import Iterator
from pathlib import Path

from glitch_api.store.base import (
    DEFAULT_CONTENT_TYPE,
    NO_OBJECT,
    AlreadyExists,
    Blob,
    PreconditionFailed,
    StoreError,
    validate_key,
    validate_prefix,
)

LOCK_FILE = ".lock"

_root_locks: dict[str, threading.Lock] = {}
_root_locks_guard = threading.Lock()


def _thread_lock(root: Path) -> threading.Lock:
    with _root_locks_guard:
        return _root_locks.setdefault(str(root), threading.Lock())


class LocalBlobStore:
    backend = "local"

    def __init__(self, root: str | Path, prefix: str = "") -> None:
        self.root = Path(root).expanduser().resolve()
        self.prefix = prefix.strip("/")
        if self.prefix:
            validate_key(self.prefix)
        self.base = self.root / self.prefix if self.prefix else self.root
        self._lock = _thread_lock(self.root)

    # ---- helpers ---------------------------------------------------------------------
    def _path(self, key: str) -> Path:
        return self.base / validate_key(key)

    @contextlib.contextmanager
    def _locked(self) -> Iterator[None]:
        try:
            self.root.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise StoreError(f"cannot create local blob root ({type(exc).__name__})") from exc
        with self._lock:
            with open(self.root / LOCK_FILE, "a+") as fh:
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
                try:
                    yield
                finally:
                    fcntl.flock(fh.fileno(), fcntl.LOCK_UN)

    @staticmethod
    def _generation(path: Path) -> int | None:
        try:
            return path.stat().st_mtime_ns
        except FileNotFoundError:
            return None

    # ---- sync bodies (run in a worker thread) ----------------------------------------
    def _get_sync(self, key: str) -> Blob | None:
        path = self._path(key)
        with self._locked():
            try:
                data = path.read_bytes()
            except (FileNotFoundError, IsADirectoryError):
                return None
            generation = self._generation(path)
        if generation is None:
            return None
        return Blob(key=key, data=data, generation=generation)

    def _put_sync(self, key: str, data: bytes, if_generation_match: int | None) -> int:
        path = self._path(key)
        with self._locked():
            current = self._generation(path)
            if if_generation_match is not None:
                if if_generation_match == NO_OBJECT:
                    if current is not None:
                        raise AlreadyExists(key, NO_OBJECT, current)
                elif current != if_generation_match:
                    raise PreconditionFailed(key, if_generation_match, current)
            try:
                path.parent.mkdir(parents=True, exist_ok=True)
                tmp = path.parent / f".{path.name}.tmp-{uuid.uuid4().hex}"
                tmp.write_bytes(data)
                generation = max(time.time_ns(), (current or 0) + 1)
                os.utime(tmp, ns=(generation, generation))
                os.replace(tmp, path)
            except OSError as exc:
                with contextlib.suppress(Exception):
                    tmp.unlink(missing_ok=True)  # type: ignore[possibly-undefined]
                raise StoreError(f"local blob write failed ({type(exc).__name__})") from exc
            actual = self._generation(path)
            assert actual is not None
            return actual

    def _list_sync(self, prefix: str) -> list[str]:
        validate_prefix(prefix)
        with self._locked():
            if not self.base.is_dir():
                return []
            keys: list[str] = []
            for dirpath, dirnames, filenames in os.walk(self.base):
                dirnames[:] = [d for d in dirnames if not d.startswith(".")]
                for name in filenames:
                    if name.startswith("."):
                        continue
                    rel = (Path(dirpath) / name).relative_to(self.base).as_posix()
                    if rel.startswith(prefix):
                        keys.append(rel)
        return sorted(keys)

    def _delete_sync(self, key: str, if_generation_match: int | None) -> bool:
        path = self._path(key)
        with self._locked():
            current = self._generation(path)
            if if_generation_match is not None and current != if_generation_match:
                raise PreconditionFailed(key, if_generation_match, current)
            if current is None:
                return False
            path.unlink()
            return True

    # ---- protocol --------------------------------------------------------------------
    async def get(self, key: str) -> Blob | None:
        return await asyncio.to_thread(self._get_sync, key)

    async def put(
        self,
        key: str,
        data: bytes,
        *,
        if_generation_match: int | None = None,
        content_type: str = DEFAULT_CONTENT_TYPE,
    ) -> int:
        return await asyncio.to_thread(self._put_sync, key, bytes(data), if_generation_match)

    async def create(self, key: str, data: bytes, *, content_type: str = DEFAULT_CONTENT_TYPE) -> int:
        return await self.put(key, data, if_generation_match=NO_OBJECT, content_type=content_type)

    async def list(self, prefix: str = "") -> list[str]:
        return await asyncio.to_thread(self._list_sync, prefix)

    async def delete(self, key: str, *, if_generation_match: int | None = None) -> bool:
        return await asyncio.to_thread(self._delete_sync, key, if_generation_match)
