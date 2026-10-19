"""SCAFFOLD STUB — slice D replaces this file with the real ``GET /v1/energy``.

Until then it answers with the ``AI_UNAVAILABLE`` envelope so the client takes its
in-world offline path. Keep the module-level ``router`` name: ``main.py`` mounts it.
"""

from __future__ import annotations

from fastapi import APIRouter

from glitch_api.envelope import ApiError

router = APIRouter()


@router.get("/v1/energy")
async def energy() -> None:
    raise ApiError("AI_UNAVAILABLE", message="AI energy is not available yet.")
