"""Process-wide counters behind ``GET /v1/metrics``. No learner data, ever."""

from __future__ import annotations

import threading
from collections import Counter
from datetime import UTC, datetime
from typing import Any, Literal


def _iso_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class Metrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.since = _iso_now()
        self.requests_total = 0
        self.llm_calls_total = 0
        self.llm_calls_by_outcome: Counter[str] = Counter()
        self.prompt_tokens_total = 0
        self.completion_tokens_total = 0
        self.cache_hits = 0
        self.cache_misses = 0
        self.cap_rejections = {"device": 0, "global": 0}

    def record_request(self) -> None:
        with self._lock:
            self.requests_total += 1

    def record_llm_call(self, outcome: str, prompt_tokens: int = 0, completion_tokens: int = 0) -> None:
        """``outcome``: ok | timeout | provider_error | invalid_output | moderated."""
        with self._lock:
            self.llm_calls_total += 1
            self.llm_calls_by_outcome[outcome] += 1
            self.prompt_tokens_total += max(0, int(prompt_tokens or 0))
            self.completion_tokens_total += max(0, int(completion_tokens or 0))

    def record_cache(self, hit: bool) -> None:
        with self._lock:
            if hit:
                self.cache_hits += 1
            else:
                self.cache_misses += 1

    def record_cap_rejection(self, scope: Literal["device", "global"]) -> None:
        with self._lock:
            self.cap_rejections[scope] += 1

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            lookups = self.cache_hits + self.cache_misses
            return {
                "since": self.since,
                "requests_total": self.requests_total,
                "llm_calls_total": self.llm_calls_total,
                "llm_calls_by_outcome": dict(self.llm_calls_by_outcome),
                "prompt_tokens_total": self.prompt_tokens_total,
                "completion_tokens_total": self.completion_tokens_total,
                "cache_hits": self.cache_hits,
                "cache_misses": self.cache_misses,
                "cache_hit_rate": (self.cache_hits / lookups) if lookups else 0.0,
                "cap_rejections": dict(self.cap_rejections),
            }


_metrics: Metrics | None = None


def get_metrics() -> Metrics:
    global _metrics
    if _metrics is None:
        _metrics = Metrics()
    return _metrics


def reset_metrics() -> None:
    global _metrics
    _metrics = None
