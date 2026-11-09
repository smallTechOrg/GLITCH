"""FallbackProvider — try the primary provider, then the backup on provider failure.

Used for "Claude first, OpenRouter as backup". A failed primary call (timeout, network,
5xx, rate limit, rejected key, unknown model, refusal) is retried once on the backup.
``LLMInvalidOutputError`` is NOT retried here: the callers already regenerate once with
the validator's feedback, and a second provider would only double that cost.

Both hops share the request's ``timeout_s`` (the web client aborts soon after it): the
primary gets ``primary_share`` of it and the backup gets whatever is left. When less than
``MIN_BACKUP_S`` remains, the primary's error is raised as-is.
``name``/``model`` describe the primary; ``LLMResult.provider``/``model_used`` say which
hop actually answered.
"""

from __future__ import annotations

import time

from glitch_api.llm.base import LLMError, LLMInvalidOutputError, LLMProvider, LLMRequest, LLMResult
from glitch_api.logging import get_logger


DEFAULT_PRIMARY_SHARE = 0.7
MIN_BACKUP_S = 1.0


class FallbackProvider:
    def __init__(self, primary: LLMProvider, backup: LLMProvider, *, primary_share: float = DEFAULT_PRIMARY_SHARE) -> None:
        if not 0.0 < primary_share <= 1.0:
            raise ValueError("primary_share must be in (0, 1]")
        self.primary = primary
        self.backup = backup
        self.primary_share = primary_share
        self.name = primary.name
        self.model = primary.model

    async def complete(self, request: LLMRequest) -> LLMResult:
        start = time.perf_counter()
        primary_request = request.model_copy(update={"timeout_s": request.timeout_s * self.primary_share})
        try:
            return await self.primary.complete(primary_request)
        except LLMInvalidOutputError:
            raise
        except LLMError as exc:
            remaining = request.timeout_s - (time.perf_counter() - start)
            if remaining < MIN_BACKUP_S:
                raise
            get_logger().warning(
                "llm_fallback",
                purpose=request.purpose,
                from_provider=self.primary.name,
                to_provider=self.backup.name,
                code=exc.code,
                outcome=exc.outcome,
                status=exc.status,
                remaining_s=round(remaining, 2),
            )
            return await self.backup.complete(request.model_copy(update={"timeout_s": remaining}))

    async def aclose(self) -> None:
        try:
            await self.primary.aclose()
        finally:
            await self.backup.aclose()
