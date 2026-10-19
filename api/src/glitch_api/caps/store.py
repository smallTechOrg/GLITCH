"""Counter storage behind the daily AI budgets.

Phase 1: ``MemoryCounterStore`` (one Cloud Run instance, ``--max-instances 1``). Phase 2
swaps in a GCS-backed store behind the same protocol. Every mutation runs under one
``asyncio.Lock`` so check-and-increment is atomic within the process.
"""

from __future__ import annotations

import asyncio
from typing import Protocol, runtime_checkable


@runtime_checkable
class CounterStore(Protocol):
    async def get(self, key: str) -> int: ...

    async def incr_if_below(self, key: str, limit: int) -> tuple[bool, int]:
        """Atomically add 1 when the value is below ``limit``. Returns (incremented, value)."""
        ...

    async def decr(self, key: str) -> int:
        """Atomically subtract 1, never below 0 (a refund). Returns the new value."""
        ...

    async def prune(self, keep_suffix: str) -> None:
        """Drop keys that do not end with ``keep_suffix`` (old UTC days)."""
        ...


class MemoryCounterStore:
    def __init__(self) -> None:
        self._values: dict[str, int] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> int:
        async with self._lock:
            return self._values.get(key, 0)

    async def incr_if_below(self, key: str, limit: int) -> tuple[bool, int]:
        async with self._lock:
            value = self._values.get(key, 0)
            if value >= limit:
                return False, value
            value += 1
            self._values[key] = value
            return True, value

    async def decr(self, key: str) -> int:
        async with self._lock:
            value = max(0, self._values.get(key, 0) - 1)
            if value:
                self._values[key] = value
            else:
                self._values.pop(key, None)
            return value

    async def prune(self, keep_suffix: str) -> None:
        async with self._lock:
            for key in [k for k in self._values if not k.endswith(keep_suffix)]:
                del self._values[key]

    def __len__(self) -> int:
        return len(self._values)


_store: MemoryCounterStore | None = None


def get_counter_store() -> MemoryCounterStore:
    """Process-wide store (used when an app has no store of its own)."""
    global _store
    if _store is None:
        _store = MemoryCounterStore()
    return _store


def reset_counter_store() -> None:
    global _store
    _store = None
