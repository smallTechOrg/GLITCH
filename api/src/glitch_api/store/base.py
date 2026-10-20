"""Blob store protocol — the one storage seam for Phase 2+ shared data.

Backends (same object layout, ``spec/data.md`` → Server-side data):
- ``LocalBlobStore`` (``store/local.py``) — a directory (dev, tests, single host).
- ``GcsBlobStore`` (``store/gcs.py``) — a Google Cloud Storage bucket (Cloud Run).

Semantics every backend implements (mirrors GCS object generations):
- Every stored object has an integer ``generation`` that changes on every write and is
  never reused for the same key while the object exists.
- ``put(key, data, if_generation_match=g)`` writes only when the current generation is
  ``g``; ``if_generation_match=NO_OBJECT`` (0) means "only if the key does not exist"
  (conditional create). A failed precondition raises ``PreconditionFailed`` (or its
  subclass ``AlreadyExists`` for a failed create) and writes nothing.
- ``put`` without a precondition is an unconditional overwrite.
- Keys are ``/``-separated relative paths of ``[A-Za-z0-9._-]`` segments (no leading dot),
  no leading ``/``, no empty segment (``validate_key``). Backends may add a root prefix.
- Read-modify-write: ``get`` → change → ``put(if_generation_match=blob.generation)``;
  on ``PreconditionFailed`` re-read and retry (``update_json`` does this).

Objects never contain learner data (counters store hashed device ids only).
"""

from __future__ import annotations

import json
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Final, Protocol, runtime_checkable

NO_OBJECT: Final = 0  # if_generation_match value meaning "create only if absent"
DEFAULT_CONTENT_TYPE: Final = "application/json"

_SEGMENT = re.compile(r"^[A-Za-z0-9_-][A-Za-z0-9._-]*$")  # no leading dot (hidden/temp files)


class StoreError(RuntimeError):
    """Backend failure (I/O, network, permissions). Messages never carry object contents."""


class InvalidKey(StoreError, ValueError):
    """Key failed ``validate_key``."""


class PreconditionFailed(StoreError):
    """A generation precondition did not hold; nothing was written."""

    def __init__(self, key: str, expected: int | None = None, actual: int | None = None) -> None:
        super().__init__(f"generation precondition failed for {key!r} (expected {expected}, actual {actual})")
        self.key = key
        self.expected = expected
        self.actual = actual


class AlreadyExists(PreconditionFailed):
    """Conditional create (``if_generation_match=NO_OBJECT``) found an existing object."""


class ConflictRetriesExhausted(StoreError):
    """``update_json`` lost the generation race more times than allowed."""


@dataclass(frozen=True)
class Blob:
    key: str
    data: bytes
    generation: int

    def json(self) -> Any:
        return json.loads(self.data.decode("utf-8"))


def validate_key(key: str) -> str:
    """Return ``key`` unchanged or raise ``InvalidKey``."""
    if not isinstance(key, str) or not key or key.startswith("/") or key.endswith("/"):
        raise InvalidKey(f"invalid blob key {key!r}")
    for segment in key.split("/"):
        if segment in ("", ".", "..") or not _SEGMENT.match(segment):
            raise InvalidKey(f"invalid blob key {key!r}")
    return key


def validate_prefix(prefix: str) -> str:
    """List prefixes: ``""`` (everything) or a key-like string, optionally ending in ``/``."""
    if prefix == "":
        return prefix
    validate_key(prefix.rstrip("/"))
    return prefix


@runtime_checkable
class BlobStore(Protocol):
    """Async blob store. All methods are safe to call concurrently."""

    backend: str  # "local" | "gcs" | test doubles

    async def get(self, key: str) -> Blob | None:
        """The object and its current generation, or None when absent."""
        ...

    async def put(
        self,
        key: str,
        data: bytes,
        *,
        if_generation_match: int | None = None,
        content_type: str = DEFAULT_CONTENT_TYPE,
    ) -> int:
        """Write ``data``; return the new generation.

        ``if_generation_match``: None = unconditional; ``NO_OBJECT`` (0) = create only if
        absent (else ``AlreadyExists``); g > 0 = only if the current generation is g (else
        ``PreconditionFailed``, also when the object is absent).
        """
        ...

    async def create(self, key: str, data: bytes, *, content_type: str = DEFAULT_CONTENT_TYPE) -> int:
        """Conditional create — ``put(..., if_generation_match=NO_OBJECT)``."""
        ...

    async def list(self, prefix: str = "") -> list[str]:
        """Sorted keys starting with ``prefix`` (recursive)."""
        ...

    async def delete(self, key: str, *, if_generation_match: int | None = None) -> bool:
        """Delete; True when something was deleted. A failed precondition raises."""
        ...


# ---- JSON helpers (backend-agnostic) --------------------------------------------------
def dumps(obj: Any) -> bytes:
    """Canonical JSON bytes (sorted keys, compact, UTF-8)."""
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


async def get_json(store: BlobStore, key: str) -> tuple[Any, int] | None:
    blob = await store.get(key)
    if blob is None:
        return None
    return blob.json(), blob.generation


async def put_json(store: BlobStore, key: str, obj: Any, *, if_generation_match: int | None = None) -> int:
    return await store.put(key, dumps(obj), if_generation_match=if_generation_match)


async def create_json(store: BlobStore, key: str, obj: Any) -> int:
    return await store.create(key, dumps(obj))


async def update_json(
    store: BlobStore,
    key: str,
    mutate: Callable[[Any | None], Any] | Callable[[Any | None], Awaitable[Any]],
    *,
    retries: int = 5,
) -> tuple[Any, int]:
    """Optimistic read-modify-write with generation preconditions.

    ``mutate(current_or_None)`` returns the new object (it must not mutate in place
    expecting the old value to survive). Retries on ``PreconditionFailed`` up to
    ``retries`` extra attempts, then raises ``ConflictRetriesExhausted``.
    Returns (new object, new generation).
    """
    for _ in range(retries + 1):
        current = await get_json(store, key)
        value, generation = (current[0], current[1]) if current else (None, NO_OBJECT)
        new_value = mutate(value)
        if hasattr(new_value, "__await__"):
            new_value = await new_value  # type: ignore[misc]
        try:
            new_generation = await put_json(store, key, new_value, if_generation_match=generation)
        except PreconditionFailed:
            continue
        return new_value, new_generation
    raise ConflictRetriesExhausted(f"gave up updating {key!r} after {retries + 1} conflicting writes")
