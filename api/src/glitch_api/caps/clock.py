"""Injectable clock: ``now()`` → aware UTC datetime, ``monotonic()`` → seconds.

Tests swap in ``FrozenClock`` (tests/conftest.py) via ``app.state.clock``.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Protocol, runtime_checkable


@runtime_checkable
class Clock(Protocol):
    def now(self) -> datetime: ...

    def monotonic(self) -> float: ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)

    def monotonic(self) -> float:
        return time.monotonic()
