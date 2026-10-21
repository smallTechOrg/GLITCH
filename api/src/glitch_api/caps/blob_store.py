"""BlobCounterStore — the durable ``CounterStore`` (Phase 2, slice P2-D2).

Same protocol as ``caps.store.MemoryCounterStore`` (``get`` / ``incr_if_below`` / ``decr`` /
``prune``), backed by the shared ``BlobStore`` (local directory or GCS bucket), so device
energy and the global budget survive restarts, cold starts and multiple instances.

Layout (``spec/data.md`` → Server-side data): one object per UTC day,
``caps/<YYYY-MM-DD>.json`` = ``{"devices": {<sha256(deviceId)[:12]>: n}, "global": n}``.
Only hashed device ids are ever stored (a key whose device part is not a lowercase hex
hash is rejected with ``ValueError``); devices at 0 are dropped from the object.

Counter keys (built by ``EnergyService``): ``device:<hash>:<day>`` and ``global:<day>``.

Atomicity:
- In-process: every read-modify-write runs under one ``asyncio.Lock`` per store instance,
  so a burst inside one server never conflicts with itself.
- Across processes/instances: every write is a conditional put
  (``if_generation_match`` = the generation that was read, ``NO_OBJECT`` for the first
  write of the day). A lost race raises ``PreconditionFailed``; the store re-reads and
  retries up to ``retries`` (default 5) more times with a small jittered backoff, so an
  increment is never lost or applied twice.

Fail closed (``spec/capabilities/durable-ai-budget.md``): when the store is unreachable,
the object is malformed, or the retries are exhausted, ``incr_if_below`` returns
``(False, limit)`` (the AI action is denied — the caller surfaces CAP_DEVICE/CAP_GLOBAL and
the client uses its fallback) and ``get`` reports ``FAIL_CLOSED_COUNT`` (energy shows 0).
A failed refund (``decr``) is logged and dropped — conservative: never over-grants.

Retention: ``prune`` (called by ``EnergyService`` once per UTC day) deletes ``caps/`` objects
more than ``RETENTION_DAYS`` (7) days older than the current day; it is best-effort (errors
are logged, never raised). A GCS bucket lifecycle rule (delete ``caps/`` objects older than
7 days) is the documented belt-and-braces for the bucket.
"""

from __future__ import annotations

import asyncio
import random
import re
from collections.abc import Awaitable, Callable
from datetime import date, timedelta
from typing import Any, Final

from glitch_api.caps.store import CounterStore
from glitch_api.logging import get_logger
from glitch_api.store import store_for
from glitch_api.store.base import (
    NO_OBJECT,
    Blob,
    BlobStore,
    ConflictRetriesExhausted,
    PreconditionFailed,
    StoreError,
    dumps,
)

CAPS_PREFIX: Final = "caps/"
RETENTION_DAYS: Final = 7
DEFAULT_RETRIES: Final = 5
DEFAULT_BACKOFF_S: Final = 0.005
FAIL_CLOSED_COUNT: Final = 1_000_000  # reported by get() when counters cannot be read

_DAY = r"\d{4}-\d{2}-\d{2}"
_DEVICE_KEY = re.compile(rf"^device:([0-9a-f]{{8,64}}):({_DAY})$")
_GLOBAL_KEY = re.compile(rf"^global:({_DAY})$")
_OBJECT_KEY = re.compile(rf"^caps/({_DAY})\.json$")

Doc = dict[str, Any]


def caps_object_key(day: str) -> str:
    return f"{CAPS_PREFIX}{day}.json"


def parse_counter_key(key: str) -> tuple[str, str | None]:
    """``(day, device_hash)`` for a device key, ``(day, None)`` for the global key."""
    if match := _DEVICE_KEY.match(key):
        return match.group(2), match.group(1)
    if match := _GLOBAL_KEY.match(key):
        return match.group(1), None
    # Never echo the key: a malformed device key could contain a raw device id.
    raise ValueError(
        "counter key must be 'device:<hex hash>:<YYYY-MM-DD>' or 'global:<YYYY-MM-DD>'"
    )


def _empty() -> Doc:
    return {"devices": {}, "global": 0}


def _parse_doc(blob: Blob | None) -> Doc:
    if blob is None:
        return _empty()
    try:
        raw = blob.json()
    except (ValueError, UnicodeDecodeError) as exc:
        raise StoreError("caps object is not valid JSON") from exc
    if not isinstance(raw, dict):
        raise StoreError("caps object is not a JSON object")
    total = raw.get("global", 0)
    devices = raw.get("devices", {})
    if (
        not isinstance(total, int)
        or isinstance(total, bool)
        or total < 0
        or not isinstance(devices, dict)
    ):
        raise StoreError("caps object has an invalid shape")
    clean: dict[str, int] = {}
    for device, count in devices.items():
        if (
            not isinstance(device, str)
            or not isinstance(count, int)
            or isinstance(count, bool)
            or count < 0
        ):
            raise StoreError("caps object has an invalid device entry")
        if count:
            clean[device] = count
    return {"devices": clean, "global": total}


def _read(doc: Doc, device: str | None) -> int:
    return int(doc["global"]) if device is None else int(doc["devices"].get(device, 0))


def _write(doc: Doc, device: str | None, value: int) -> Doc:
    new: Doc = {"devices": dict(doc["devices"]), "global": doc["global"]}
    if device is None:
        new["global"] = value
    elif value > 0:
        new["devices"][device] = value
    else:
        new["devices"].pop(device, None)
    return new


class BlobCounterStore:
    """Durable per-UTC-day counters over a ``BlobStore`` (see module docstring)."""

    def __init__(
        self,
        blob: BlobStore,
        *,
        retries: int = DEFAULT_RETRIES,
        backoff_s: float = DEFAULT_BACKOFF_S,
        retention_days: int = RETENTION_DAYS,
        sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep,
    ) -> None:
        self.blob = blob
        self.retries = retries
        self.backoff_s = backoff_s
        self.retention_days = retention_days
        self._sleep = sleep
        self._lock = asyncio.Lock()
        self.conflicts = 0  # precondition failures seen (observability + tests)

    # ---- core read-modify-write ------------------------------------------------------
    async def _update(
        self, day: str, change: Callable[[Doc], tuple[Doc | None, Any]]
    ) -> Any:
        """Apply ``change(doc) -> (new_doc | None, result)`` with a generation precondition.

        ``new_doc`` None means "nothing to write". Raises ``ConflictRetriesExhausted`` after
        ``retries + 1`` lost races, ``StoreError`` on backend/shape failures.
        """
        key = caps_object_key(day)
        async with self._lock:
            for attempt in range(self.retries + 1):
                blob = await self.blob.get(key)
                new_doc, result = change(_parse_doc(blob))
                if new_doc is None:
                    return result
                try:
                    await self.blob.put(
                        key,
                        dumps(new_doc),
                        if_generation_match=blob.generation
                        if blob is not None
                        else NO_OBJECT,
                    )
                except PreconditionFailed:
                    self.conflicts += 1
                    if attempt < self.retries and self.backoff_s > 0:
                        await self._sleep(
                            random.uniform(0, self.backoff_s * (2**attempt))
                        )
                    continue
                return result
        raise ConflictRetriesExhausted(
            f"gave up updating {key!r} after {self.retries + 1} conflicting writes"
        )

    @staticmethod
    def _fail_closed(op: str, exc: Exception) -> None:
        get_logger().warning(
            "caps_store_unavailable", op=op, error_type=type(exc).__name__
        )

    # ---- CounterStore protocol -------------------------------------------------------
    async def get(self, key: str) -> int:
        day, device = parse_counter_key(key)
        try:
            return _read(_parse_doc(await self.blob.get(caps_object_key(day))), device)
        except StoreError as exc:
            self._fail_closed("get", exc)
            return FAIL_CLOSED_COUNT

    async def incr_if_below(self, key: str, limit: int) -> tuple[bool, int]:
        day, device = parse_counter_key(key)

        def change(doc: Doc) -> tuple[Doc | None, tuple[bool, int]]:
            value = _read(doc, device)
            if value >= limit:
                return None, (False, value)
            return _write(doc, device, value + 1), (True, value + 1)

        try:
            return await self._update(day, change)
        except StoreError as exc:  # includes ConflictRetriesExhausted
            self._fail_closed("incr", exc)
            return False, limit

    async def decr(self, key: str) -> int:
        day, device = parse_counter_key(key)

        def change(doc: Doc) -> tuple[Doc | None, int]:
            value = _read(doc, device)
            if value <= 0:
                return None, 0
            return _write(doc, device, value - 1), value - 1

        try:
            return await self._update(day, change)
        except StoreError as exc:
            self._fail_closed("decr", exc)  # refund dropped: never over-grants
            return await self.get(key)

    async def prune(self, keep_suffix: str) -> None:
        """Delete ``caps/<day>.json`` older than ``retention_days`` before the kept day."""
        match = re.search(rf"({_DAY})$", keep_suffix)
        if match is None:
            return
        try:
            cutoff = date.fromisoformat(match.group(1)) - timedelta(
                days=self.retention_days
            )
            for key in await self.blob.list(CAPS_PREFIX):
                found = _OBJECT_KEY.match(key)
                if found and date.fromisoformat(found.group(1)) < cutoff:
                    await self.blob.delete(key)
        except (StoreError, ValueError) as exc:
            self._fail_closed("prune", exc)


# ---- selection ----------------------------------------------------------------------
# Indirection so the test suite can point every app at an isolated directory
# (tests/conftest.py) without changing Settings defaults.
blob_store_for: Callable[[Any], BlobStore] = store_for


def counter_store_for(app: Any) -> CounterStore:
    """The app's counter store: ``app.state.counter_store`` when preset, else a
    ``BlobCounterStore`` over the app's blob store (``GLITCH_BLOB_BACKEND`` local|gcs —
    both persistent). ``MemoryCounterStore`` is only used by injection (tests/tools)."""
    state = app.state
    store = getattr(state, "counter_store", None)
    if store is None:
        store = BlobCounterStore(blob_store_for(app))
        state.counter_store = store
    return store
