"""SCAFFOLD STUB — slice D replaces this file with the real ``POST /v1/freewrite/evaluate``.

Until then it answers with the ``AI_UNAVAILABLE`` envelope (the body is never read) so the
client takes its in-world offline check. Keep the module-level ``router`` name.
"""

from __future__ import annotations

from fastapi import APIRouter

from glitch_api.envelope import ApiError

router = APIRouter()


@router.post("/v1/freewrite/evaluate")
async def evaluate() -> None:
    raise ApiError("AI_UNAVAILABLE", message="NOVA is not connected yet.")
